import { PrismaClient } from '@prisma/client';
import { closeActiveLot, createNewLot } from './src/scheduler.js';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Initiating soft database sequence reset to Lot #1 ---');
  
  // Close active lot
  await closeActiveLot();

  // Find the minimum lotNumber currently in the database to avoid unique constraint collisions
  const minLotResult = await prisma.lot.aggregate({
    _min: { lotNumber: true }
  });
  let currentMin = minLotResult._min.lotNumber || 0;
  if (currentMin > 0) currentMin = 0;

  // Find all lots that have a positive lotNumber
  const lotsToUpdate = await prisma.lot.findMany({
    where: { lotNumber: { gt: 0 } },
    orderBy: { lotNumber: 'asc' },
  });

  console.log(`Found ${lotsToUpdate.length} positive lot numbers to re-number.`);

  // Renumber existing lots to unique negative numbers
  for (const lot of lotsToUpdate) {
    currentMin--;
    await prisma.lot.update({
      where: { id: lot.id },
      data: { lotNumber: currentMin },
    });
    console.log(`Renumbered Lot #${lot.lotNumber} -> Lot #${currentMin}`);
  }

  // Create active Lot #1 with empty artwork
  console.log('Creating active Lot #1...');
  await createNewLot(1, { artworkUrl: null, artworkHeadline: null, artworkPrompt: null });
  
  console.log('--- SOFT RESET COMPLETE! ---');
  console.log('Lot #1 is now active. Refresh the page to see the fresh session.');
}

main()
  .catch(err => {
    console.error('Failed to reset database:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
