import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from './prisma.js';
import { getIo } from './socket.js';
import { generateDailyArtwork } from './artGenerator.js';

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

// Helper to construct IST Date string
function getISTDateString(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'numeric', day: 'numeric'
  });
  const parts = formatter.formatToParts(date);
  const dateMap = {};
  parts.forEach(p => dateMap[p.type] = p.value);
  return `${dateMap.year}-${dateMap.month.padStart(2, '0')}-${dateMap.day.padStart(2, '0')}`;
}

function getBiddingWindowDates(now) {
  // Get current hour in IST
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric'
  });
  const parts = formatter.formatToParts(now);
  const dateMap = {};
  parts.forEach(p => dateMap[p.type] = p.value);
  
  const hour = parseInt(dateMap.hour, 10);
  
  let startDate = new Date(now);
  let endDate = new Date(now);
  
  if (hour < 12) {
    // Bidding started yesterday 6:00 PM, ends today 12:00 PM
    startDate.setDate(startDate.getDate() - 1);
  } else if (hour >= 12 && hour < 18) {
    // In payment window. If we create a lot, treat it as the upcoming one starting today 6:00 PM
    endDate.setDate(endDate.getDate() + 1);
  } else {
    // Bidding started today 6:00 PM, ends tomorrow 12:00 PM
    endDate.setDate(endDate.getDate() + 1);
  }
  
  const startStr = getISTDateString(startDate);
  const endStr = getISTDateString(endDate);
  
  return {
    startsAt: new Date(`${startStr}T18:00:00+05:30`),
    endsAt: new Date(`${endStr}T12:00:00+05:30`)
  };
}

async function closeActiveLot() {
  const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
  if (!activeLot) {
    console.log('[Scheduler] No active lot to close.');
    return;
  }

  // Fetch bids for this lot
  const bids = await prisma.bid.findMany({
    where: { lotId: activeLot.id },
    orderBy: { amount: 'desc' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // Determine top 3 distinct bidders
  const distinctBidders = [];
  const seenUsers = new Set();
  for (const bid of bids) {
    if (!seenUsers.has(bid.userId)) {
      seenUsers.add(bid.userId);
      distinctBidders.push({
        userId: bid.userId,
        name: bid.user.name,
        email: bid.user.email,
        amount: bid.amount,
      });
    }
  }

  const topBid = distinctBidders[0] ?? null;

  // Mark lot as closed
  await prisma.lot.update({
    where: { id: activeLot.id },
    data: {
      status: 'closed',
      winnerId: null, // Reset winnerId; winner is confirmed only upon payment
      currentPayeeId: topBid?.userId ?? null,
      payeeExpiresAt: topBid ? new Date(Date.now() + 2 * 60 * 60 * 1000) : null,
      paymentStatus: topBid ? 'pending_1st' : null,
    },
  });

  console.log(`[Scheduler] Lot #${activeLot.lotNumber} closed. Highest Bidder: ${topBid?.name ?? 'no bids'}`);

  // Emit closed status
  getIo()?.emit('lot:closed', {
    lotId: activeLot.id,
    winner: topBid
      ? { userId: topBid.userId, name: topBid.name, amount: topBid.amount }
      : null,
  });

  // 1. Send Congratulations Email to 1st highest bidder
  if (topBid?.email) {
    await sendWinnerEmail(topBid, activeLot);
  }

  // 2. Send almost-had-it Email to 2nd highest bidder
  if (distinctBidders.length > 1 && distinctBidders[1].email) {
    await sendSecondPlaceEmail(distinctBidders[1]);
  }
}

async function createNewLot(lotNumber) {
  const template = LOT_TEMPLATES[(lotNumber - 1) % LOT_TEMPLATES.length];
  const now = new Date();
  const { startsAt, endsAt } = getBiddingWindowDates(now);

  let art = { artworkUrl: null, artworkHeadline: null, artworkPrompt: null };
  try {
    art = await generateDailyArtwork(lotNumber);
  } catch (err) {
    console.error('[Scheduler] Failed to generate daily artwork:', err.message);
  }

  const lot = await prisma.lot.create({
    data: {
      ...template,
      lotNumber,
      startsAt,
      endsAt,
      startingBid: 100,
      status: 'active',
      winnerId: null,
      currentPayeeId: null,
      payeeExpiresAt: null,
      paymentStatus: null,
      artworkUrl: art.artworkUrl,
      artworkHeadline: art.artworkHeadline,
      artworkPrompt: art.artworkPrompt,
    },
  });

  console.log(`[Scheduler] New lot #${lotNumber} created: "${lot.title}" (Active until 12:00 PM IST next day)`);
  const totalLots = await prisma.lot.count();
  getIo()?.emit('lot:new', { lot: { ...lot, totalLots } });
}

async function checkPaymentExpirations() {
  const lot = await prisma.lot.findFirst({
    where: { status: 'closed' },
    orderBy: { lotNumber: 'desc' },
  });
  if (!lot) return;

  const hasExpired = lot.paymentStatus && 
                     lot.paymentStatus.startsWith('pending_') && 
                     lot.payeeExpiresAt && 
                     new Date() > new Date(lot.payeeExpiresAt);

  if (hasExpired) {
    console.log(`[Scheduler] Payment window expired for lot #${lot.lotNumber}, payee: ${lot.currentPayeeId}`);

    // Fetch bids to find top bidders
    const bids = await prisma.bid.findMany({
      where: { lotId: lot.id },
      orderBy: { amount: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const distinctBidders = [];
    const seenUsers = new Set();
    for (const bid of bids) {
      if (!seenUsers.has(bid.userId)) {
        seenUsers.add(bid.userId);
        distinctBidders.push({
          userId: bid.userId,
          name: bid.user.name,
          email: bid.user.email,
          amount: bid.amount,
        });
      }
    }

    if (lot.paymentStatus === 'pending_1st') {
      if (distinctBidders.length > 1) {
        const secondBidder = distinctBidders[1];
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await prisma.lot.update({
          where: { id: lot.id },
          data: {
            currentPayeeId: secondBidder.userId,
            payeeExpiresAt: expiresAt,
            paymentStatus: 'pending_2nd',
          },
        });
        console.log(`[Scheduler] 1st payee expired. Transitioned to 2nd payee ${secondBidder.name}`);
        getIo()?.emit('lot:payee_changed', { lotId: lot.id });
        await sendPaymentLinkEmail(secondBidder, lot, '2nd');
      } else {
        await prisma.lot.update({
          where: { id: lot.id },
          data: { currentPayeeId: null, payeeExpiresAt: null, paymentStatus: 'expired' },
        });
        getIo()?.emit('lot:payee_changed', { lotId: lot.id });
      }
    } else if (lot.paymentStatus === 'pending_2nd') {
      if (distinctBidders.length > 2) {
        const thirdBidder = distinctBidders[2];
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await prisma.lot.update({
          where: { id: lot.id },
          data: {
            currentPayeeId: thirdBidder.userId,
            payeeExpiresAt: expiresAt,
            paymentStatus: 'pending_3rd',
          },
        });
        console.log(`[Scheduler] 2nd payee expired. Transitioned to 3rd payee ${thirdBidder.name}`);
        getIo()?.emit('lot:payee_changed', { lotId: lot.id });
        await sendPaymentLinkEmail(thirdBidder, lot, '3rd');
      } else {
        await prisma.lot.update({
          where: { id: lot.id },
          data: { currentPayeeId: null, payeeExpiresAt: null, paymentStatus: 'expired' },
        });
        getIo()?.emit('lot:payee_changed', { lotId: lot.id });
      }
    } else if (lot.paymentStatus === 'pending_3rd') {
      await prisma.lot.update({
        where: { id: lot.id },
        data: { currentPayeeId: null, payeeExpiresAt: null, paymentStatus: 'expired' },
      });
      console.log(`[Scheduler] 3rd payee expired. No more settlement slots.`);
      getIo()?.emit('lot:payee_changed', { lotId: lot.id });
    }
  }
}

// Email Sender Helper for 1st Place Winner
async function sendWinnerEmail(winner, lot) {
  const { name, email, amount } = winner;
  const { title, artist } = lot;

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Email Mock] Congratulations ${name} (${email})!
Subject: Congratulations! You won today's bid! 🏆
You won "${title}" by ${artist}.
Winning Bid: ₹${amount.toLocaleString('en-IN')}
Action Required: Pay within 2 hours to claim.
============================================================
    `);
    return;
  }

  try {
    await resend.emails.send({
      from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
      to: email,
      subject: `Congratulations! You won today's bid! 🏆`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e6c27e; margin-top: 0; font-size: 22px;">Congratulations, ${name}!</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #b9b6c4;">
            You have won the auction for <strong>${title}</strong> by ${artist}!
          </p>
          <div style="background: rgba(230, 194, 126, 0.05); border: 1px solid rgba(230, 194, 126, 0.2); border-radius: 8px; padding: 18px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Winning Bid</td>
                <td style="color: #e6c27e; font-size: 16px; font-weight: bold; text-align: right; padding-bottom: 8px;">₹${amount.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style="color: #7d7a8c; font-size: 13px;">Time to Claim</td>
                <td style="color: #ff6b7d; font-size: 14px; font-weight: bold; text-align: right;">2 Hours (Strict deadline)</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #b9b6c4;">
            Please log into the portal immediately to settle your payment. If you do not pay within 2 hours, the opportunity will get transferred to the 2nd highest bidder.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Scheduler] Error sending winner email:', err);
  }
}

// Email Sender Helper for 2nd Place at Bidding End
async function sendSecondPlaceEmail(bidder) {
  const { name, email } = bidder;
  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Email Mock] ALMOST HAD IT: ${name} (${email})
Subject: Oxide Auction: You almost had it! ⚡
The top bidder has 2 hours to pay. If they fail, we will send you a payment link.
============================================================
    `);
    return;
  }

  try {
    await resend.emails.send({
      from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
      to: email,
      subject: `Oxide Auction: You almost had it! ⚡`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e6c27e; margin-top: 0; font-size: 20px;">This was close!</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #b9b6c4;">
            You almost had the product. The top bidder has a 2-hour window to complete their payment.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #b9b6c4;">
            If they do not pay within this time, the opportunity to claim the product shifts to you. We will send you an email with a payment link immediately if that happens — keep an eye on your inbox!
          </p>
          <p style="font-size: 13px; color: #7d7a8c; margin-top: 20px;">
            Otherwise, get ready for the next bid starting in 6 hours (at 6:00 PM IST).
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Scheduler] Error sending 2nd place email:', err);
  }
}

// Email Sender Helper for subsequent Payees
async function sendPaymentLinkEmail(bidder, lot, rank) {
  const { name, email, amount } = bidder;
  const { title } = lot;

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Email Mock] PAYMENT OFFER FOR ${rank.toUpperCase()} PLACE: ${name} (${email})
Subject: Your opportunity to claim "${title}"! 🏆
Previous bidder defaulted. You have 2 hours to pay ₹${amount.toLocaleString('en-IN')}.
============================================================
    `);
    return;
  }

  try {
    await resend.emails.send({
      from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
      to: email,
      subject: `Your opportunity to claim today's drop! 🏆`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e6c27e; margin-top: 0; font-size: 20px;">Your Opportunity has Arrived!</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #b9b6c4;">
            The previous bidder failed to make their payment on time. As the next highest bidder, you can now claim <strong>${title}</strong>!
          </p>
          <div style="background: rgba(230, 194, 126, 0.05); border: 1px solid rgba(230, 194, 126, 0.2); border-radius: 8px; padding: 18px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Claim Price</td>
                <td style="color: #e6c27e; font-size: 16px; font-weight: bold; text-align: right; padding-bottom: 8px;">₹${amount.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style="color: #7d7a8c; font-size: 13px;">Time to Pay</td>
                <td style="color: #ff6b7d; font-size: 14px; font-weight: bold; text-align: right;">2 Hours (Strict deadline)</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #b9b6c4;">
            Please log in to the website immediately to finalize your payment and claim your drop. If you do not pay within 2 hours, the opportunity shifts to the next bidder.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Scheduler] Error sending transition email:', err);
  }
}

export async function startScheduler() {
  const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
  
  // Expiration check on startup
  if (activeLot && new Date(activeLot.endsAt) < new Date()) {
    console.log('[Scheduler] Active lot is expired on startup — closing now');
    await closeActiveLot();
  } else if (!activeLot) {
    // Check if we need to create first lot
    const closedLot = await prisma.lot.findFirst({ orderBy: { startsAt: 'desc' } });
    if (!closedLot) {
      await createNewLot(1);
    }
  }

  // 1. Every day at 12:00 PM noon IST: Close Bidding
  cron.schedule('0 12 * * *', async () => {
    console.log('[Scheduler] Closing active lot (12:00 PM IST)');
    await closeActiveLot();
  }, {
    timezone: "Asia/Kolkata"
  });

  // 2. Every day at 6:00 PM IST: Start New Bidding Lot
  cron.schedule('0 18 * * *', async () => {
    console.log('[Scheduler] Creating new bidding lot (6:00 PM IST)');
    const latestClosed = await prisma.lot.findFirst({
      where: { status: 'closed' },
      orderBy: { lotNumber: 'desc' },
    });
    const nextNum = latestClosed ? latestClosed.lotNumber + 1 : 1;
    await createNewLot(nextNum);
  }, {
    timezone: "Asia/Kolkata"
  });

  // 3. Every minute: Check for payee window expirations (2 hour limit per payee)
  cron.schedule('* * * * *', async () => {
    await checkPaymentExpirations();
  }, {
    timezone: "Asia/Kolkata"
  });

  console.log('[Scheduler] Timezone-aware daily schedules and check loops active.');
}

/* Shortcuts for admin simulation */
export { closeActiveLot, checkPaymentExpirations, createNewLot };
