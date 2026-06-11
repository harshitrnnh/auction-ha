import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ addresses });
  } catch (err) {
    console.error('[Addresses] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

router.post('/', async (req, res) => {
  const { name, line1, line2, city, state, pincode, phone } = req.body;
  if (!name || !line1 || !city || !state || !pincode || !phone) {
    return res.status(400).json({ error: 'name, line1, city, state, pincode, phone are required' });
  }

  const existing = await prisma.address.count({ where: { userId: req.userId } });
  const address = await prisma.address.create({
    data: { userId: req.userId, name, line1, line2: line2 || null, city, state, pincode, phone, isDefault: existing === 0 },
  });
  res.status(201).json({ address });
});

router.put('/:id', async (req, res) => {
  const addr = await prisma.address.findUnique({ where: { id: req.params.id } });
  if (!addr || addr.userId !== req.userId) return res.status(404).json({ error: 'Address not found' });

  const { name, line1, line2, city, state, pincode, phone } = req.body;
  const updated = await prisma.address.update({
    where: { id: req.params.id },
    data: { name, line1, line2: line2 ?? null, city, state, pincode, phone },
  });
  res.json({ address: updated });
});

router.delete('/:id', async (req, res) => {
  const addr = await prisma.address.findUnique({ where: { id: req.params.id } });
  if (!addr || addr.userId !== req.userId) return res.status(404).json({ error: 'Address not found' });

  await prisma.address.delete({ where: { id: req.params.id } });

  if (addr.isDefault) {
    const next = await prisma.address.findFirst({ where: { userId: req.userId }, orderBy: { createdAt: 'asc' } });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  res.json({ ok: true });
});

router.put('/:id/default', async (req, res) => {
  const addr = await prisma.address.findUnique({ where: { id: req.params.id } });
  if (!addr || addr.userId !== req.userId) return res.status(404).json({ error: 'Address not found' });

  await prisma.address.updateMany({ where: { userId: req.userId }, data: { isDefault: false } });
  await prisma.address.update({ where: { id: req.params.id }, data: { isDefault: true } });
  res.json({ ok: true });
});

export default router;
