import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      lot: { select: { title: true, artist: true, lotNumber: true, size: true, artworkHeadline: true } },
      address: true,
    },
  });
  res.json({ orders });
});

router.get('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      lot: true,
      address: true,
    },
  });
  if (!order || order.userId !== req.userId) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

export default router;
