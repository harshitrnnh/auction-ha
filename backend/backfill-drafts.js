import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const lots = await prisma.lot.findMany({
    where: { artworkUrl: { not: null } },
    include: { artworkDrafts: true }
  });

  for (const lot of lots) {
    const hasDraft = lot.artworkDrafts.some(d => d.artworkUrl === lot.artworkUrl);
    if (!hasDraft) {
      await prisma.artworkDraft.create({
        data: {
          lotId: lot.id,
          artworkUrl: lot.artworkUrl,
          artworkHeadline: lot.artworkHeadline,
          artworkPrompt: lot.artworkPrompt,
          createdAt: lot.startsAt,
        }
      });
      console.log(`Backfilled draft for lot ${lot.lotNumber}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
