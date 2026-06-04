import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setIo } from './socket.js';
import authRoutes from './routes/auth.js';
import lotRoutes from './routes/lots.js';
import bidRoutes from './routes/bids.js';
import { startScheduler, closeActiveLot, checkPaymentExpirations } from './scheduler.js';

// Load .env from backend directory
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dir, '../.env'), 'utf8').split('\n');
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"](.*)['"]$/, '$1');
    if (k && !process.env[k]) process.env[k] = v;
  }
} catch { /* env file optional */ }

// Load GCP service account credentials from env variable if present
if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
  try {
    const keyPath = join(tmpdir(), 'gcp-key.json');
    const parsed = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    writeFileSync(keyPath, JSON.stringify(parsed), 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    console.log('[Oxide] Dynamically loaded GCP credentials key to:', keyPath);
  } catch (err) {
    console.error('[Oxide] Failed to parse/write GCP_SERVICE_ACCOUNT_JSON:', err.message);
  }
}

const app = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5190',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});
setIo(io);

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use('/public', express.static(join(__dir, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/lots', bidRoutes);

app.post('/api/admin/rotate', async (_req, res) => {
  await closeActiveLot();
  res.json({ ok: true });
});

app.post('/api/admin/check-expirations', async (_req, res) => {
  await checkPaymentExpirations();
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* Artwork proxy — serves locally cached file OR fetches from GCS on-demand.
   Solves the CORS problem: frontend fetches from this backend, not GCS directly. */
app.get('/api/artwork/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!/^lot-\d+\.png$/.test(filename)) return res.status(400).json({ error: 'Invalid filename' });

  const localPath = join(__dir, '../public/artwork', filename);

  // 1. Try local cache first (fast, works in dev)
  try {
    const { createReadStream } = await import('node:fs');
    const { stat } = await import('node:fs/promises');
    await stat(localPath);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    createReadStream(localPath).pipe(res);
    return;
  } catch { /* not cached locally, fall through to GCS */ }

  const lotNumber = filename.match(/\d+/)[0];

  // 2. Fetch from GCS using storage SDK and stream back
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (bucketName) {
    try {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`artwork/${filename}`);
      
      const [exists] = await file.exists();
      if (exists) {
        const [buffer] = await file.download();
        
        // Save to local cache directory for future requests
        const { writeFile } = await import('node:fs/promises');
        try {
          await writeFile(localPath, buffer);
        } catch (e) {
          console.error('[Artwork Proxy] Failed to cache GCS file locally:', e.message);
        }

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.send(buffer);
        return;
      }
    } catch (gcsErr) {
      console.error('[Artwork Proxy] GCS download failed:', gcsErr.message);
    }
  }

  // 3. Fallback: Fetch a beautiful placeholder based on the lot number, cache it locally, and serve
  try {
    console.log(`[Artwork Proxy] Artwork ${filename} not found in GCS/local. Fetching fallback placeholder...`);
    const fallbackUrl = `https://picsum.photos/seed/${lotNumber}/800/800`;
    const r = await fetch(fallbackUrl);
    if (!r.ok) throw new Error('Picsum fetch failed');

    const buffer = Buffer.from(await r.arrayBuffer());
    
    // Save to local cache directory
    const { writeFile } = await import('node:fs/promises');
    await writeFile(localPath, buffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (fallbackErr) {
    console.error('[Artwork Proxy] Fallback generation failed:', fallbackErr.message);
    res.status(404).json({ error: 'Artwork not found' });
  }
});


io.on('connection', (socket) => {
  socket.on('join:lot', (lotId) => socket.join(`lot:${lotId}`));
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, async () => {
  console.log(`[Oxide] API  →  http://localhost:${PORT}`);
  await startScheduler();
});
// Server reload trigger

