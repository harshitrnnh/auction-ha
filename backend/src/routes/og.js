import { Router } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { prisma } from '../prisma.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ARTWORK_DIR = join(__dir, '../../public/artwork');

const router = Router();

/* ------------------------------------------------------------------ *
 * Fetch artwork buffer — mirrors the /api/artwork/:filename proxy logic
 * ------------------------------------------------------------------ */
async function getArtworkBuffer(artworkUrl) {
  if (!artworkUrl) return null;

  // Normalise: strip leading path separators / "artwork/" prefix
  const filename = artworkUrl.replace(/^.*[\\/]/, '');
  const localPath = join(ARTWORK_DIR, filename);

  // 1. Local cache
  if (existsSync(localPath)) {
    const { readFile } = await import('node:fs/promises');
    return readFile(localPath);
  }

  // 2. GCS
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (bucketName) {
    try {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage();
      const [buffer] = await storage.bucket(bucketName).file(`artwork/${filename}`).download();
      await writeFile(localPath, buffer).catch(() => {});
      return buffer;
    } catch { /* fall through */ }
  }

  // 3. Picsum fallback keyed by lot number in filename
  const match = filename.match(/\d+/);
  if (match) {
    const r = await fetch(`https://picsum.photos/seed/${match[0]}/800/800`);
    if (r.ok) {
      const buffer = Buffer.from(await r.arrayBuffer());
      await writeFile(localPath, buffer).catch(() => {});
      return buffer;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Build SVG overlay: gradient + brand + title + artist + bid text
 * ------------------------------------------------------------------ */
function buildOverlaySvg({ title, artist, startingBid, status, lotNumber }) {
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Truncate title to ~36 chars so it fits on one line at 52px
  const displayTitle = title.length > 36 ? title.slice(0, 34) + '…' : title;

  const statusLine = status === 'active'
    ? `Starting at ₹${Number(startingBid).toLocaleString('en-IN')}`
    : status === 'closed'
    ? 'Auction ended'
    : `Drop #${lotNumber}`;

  const statusColor = status === 'active' ? '#f0b429' : 'rgba(255,255,255,0.45)';

  return Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000" stop-opacity="0.05"/>
      <stop offset="45%"  stop-color="#000" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.92"/>
    </linearGradient>
  </defs>

  <!-- Full gradient wash -->
  <rect width="1200" height="630" fill="url(#vg)"/>

  <!-- Top-left brand pill -->
  <rect x="48" y="44" width="98" height="34" rx="17" fill="rgba(255,255,255,0.12)"/>
  <text x="97" y="67" font-family="system-ui,-apple-system,sans-serif"
        font-size="15" fill="white" text-anchor="middle" letter-spacing="3" font-weight="600">OXIDE</text>

  <!-- Lot number top-right -->
  <text x="1152" y="68" font-family="system-ui,-apple-system,sans-serif"
        font-size="15" fill="rgba(255,255,255,0.4)" text-anchor="end" letter-spacing="1">
    Drop #${esc(String(lotNumber))}
  </text>

  <!-- Title -->
  <text x="56" y="518" font-family="system-ui,-apple-system,sans-serif"
        font-size="52" fill="white" font-weight="700">${esc(displayTitle)}</text>

  <!-- Artist -->
  <text x="58" y="565" font-family="system-ui,-apple-system,sans-serif"
        font-size="24" fill="rgba(255,255,255,0.6)">by ${esc(artist)}</text>

  <!-- Status / bid line -->
  <text x="58" y="608" font-family="system-ui,-apple-system,sans-serif"
        font-size="20" fill="${statusColor}">${esc(statusLine)}</text>
</svg>`);
}

/* ------------------------------------------------------------------ *
 * GET /api/og/lot/:id  — returns a 1200×630 PNG
 * ------------------------------------------------------------------ */
router.get('/lot/:id', async (req, res) => {
  try {
    const lot = await prisma.lot.findUnique({ where: { id: req.params.id } });
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    const artworkBuffer = await getArtworkBuffer(lot.artworkUrl);

    const overlay = buildOverlaySvg({
      title: lot.title ?? `Drop #${lot.lotNumber}`,
      artist: lot.artist ?? 'Oxide',
      startingBid: lot.startingBid ?? 1,
      status: lot.status,
      lotNumber: lot.lotNumber,
    });

    let pipeline = artworkBuffer
      ? sharp(artworkBuffer).resize(1200, 630, { fit: 'cover', position: 'center' })
      : sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } });

    const png = await pipeline
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png({ compressionLevel: 6 })
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Length', png.length);
    res.send(png);
  } catch (err) {
    console.error('[OG] image generation failed:', err.message);
    res.status(500).json({ error: 'OG image generation failed' });
  }
});

/* ------------------------------------------------------------------ *
 * GET /api/og/current  — OG image for the live auction room (/)
 * ------------------------------------------------------------------ */
router.get('/current', async (req, res) => {
  try {
    const lot = await prisma.lot.findFirst({
      where: { lotNumber: { gt: 0 } },
      orderBy: { lotNumber: 'desc' },
    });
    if (!lot) return res.redirect('/og-default.png');
    res.redirect(302, `/api/og/lot/${lot.id}`);
  } catch (err) {
    console.error('[OG] current redirect failed:', err.message);
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
