import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const lots = await prisma.lot.findMany({
    orderBy: { startsAt: 'desc' },
  });
  console.log('--- Lots ---');
  lots.forEach(l => {
    console.log(`Lot #${l.lotNumber} (${l.id}): title="${l.title}", status="${l.status}", startsAt="${l.startsAt}", endsAt="${l.endsAt}", artworkUrl="${l.artworkUrl}"`);
  });
}

main().finally(() => prisma.$disconnect());
