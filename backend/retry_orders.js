import { PrismaClient } from '@prisma/client';
import { notifyVendor } from './src/vendor/qikink.js';

const prisma = new PrismaClient();

async function main() {
  // Find orders where vendorOrderId is null
  const failedOrders = await prisma.order.findMany({
    where: {
      vendorOrderId: null,
    },
    include: {
      lot: true,
      address: true,
    },
  });

  console.log(`Found ${failedOrders.length} orders that have no Qikink vendorOrderId.`);

  for (const order of failedOrders) {
    console.log(`Retrying Qikink submission for order ${order.orderNumber}...`);
    try {
      // Check if we are running in local dev or if we have QIKINK_API_KEY
      if (!process.env.QIKINK_API_KEY) {
        console.log(`[Warning] QIKINK_API_KEY is not configured in your environment. Retrying will trigger local mock email fallback.`);
      }
      const vendorId = await notifyVendor(order, order.lot, order.address);
      if (vendorId) {
        console.log(`SUCCESS: Order ${order.orderNumber} successfully pushed to Qikink. Qikink ID: ${vendorId}`);
      } else {
        console.log(`WARNING: Order ${order.orderNumber} finished processing (triggered mock email or email notify).`);
      }
    } catch (err) {
      console.error(`ERROR: Failed to push order ${order.orderNumber}:`, err.message);
    }
  }
}

main().finally(() => prisma.$disconnect());
