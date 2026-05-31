import cron from 'node-cron';
import { prisma } from './prisma.js';
import { getIo } from './socket.js';

const LOT_TEMPLATES = [
  {
    title: 'Untitled (Drift No. 7)',
    artist: 'Oxide Atelier',
    description:
      'A one-off wearable artwork — a latent-space bloom, screen-printed in seven passes. Includes a signed provenance token.',
  },
  {
    title: 'Nebula Fade No. 12',
    artist: 'Oxide Atelier',
    description:
      'Deep-field generative print — a cascade of spectral gradients frozen in organic heavyweight cotton.',
  },
  {
    title: 'Stardust Overprint No. 3',
    artist: 'Oxide Atelier',
    description:
      'Seven-layer screen print. AI-generated aurora patterns rendered in photoluminescent ink on natural cotton.',
  },
  {
    title: 'Latent Space No. 19',
    artist: 'Oxide Atelier',
    description:
      'A collision of high-dimensional data mapped to pigment. Each warp and weft carries a unique seed. Signed on the inner tag.',
  },
  {
    title: 'Chromatic Fold No. 2',
    artist: 'Oxide Atelier',
    description:
      'Color-field abstraction printed in ten passes. No two prints from this series are identical.',
  },
  {
    title: 'Signal Noise No. 8',
    artist: 'Oxide Atelier',
    description:
      'Analog noise mapped through a diffusion model and pressed onto organic heavyweight cotton.',
  },
];

async function closeLotAndCreateNew() {
  const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
  if (!activeLot) {
    console.log('[Scheduler] No active lot — creating first one');
    await createNewLot(1);
    return;
  }

  // Find winner (highest bidder)
  const topBid = await prisma.bid.findFirst({
    where: { lotId: activeLot.id },
    orderBy: { amount: 'desc' },
    include: { user: { select: { name: true } } },
  });

  await prisma.lot.update({
    where: { id: activeLot.id },
    data: {
      status: 'closed',
      winnerId: topBid?.userId ?? null,
    },
  });

  console.log(`[Scheduler] Lot #${activeLot.lotNumber} closed. Winner: ${topBid?.user?.name ?? 'no bids'}`);

  getIo()?.emit('lot:closed', {
    lotId: activeLot.id,
    winner: topBid
      ? { userId: topBid.userId, name: topBid.user.name, amount: topBid.amount }
      : null,
  });

  // Create next lot
  const nextLotNumber = activeLot.lotNumber + 1;
  await createNewLot(nextLotNumber);
}

async function createNewLot(lotNumber) {
  const template = LOT_TEMPLATES[(lotNumber - 1) % LOT_TEMPLATES.length];
  const now = new Date();
  const endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const lot = await prisma.lot.create({
    data: {
      ...template,
      lotNumber,
      startsAt: now,
      endsAt,
      startingBid: 100,
      status: 'active',
    },
  });

  console.log(`[Scheduler] New lot #${lotNumber} created: "${lot.title}"`);
  const totalLots = await prisma.lot.count();
  getIo()?.emit('lot:new', { lot: { ...lot, totalLots } });
}

export async function startScheduler() {
  // Handle expired lot on startup
  const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
  if (activeLot && new Date(activeLot.endsAt) < new Date()) {
    console.log('[Scheduler] Found expired lot on startup — rotating now');
    await closeLotAndCreateNew();
  } else if (!activeLot) {
    await createNewLot(1);
  }

  // Every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[Scheduler] Running daily lot rotation');
    await closeLotAndCreateNew();
  });

  console.log('[Scheduler] Daily lot rotation scheduled');
}

/* Admin shortcut for testing — POST /api/admin/rotate */
export { closeLotAndCreateNew };
