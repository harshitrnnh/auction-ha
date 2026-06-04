import { generateDailyArtwork } from './artGenerator.js';
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

// Load GCP credentials key if present in env (e.g. for testing)
if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
  try {
    const keyPath = join(tmpdir(), 'gcp-key.json');
    const parsed = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    writeFileSync(keyPath, JSON.stringify(parsed), 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    console.log('[Test GCP] Loaded credentials to:', keyPath);
  } catch (err) {
    console.error('[Test GCP] Failed to write GCP_SERVICE_ACCOUNT_JSON:', err.message);
  }
}

async function test() {
  console.log('--- STARTING GOOGLE CLOUD PIPELINE TEST ---');
  console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT);
  console.log('GCS_BUCKET_NAME:', process.env.GCS_BUCKET_NAME);
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  
  try {
    const res = await generateDailyArtwork(100);
    console.log('--- TEST RESULT ---');
    console.log('Result:', res);
    console.log('--- TEST COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('--- TEST FAILED ---');
    console.error(err);
  }
}

test();
