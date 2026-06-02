import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getIo } from '../socket.js';

const router = Router();
const MIN_INCREMENT = 50;

function stringHue(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
}

/* POST /api/lots/:id/bids */
router.post('/:id/bids', requireAuth, async (req, res) => {
  const { id: lotId } = req.params;
  const { amount } = req.body;

  const n = Math.round(Number(amount));
  if (!amount || isNaN(n) || n <= 0) {
    return res.status(400).json({ error: 'Invalid bid amount' });
  }

  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  if (lot.status !== 'active') return res.status(400).json({ error: 'This auction has ended' });
  if (new Date(lot.endsAt) < new Date()) {
    return res.status(400).json({ error: 'This auction has ended' });
  }

  // Find current highest bid
  const topBid = await prisma.bid.findFirst({
    where: { lotId },
    orderBy: { amount: 'desc' },
  });
  const expectedAmount = topBid ? topBid.amount + MIN_INCREMENT : lot.startingBid;
  if (n !== expectedAmount) {
    return res.status(400).json({
      error: `Bid must be exactly ₹${expectedAmount.toLocaleString('en-IN')}`,
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true },
  });

  const bid = await prisma.bid.create({
    data: { amount: n, lotId, userId: req.userId },
  });

  const payload = {
    bid: {
      id: bid.id,
      amount: bid.amount,
      createdAt: bid.createdAt,
      lotId,
      userId: req.userId,
      userName: user.name,
      hue: stringHue(req.userId),
    },
  };

  getIo()?.to(`lot:${lotId}`).emit('bid:new', payload);

  res.status(201).json({ bid: payload.bid });
});

export default router;
