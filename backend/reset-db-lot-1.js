import { PrismaClient } from '@prisma/client';
import { closeActiveLot, createNewLot } from './src/scheduler.js';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Initiating soft database sequence reset to Lot #1 ---');
  
  // Close active lot
  await closeActiveLot();

  // Find all lots that have a positive lotNumber
  const lotsToUpdate = await prisma.lot.findMany({
    where: { lotNumber: { gt: 0 } },
    orderBy: { lotNumber: 'asc' },
  });

  console.log(`Found ${lotsToUpdate.length} positive lot numbers to re-number.`);

  // Renumber existing lots to negative numbers to avoid unique constraint violations
  for (const lot of lotsToUpdate) {
    await prisma.lot.update({
      where: { id: lot.id },
      data: { lotNumber: -lot.lotNumber },
    });
    console.log(`Renumbered Lot #${lot.lotNumber} -> Lot #${-lot.lotNumber}`);
  }

  // Create active Lot #1
  console.log('Creating active Lot #1...');
  await createNewLot(1);
  
  console.log('--- SOFT RESET COMPLETE! ---');
  console.log('Lot #1 is now active. Refresh the page to see the fresh session.');
}

main()
  .catch(err => {
    console.error('Failed to reset database:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
