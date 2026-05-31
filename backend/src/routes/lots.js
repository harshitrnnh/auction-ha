import { Router } from 'express';
import { prisma } from '../prisma.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

/* Shape a bid for the API response */
function shapeBid(bid, myUserId) {
  return {
    id: bid.id,
    amount: bid.amount,
    createdAt: bid.createdAt,
    userId: bid.userId,
    userName: bid.user?.name ?? 'Anonymous',
    you: bid.userId === myUserId,
    hue: stringHue(bid.userId),
  };
}

/* Deterministic hue from a string */
function stringHue(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
}

/* GET /api/lots/current */
router.get('/current', optionalAuth, async (req, res) => {
  const lot = await prisma.lot.findFirst({
    where: { status: 'active' },
    orderBy: { startsAt: 'desc' },
  });
  if (!lot) return res.status(404).json({ error: 'No active lot' });

  const bids = await prisma.bid.findMany({
    where: { lotId: lot.id },
    orderBy: { amount: 'desc' },
    take: 50,
    include: { user: { select: { name: true } } },
  });

  const totalLots = await prisma.lot.count();

  const topBid = bids[0] ?? null;
  const currentBid = topBid?.amount ?? lot.startingBid;

  let myBid = null;
  let myStatus = 'none';
  if (req.userId) {
    const mine = bids.filter((b) => b.userId === req.userId);
    if (mine.length > 0) {
      myBid = mine[0].amount;
      myStatus = myBid === currentBid ? 'winning' : 'outbid';
    }
  }

  res.json({
    lot: { ...lot, totalLots },
    currentBid,
    bidCount: bids.length,
    myBid,
    myStatus,
    bids: bids.map((b) => shapeBid(b, req.userId)),
  });
});

/* GET /api/lots/past */
router.get('/past', async (req, res) => {
  const lots = await prisma.lot.findMany({
    where: { status: 'closed' },
    orderBy: { endsAt: 'desc' },
    take: 20,
    include: {
      bids: {
        orderBy: { amount: 'desc' },
        take: 1,
        include: { user: { select: { name: true } } },
      },
    },
  });
  res.json({ lots });
});

/* GET /api/lots/:id */
router.get('/:id', optionalAuth, async (req, res) => {
  const lot = await prisma.lot.findUnique({ where: { id: req.params.id } });
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  const bids = await prisma.bid.findMany({
    where: { lotId: lot.id },
    orderBy: { amount: 'desc' },
    include: { user: { select: { name: true } } },
  });

  const currentBid = bids[0]?.amount ?? lot.startingBid;
  res.json({
    lot,
    currentBid,
    bidCount: bids.length,
    bids: bids.map((b) => shapeBid(b, req.userId)),
  });
});

export default router;
