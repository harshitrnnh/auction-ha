import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setIo } from './socket.js';
import authRoutes from './routes/auth.js';
import lotRoutes from './routes/lots.js';
import bidRoutes from './routes/bids.js';
import { startScheduler, closeLotAndCreateNew } from './scheduler.js';

// Load .env from backend directory
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dir, '../.env'), 'utf8').split('\n');
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    if (k && !process.env[k]) process.env[k] = v;
  }
} catch { /* env file optional */ }

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

app.use('/api/auth', authRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/lots', bidRoutes);

app.post('/api/admin/rotate', async (_req, res) => {
  await closeLotAndCreateNew();
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  socket.on('join:lot', (lotId) => socket.join(`lot:${lotId}`));
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, async () => {
  console.log(`[Oxide] API  →  http://localhost:${PORT}`);
  await startScheduler();
});
