import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from './prisma.js';
import { getIo } from './socket.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const LOT_TEMPLATES = [
  {
    title: 'Untitled (Drift No. 7)',
    artist: 'Oxide Atelier',
    description:
      'A one-off wearable artwork — a latent-space bloom, screen-printed in seven passes. Includes a signed provenance token.',
  },
  {
    title: 'Nebula Fade No. 12',
    artist: 'Oxide Atelier',
    description:
      'Deep-field generative print — a cascade of spectral gradients frozen in organic heavyweight cotton.',
  },
  {
    title: 'Stardust Overprint No. 3',
    artist: 'Oxide Atelier',
    description:
      'Seven-layer screen print. AI-generated aurora patterns rendered in photoluminescent ink on natural cotton.',
  },
  {
    title: 'Latent Space No. 19',
    artist: 'Oxide Atelier',
    description:
      'A collision of high-dimensional data mapped to pigment. Each warp and weft carries a unique seed. Signed on the inner tag.',
  },
  {
    title: 'Chromatic Fold No. 2',
    artist: 'Oxide Atelier',
    description:
      'Color-field abstraction printed in ten passes. No two prints from this series are identical.',
  },
  {
    title: 'Signal Noise No. 8',
    artist: 'Oxide Atelier',
    description:
      'Analog noise mapped through a diffusion model and pressed onto organic heavyweight cotton.',
  },
];

async function closeLotAndCreateNew() {
  const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
  if (!activeLot) {
    console.log('[Scheduler] No active lot — creating first one');
    await createNewLot(1);
    return;
  }

  // Find winner (highest bidder)
  const topBid = await prisma.bid.findFirst({
    where: { lotId: activeLot.id },
    orderBy: { amount: 'desc' },
    include: { user: { select: { name: true, email: true } } },
  });

  await prisma.lot.update({
    where: { id: activeLot.id },
    data: {
      status: 'closed',
      winnerId: topBid?.userId ?? null,
    },
  });

  console.log(`[Scheduler] Lot #${activeLot.lotNumber} closed. Winner: ${topBid?.user?.name ?? 'no bids'}`);

  getIo()?.emit('lot:closed', {
    lotId: activeLot.id,
    winner: topBid
      ? { userId: topBid.userId, name: topBid.user.name, amount: topBid.amount }
      : null,
  });

  // Send payment reminder email to winner
  if (topBid?.user?.email) {
    const winnerEmail = topBid.user.email;
    const winnerName = topBid.user.name;
    const winningAmount = topBid.amount;
    const lotTitle = activeLot.title;
    const lotArtist = activeLot.artist;

    if (!process.env.RESEND_API_KEY) {
      console.log(`
============================================================
[Email Mock] Sending payment notification to ${winnerEmail}
Winner Name: ${winnerName}
Winning Bid: ₹${winningAmount.toLocaleString('en-IN')}
Lot: "${lotTitle}" by ${lotArtist}
Action Required: Pay within 2 hours
============================================================
      `);
    } else {
      console.log(`[Scheduler] Sending winner email notification to ${winnerEmail}...`);
      resend.emails.send({
        from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
        to: winnerEmail,
        subject: `Urgent Payment Required: You won "${lotTitle}"! 🏆`,
        html: `
          <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e6c27e; margin-top: 0; font-size: 22px;">Congratulations, ${winnerName}!</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #b9b6c4;">
              You have won the auction for <strong>${lotTitle}</strong> by ${lotArtist}!
            </p>
            
            <div style="background: rgba(230, 194, 126, 0.05); border: 1px solid rgba(230, 194, 126, 0.2); border-radius: 8px; padding: 18px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Item</td>
                  <td style="color: #f4f1ea; font-size: 14px; font-weight: bold; text-align: right; padding-bottom: 8px;">${lotTitle}</td>
                </tr>
                <tr>
                  <td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Your Winning Bid</td>
                  <td style="color: #e6c27e; font-size: 16px; font-weight: bold; text-align: right; padding-bottom: 8px;">₹${winningAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="color: #7d7a8c; font-size: 13px;">Time to Pay</td>
                  <td style="color: #ff6b7d; font-size: 14px; font-weight: bold; text-align: right;">2 Hours (Urgent)</td>
                </tr>
              </table>
            </div>
            
            <p style="font-size: 14px; line-height: 1.6; color: #b9b6c4;">
              To secure your item, please complete your payment of <strong>₹${winningAmount.toLocaleString('en-IN')}</strong> within the next 2 hours.
            </p>
            
            <div style="background: rgba(255, 255, 255, 0.02); border-radius: 6px; padding: 16px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 24px;">
              <h4 style="margin: 0 0 10px 0; color: #e6c27e; font-size: 14px;">Payment Instructions</h4>
              <p style="font-size: 13px; color: #9c99aa; margin: 0 0 8px 0; line-height: 1.5;">
                [DUMMY PAYMENT DETAILS]<br/>
                UPI ID: payment@oxide<br/>
                Bank Transfer: Oxide Auctions Ltd | A/C 1234567890 | IFSC OXID0001234
              </p>
              <p style="font-size: 12px; color: #ff6b7d; margin: 0; font-weight: 500;">
                Please reply to this email with your payment confirmation screenshot once completed.
              </p>
            </div>
            
            <p style="color: #7d7a8c; font-size: 11.5px; margin-bottom: 0; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; text-align: center;">
              Oxide Auction • Generative wearable art series • Thank you for your bid!
            </p>
          </div>
        `,
      }).catch((err) => {
        console.error('[Scheduler] Failed to send winner email via Resend:', err);
      });
    }
  }

  // Create next lot
  const nextLotNumber = activeLot.lotNumber + 1;
  await createNewLot(nextLotNumber);
}

async function createNewLot(lotNumber) {
  const template = LOT_TEMPLATES[(lotNumber - 1) % LOT_TEMPLATES.length];
  const now = new Date();
  const endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const lot = await prisma.lot.create({
    data: {
      ...template,
      lotNumber,
      startsAt: now,
      endsAt,
      startingBid: 100,
      status: 'active',
    },
  });

  console.log(`[Scheduler] New lot #${lotNumber} created: "${lot.title}"`);
  const totalLots = await prisma.lot.count();
  getIo()?.emit('lot:new', { lot: { ...lot, totalLots } });
}

export async function startScheduler() {
  // Handle expired lot on startup
  const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
  if (activeLot && new Date(activeLot.endsAt) < new Date()) {
    console.log('[Scheduler] Found expired lot on startup — rotating now');
    await closeLotAndCreateNew();
  } else if (!activeLot) {
    await createNewLot(1);
  }

  // Every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[Scheduler] Running daily lot rotation');
    await closeLotAndCreateNew();
  });

  console.log('[Scheduler] Daily lot rotation scheduled');
}

/* Admin shortcut for testing — POST /api/admin/rotate */
export { closeLotAndCreateNew };
