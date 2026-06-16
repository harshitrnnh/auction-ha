import { PrismaClient } from '@prisma/client';
import { closeActiveLot, createNewLot } from './src/scheduler.js';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Wiping database to start fresh with Lot #1 ---');
  
  // 1. Delete all orders
  const oCount = await prisma.order.deleteMany({});
  console.log(`Deleted ${oCount.count} orders.`);
  
  // 2. Delete all bids
  const bCount = await prisma.bid.deleteMany({});
  console.log(`Deleted ${bCount.count} bids.`);
  
  // 3. Delete all artwork drafts
  const dCount = await prisma.artworkDraft.deleteMany({});
  console.log(`Deleted ${dCount.count} artwork drafts.`);
  
  // 4. Delete all lots
  const lCount = await prisma.lot.deleteMany({});
  console.log(`Deleted ${lCount.count} lots.`);

  // 5. Create active Lot #1
  console.log('Creating active Lot #1...');
  await createNewLot(1);
  
  console.log('--- WIPE AND RESET COMPLETE! ---');
  console.log('Lot #1 is now active. Refresh the page to see the fresh session.');
}

main()
  .catch(err => {
    console.error('Failed to reset database:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
