import { closeActiveLot, createNewLot } from './scheduler.js';
import { prisma } from './prisma.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// Load .env
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
} catch (e) {
  console.log('No .env found or read error:', e.message);
}

// Load GCP credentials key if present in env
if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
  try {
    const keyPath = join(tmpdir(), 'gcp-key.json');
    const parsed = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    writeFileSync(keyPath, JSON.stringify(parsed), 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  } catch (err) {
    console.error('Failed to write GCP credentials:', err.message);
  }
}

async function runRotation() {
  console.log('--- SIMULATING AUCTION ROTATION (CLOSE ACTIVE + START NEW) ---');
  try {
    // 1. Close current active lot
    await closeActiveLot();
    
    // 2. Find next lot number
    const latestClosed = await prisma.lot.findFirst({
      where: { status: 'closed' },
      orderBy: { lotNumber: 'desc' },
    });
    const nextNum = latestClosed ? latestClosed.lotNumber + 1 : 1;
    
    // 3. Create new lot with fresh daily news artwork
    console.log(`Creating next active Lot #${nextNum}...`);
    await createNewLot(nextNum);
    console.log('--- ROTATION COMPLETED SUCCESSFULLY! Refresh your browser to see the new lot. ---');
  } catch (err) {
    console.error('--- ROTATION FAILED ---');
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

runRotation();
