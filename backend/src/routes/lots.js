import { Router } from 'express';
import { prisma } from '../prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { getIo } from '../socket.js';
import { closeActiveLot, checkPaymentExpirations } from '../scheduler.js';

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

function isBiddingClosedIST() {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hourCycle: 'h23'
    });
    const hour = parseInt(formatter.format(new Date()), 10);
    return hour >= 12 && hour < 18;
  } catch (e) {
    console.error('Error in isBiddingClosedIST:', e);
    return false;
  }
}

/* GET /api/lots/current */
router.get('/current', optionalAuth, async (req, res) => {
  try {
    const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
    if (activeLot) {
      if (new Date(activeLot.endsAt) < new Date() || isBiddingClosedIST()) {
        console.log('[API] Active lot has expired or bidding is closed — closing now');
        await closeActiveLot();
      }
    }
    await checkPaymentExpirations();
  } catch (err) {
    console.error('[API] Error in pre-check active lot:', err);
  }

  const lot = await prisma.lot.findFirst({
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

/* POST /api/lots/simulate-payment */
router.post('/simulate-payment', async (req, res) => {
  try {
    const lot = await prisma.lot.findFirst({
      where: { status: 'closed' },
      orderBy: { startsAt: 'desc' },
    });
    if (!lot) {
      return res.status(400).json({ error: 'No closed lot found to pay.' });
    }
    if (!lot.currentPayeeId) {
      return res.status(400).json({ error: 'No active payment window for this lot.' });
    }

    const updatedLot = await prisma.lot.update({
      where: { id: lot.id },
      data: {
        paymentStatus: 'paid',
        winnerId: lot.currentPayeeId, // set winnerId as the user who paid
      },
    });

    getIo()?.emit('lot:paid', { lotId: lot.id, winnerId: lot.currentPayeeId });

    res.json({ ok: true, lot: updatedLot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to simulate payment' });
  }
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
