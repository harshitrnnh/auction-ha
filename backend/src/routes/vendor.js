import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { getIo } from '../socket.js';

const router = Router();

const STATUS_MAP = {
  confirmed: 'processing',
  printing: 'printing',
  printed: 'printing',
  shipped: 'shipped',
  out_for_delivery: 'shipped',
  delivered: 'delivered',
};

/* POST /api/vendor/webhook
 * SPECULATIVE — Qikink's API docs don't mention webhooks. This endpoint may never be called.
 * For real status updates, poll GET /api/order?id={vendorOrderId} on a schedule instead. */
router.post('/webhook', async (req, res) => {
  const secret = process.env.QIKINK_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers['x-qikink-signature'];
    const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' });
  }

  const { reference_id, status, carrier, tracking_number, tracking_url } = req.body;

  const order = await prisma.order.findUnique({ where: { orderNumber: reference_id } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const mappedStatus = STATUS_MAP[status] || order.status;
  const now = new Date();

  const update = { status: mappedStatus };
  if (carrier) update.carrier = carrier;
  if (tracking_number) update.trackingNumber = tracking_number;
  if (tracking_url) update.trackingUrl = tracking_url;
  if (mappedStatus === 'printing' && !order.printedAt) update.printedAt = now;
  if (mappedStatus === 'shipped' && !order.shippedAt) update.shippedAt = now;
  if (mappedStatus === 'delivered' && !order.deliveredAt) update.deliveredAt = now;

  const updated = await prisma.order.update({ where: { id: order.id }, data: update });

  getIo()?.to(`user:${order.userId}`).emit('order:updated', { orderId: order.id, status: mappedStatus });

  res.json({ ok: true, order: updated });
});

export default router;
