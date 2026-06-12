import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from './prisma.js';
import { getIo } from './socket.js';
import { generateDailyArtwork } from './artGenerator.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const BIDDING_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
const AUTO_RESTART_DELAY_MS = 6 * 60 * 60 * 1000; // 6 hours between close and next open

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

// Pending auto-start timer handle
let autoStartTimer = null;

function cancelAutoStart() {
  if (autoStartTimer) {
    clearTimeout(autoStartTimer);
    autoStartTimer = null;
  }
}

function scheduleNextLot(delayMs) {
  cancelAutoStart();
  const clampedDelay = Math.max(0, delayMs);
  if (clampedDelay === 0) {
    console.log('[Scheduler] Auto-starting new lot immediately.');
    setImmediate(async () => {
      const latest = await prisma.lot.findFirst({ orderBy: { lotNumber: 'desc' } });
      const nextNum = latest ? latest.lotNumber + 1 : 1;
      await createNewLot(nextNum);
    });
    return;
  }
  const minutes = Math.round(clampedDelay / 60000);
  console.log(`[Scheduler] Next lot auto-starts in ${minutes} minutes.`);
  autoStartTimer = setTimeout(async () => {
    autoStartTimer = null;
    const latest = await prisma.lot.findFirst({ orderBy: { lotNumber: 'desc' } });
    const nextNum = latest ? latest.lotNumber + 1 : 1;
    await createNewLot(nextNum);
  }, clampedDelay);
}

async function closeActiveLot() {
  const activeLot = await prisma.lot.findFirst({ where: { status: 'active' } });
  if (!activeLot) {
    console.log('[Scheduler] No active lot to close.');
    return;
  }

  const bids = await prisma.bid.findMany({
    where: { lotId: activeLot.id },
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

  const topBid = distinctBidders[0] ?? null;
  const closedAt = new Date();

  await prisma.lot.update({
    where: { id: activeLot.id },
    data: {
      status: 'closed',
      endsAt: closedAt,
      winnerId: null,
      currentPayeeId: topBid?.userId ?? null,
      payeeExpiresAt: topBid ? new Date(Date.now() + 2 * 60 * 60 * 1000) : null,
      paymentStatus: topBid ? 'pending_1st' : null,
    },
  });

  console.log(`[Scheduler] Lot #${activeLot.lotNumber} closed. Highest bidder: ${topBid?.name ?? 'none'}`);

  getIo()?.emit('lot:closed', {
    lotId: activeLot.id,
    winner: topBid
      ? { userId: topBid.userId, name: topBid.name, amount: topBid.amount }
      : null,
  });

  if (topBid?.email) {
    await sendWinnerEmail(topBid, activeLot);
  }
  if (distinctBidders.length > 1 && distinctBidders[1].email) {
    await sendSecondPlaceEmail(distinctBidders[1]);
  }

  // Auto-start next lot after 6-hour gap
  scheduleNextLot(AUTO_RESTART_DELAY_MS);
}

async function createNewLot(lotNumber) {
  // Cancel any pending auto-start since we're starting manually or via auto
  cancelAutoStart();

  const template = LOT_TEMPLATES[(lotNumber - 1) % LOT_TEMPLATES.length];
  const now = new Date();

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
      startsAt: now,
      endsAt: new Date(now.getTime() + BIDDING_DURATION_MS),
      startingBid: 1,
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

  console.log(`[Scheduler] Lot #${lotNumber} created — bidding open for 12 hours.`);
  const totalLots = await prisma.lot.count();
  getIo()?.emit('lot:new', { lot: { ...lot, totalLots } });
}

async function checkPaymentExpirations() {
  const lot = await prisma.lot.findFirst({
    where: { status: 'closed' },
    orderBy: { lotNumber: 'desc' },
  });
  if (!lot) return;

  const hasExpired =
    lot.paymentStatus &&
    lot.paymentStatus.startsWith('pending_') &&
    lot.payeeExpiresAt &&
    new Date() > new Date(lot.payeeExpiresAt);

  if (!hasExpired) return;

  console.log(`[Scheduler] Payment window expired for lot #${lot.lotNumber}, payee: ${lot.currentPayeeId}`);

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
      const second = distinctBidders[1];
      await prisma.lot.update({
        where: { id: lot.id },
        data: {
          currentPayeeId: second.userId,
          payeeExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          paymentStatus: 'pending_2nd',
        },
      });
      console.log(`[Scheduler] Transitioned to 2nd payee: ${second.name}`);
      getIo()?.emit('lot:payee_changed', { lotId: lot.id });
      await sendPaymentLinkEmail(second, lot, '2nd');
    } else {
      await prisma.lot.update({
        where: { id: lot.id },
        data: { currentPayeeId: null, payeeExpiresAt: null, paymentStatus: 'expired' },
      });
      getIo()?.emit('lot:payee_changed', { lotId: lot.id });
    }
  } else if (lot.paymentStatus === 'pending_2nd') {
    if (distinctBidders.length > 2) {
      const third = distinctBidders[2];
      await prisma.lot.update({
        where: { id: lot.id },
        data: {
          currentPayeeId: third.userId,
          payeeExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          paymentStatus: 'pending_3rd',
        },
      });
      console.log(`[Scheduler] Transitioned to 3rd payee: ${third.name}`);
      getIo()?.emit('lot:payee_changed', { lotId: lot.id });
      await sendPaymentLinkEmail(third, lot, '3rd');
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

async function sendWinnerEmail(winner, lot) {
  const { name, email, amount } = winner;
  const { artist } = lot;

  let parsedTitle = lot.title;
  let dateStr = '';
  const lotNo = lot.lotNumber != null 
    ? String(lot.lotNumber).padStart(3, '0') 
    : (lot.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

  try {
    if (lot.artworkHeadline && lot.artworkHeadline.startsWith('{')) {
      const parsed = JSON.parse(lot.artworkHeadline);
      if (parsed.title) parsedTitle = parsed.title;
    }
  } catch (e) {}

  try {
    const rawDate = lot.startsAt || new Date();
    dateStr = new Date(rawDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {}

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Email Mock] Congratulations ${name} (${email})!
Subject: Congratulations! You won today's bid! 🏆
You won "${parsedTitle}" (${dateStr} • Lot ${lotNo}) by ${artist}.
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
          <p style="font-size: 15px; line-height: 1.6; color: #b9b6c4; margin-bottom: 4px;">
            You have won the auction for <strong>${parsedTitle}</strong> by ${artist}!
          </p>
          <p style="font-size: 13px; color: #7d7a8c; margin-top: 0; margin-bottom: 16px;">
            ${dateStr}   •   Lot ${lotNo}   •   Edition 1/1
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
        </div>
      `,
    });
  } catch (err) {
    console.error('[Scheduler] Error sending 2nd place email:', err);
  }
}

async function sendPaymentLinkEmail(bidder, lot, rank) {
  const { name, email, amount } = bidder;
  const { artist } = lot;

  let parsedTitle = lot.title;
  let dateStr = '';
  const lotNo = lot.lotNumber != null 
    ? String(lot.lotNumber).padStart(3, '0') 
    : (lot.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

  try {
    if (lot.artworkHeadline && lot.artworkHeadline.startsWith('{')) {
      const parsed = JSON.parse(lot.artworkHeadline);
      if (parsed.title) parsedTitle = parsed.title;
    }
  } catch (e) {}

  try {
    const rawDate = lot.startsAt || new Date();
    dateStr = new Date(rawDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {}

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Email Mock] PAYMENT OFFER FOR ${rank.toUpperCase()} PLACE: ${name} (${email})
Subject: Your opportunity to claim "${parsedTitle}"! 🏆
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
          <p style="font-size: 15px; line-height: 1.6; color: #b9b6c4; margin-bottom: 4px;">
            The previous bidder failed to make their payment on time. As the next highest bidder, you can now claim <strong>${parsedTitle}</strong> by ${artist}!
          </p>
          <p style="font-size: 13px; color: #7d7a8c; margin-top: 0; margin-bottom: 16px;">
            ${dateStr}   •   Lot ${lotNo}   •   Edition 1/1
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
            Please log in to the website immediately to finalize your payment and claim your drop.
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

  if (activeLot) {
    if (new Date(activeLot.endsAt) < new Date()) {
      // Lot expired while server was down — close it and schedule next lot
      const originalEndsAt = new Date(activeLot.endsAt);
      console.log('[Scheduler] Active lot expired on startup — closing now');
      await closeActiveLot();
      // Adjust the auto-start timer based on original expiry, not now
      const elapsed = Date.now() - originalEndsAt.getTime();
      scheduleNextLot(AUTO_RESTART_DELAY_MS - elapsed);
    }
    // else: lot is still active, let it run naturally
  } else {
    const latestLot = await prisma.lot.findFirst({ orderBy: { lotNumber: 'desc' } });
    if (!latestLot) {
      // First run ever
      await createNewLot(1);
    } else {
      // No active lot — resume the 6h countdown based on when the last lot closed
      const closedAt = new Date(latestLot.endsAt);
      const elapsed = Date.now() - closedAt.getTime();
      scheduleNextLot(AUTO_RESTART_DELAY_MS - elapsed);
    }
  }

  // Every minute: check if active lot has expired naturally
  cron.schedule('* * * * *', async () => {
    const lot = await prisma.lot.findFirst({ where: { status: 'active' } });
    if (lot && new Date(lot.endsAt) < new Date()) {
      console.log('[Scheduler] Lot expired naturally — closing');
      await closeActiveLot();
    }
  });

  // Every minute: check payment window expirations
  cron.schedule('* * * * *', async () => {
    await checkPaymentExpirations();
  });

  console.log('[Scheduler] Event-driven scheduler active — 12h bidding, 6h gap.');
}

export { closeActiveLot, checkPaymentExpirations, createNewLot };
