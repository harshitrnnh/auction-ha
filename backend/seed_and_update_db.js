import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// Load .env
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dir, '.env'), 'utf8').split('\n');
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"](.*)['"]$/, '$1');
    if (k && !process.env[k]) process.env[k] = v;
  }
} catch {}

const prisma = new PrismaClient();

async function main() {
  console.log("--- DATABASE POPULATION & UPDATE SEQUENCE ---");

  // 1. Create default mock user if none exists
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'mockwinner@example.com',
        name: 'Anonymous Winner',
      }
    });
    console.log("Created mock user:", user.email);
  } else {
    console.log("Using existing user:", user.email);
  }

  const now = new Date();

  // 2. Define Lots templates and data
  const lotConfigs = [
    {
      lotNumber: 1,
      title: 'Untitled (Drift No. 7)',
      artist: 'Oxide Atelier',
      description: 'A one-off wearable artwork — a latent-space bloom, screen-printed in seven passes.',
      startsAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      endsAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
      status: 'closed',
      startingBid: 100,
      paymentStatus: 'paid',
      soldPrice: 800,
      bidCount: 8,
    },
    {
      lotNumber: 2,
      title: 'Nebula Fade No. 12',
      artist: 'Oxide Atelier',
      description: 'Deep-field generative print — a cascade of spectral gradients.',
      startsAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
      endsAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
      status: 'closed',
      startingBid: 100,
      paymentStatus: 'paid',
      soldPrice: 1250,
      bidCount: 12,
    },
    {
      lotNumber: 3,
      title: 'Stardust Overprint No. 3',
      artist: 'Oxide Atelier',
      description: 'Seven-layer screen print with photoluminescent ink.',
      startsAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
      endsAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
      status: 'closed',
      startingBid: 100,
      paymentStatus: 'paid',
      soldPrice: 1350,
      bidCount: 14,
    },
    {
      lotNumber: 4,
      title: 'Lucky Tiger Celebration Scroll',
      artist: 'Oxide Atelier',
      description: 'Unique piece · 1 of 1 · never reprinted.',
      startsAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
      endsAt: now,
      status: 'closed',
      startingBid: 700,
      paymentStatus: 'paid',
      soldPrice: 1550,
      bidCount: 18,
    }
  ];

  for (const config of lotConfigs) {
    let lot = await prisma.lot.findUnique({
      where: { lotNumber: config.lotNumber }
    });

    if (!lot) {
      lot = await prisma.lot.create({
        data: {
          lotNumber: config.lotNumber,
          title: config.title,
          artist: config.artist,
          description: config.description,
          startsAt: config.startsAt,
          endsAt: config.endsAt,
          status: config.status,
          startingBid: config.startingBid,
          paymentStatus: config.paymentStatus,
          soldPrice: config.soldPrice,
          winnerId: user.id,
          currentPayeeId: user.id,
        }
      });
      console.log(`Created Lot #${config.lotNumber} (${lot.id})`);
    } else {
      lot = await prisma.lot.update({
        where: { id: lot.id },
        data: {
          status: config.status,
          paymentStatus: config.paymentStatus,
          soldPrice: config.soldPrice,
          winnerId: user.id,
          currentPayeeId: user.id,
        }
      });
      console.log(`Updated Lot #${config.lotNumber} (${lot.id}) with soldPrice: ${config.soldPrice}`);
    }

    // Generate bids
    await prisma.bid.deleteMany({ where: { lotId: lot.id } });

    const bidsToCreate = [];
    const minAmount = config.startingBid;
    const maxAmount = config.soldPrice;
    const count = config.bidCount;

    for (let j = 0; j < count; j++) {
      // Linearly interpolate bid amounts up to final sold price
      const amount = count === 1 
        ? maxAmount 
        : Math.round(minAmount + (j * (maxAmount - minAmount) / (count - 1)));
      
      bidsToCreate.push({
        lotId: lot.id,
        userId: user.id,
        amount: amount,
        createdAt: new Date(config.startsAt.getTime() + (j + 1) * 60 * 1000),
      });
    }

    await prisma.bid.createMany({
      data: bidsToCreate
    });
    console.log(`Generated ${count} bids for Lot #${config.lotNumber} (ending at ${maxAmount})`);
  }

  console.log("--- DB UPDATED SUCCESSFULLY ---");
}

main()
  .catch(err => {
    console.error("Error updating database:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
