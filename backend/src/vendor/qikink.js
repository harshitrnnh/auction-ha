import { Resend } from 'resend';
import { prisma } from '../prisma.js';
import { getLotTitle, lotNo, getAppUrl, productImageBlock, ctaButton, emailWrapper } from '../email-helpers.js';

export { getLotTitle } from '../email-helpers.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function notifyVendor(order, lot, address) {
  if (process.env.QIKINK_API_KEY) {
    return await _callQikinkApi(order, lot, address);
  }
  await _sendVendorEmail(order, lot, address);
  return null;
}

async function _callQikinkApi(order, lot, address) {
  try {
    const payload = {
      reference_id: order.orderNumber,
      products: [
        {
          product_id: process.env.QIKINK_PRODUCT_ID || 'tshirt_premium',
          variant: lot.size || 'M',
          quantity: 1,
          design_url: lot.artworkUrl || lot.imageUrl || '',
          print_area: 'front',
        },
      ],
      shipping_address: {
        name: address.name,
        address1: address.line1,
        address2: address.line2 || '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: 'India',
        phone: address.phone,
      },
    };

    const response = await fetch('https://api.qikink.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QIKINK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Qikink API error');

    await prisma.order.update({ where: { id: order.id }, data: { vendorOrderId: data.id || data.order_id } });
    return data.id || data.order_id;
  } catch (err) {
    console.error('[Vendor] Qikink API call failed, falling back to email:', err.message);
    await _sendVendorEmail(order, lot, address);
    return null;
  }
}

async function _sendVendorEmail(order, lot, address) {
  const vendorEmail = process.env.VENDOR_EMAIL;
  const title = getLotTitle(lot);
  const addressText = [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ');
  const appUrl = getAppUrl();

  if (!process.env.RESEND_API_KEY || !vendorEmail) {
    console.log(`
============================================================
[Vendor Email Mock]
To: ${vendorEmail || 'vendor@example.com'}
Subject: New Order: ${order.orderNumber} — ${title}
Order #: ${order.orderNumber} | Lot #${lotNo(lot)}
Product: ${title} — Size: ${lot.size}
Amount: ₹${(order.amount / 100).toLocaleString('en-IN')}
Ship to: ${address.name} · ${addressText} · ${address.phone}
============================================================
    `);
    return;
  }

  await resend.emails.send({
    from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
    to: vendorEmail,
    subject: `New Order: ${order.orderNumber} — ${title}`,
    html: emailWrapper(`
      <h2 style="color: #e6c27e; margin: 0 0 4px;">New Order Received</h2>
      <p style="color: #7d7a8c; font-size: 12px; margin: 0 0 20px; letter-spacing: 0.06em;">Lot #${lotNo(lot)}</p>
      ${productImageBlock(lot)}
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr><td style="color: #7d7a8c; font-size: 13px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">Order #</td>
            <td style="color: #e6c27e; font-weight: 700; text-align: right; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: monospace;">${order.orderNumber}</td></tr>
        <tr><td style="color: #7d7a8c; font-size: 13px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">Product</td>
            <td style="color: #f4f1ea; text-align: right; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">${title}</td></tr>
        <tr><td style="color: #7d7a8c; font-size: 13px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">Size</td>
            <td style="color: #f4f1ea; text-align: right; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">${lot.size || '—'}</td></tr>
        <tr><td style="color: #7d7a8c; font-size: 13px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">Amount</td>
            <td style="color: #e6c27e; font-weight: 700; text-align: right; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">₹${(order.amount / 100).toLocaleString('en-IN')}</td></tr>
        <tr><td style="color: #7d7a8c; font-size: 13px; padding: 8px 0; vertical-align: top;">Ship to</td>
            <td style="color: #f4f1ea; text-align: right; padding: 8px 0; line-height: 1.7;">${address.name}<br>${addressText}<br>${address.phone}</td></tr>
      </table>
      <p style="font-size: 13px; color: #7d7a8c; margin: 0 0 4px;">Please process and ship this order, then update the tracking details.</p>
      ${appUrl ? ctaButton('Manage Orders', `${appUrl}/admin`, '#e6c27e') : ''}
    `),
  });
}

export async function sendShippingEmail(order, lot, address, userEmail, userName) {
  const title = getLotTitle(lot);
  const addressText = [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ');
  const appUrl = getAppUrl();

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Shipping Email Mock] To: ${userEmail}
${title} — Order ${order.orderNumber} shipped via ${order.carrier || 'carrier'} — Tracking: ${order.trackingNumber || 'N/A'}
${order.trackingUrl ? 'Track: ' + order.trackingUrl : ''}
============================================================
    `);
    return;
  }

  const trackingBlock = order.trackingNumber
    ? `<div style="background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.2); border-radius: 8px; padding: 16px; margin: 20px 0;">
        <div style="color: #7d7a8c; font-size: 11px; letter-spacing: 0.08em; margin-bottom: 8px;">TRACKING INFO</div>
        ${order.carrier ? `<div style="color: #b9b6c4; font-size: 13px; margin-bottom: 4px;">Carrier: <strong style="color: #f4f1ea;">${order.carrier}</strong></div>` : ''}
        <div style="color: #4ade80; font-size: 16px; font-weight: 700; font-family: monospace; margin-bottom: 10px;">${order.trackingNumber}</div>
        ${order.trackingUrl ? `<a href="${order.trackingUrl}" style="display: inline-block; padding: 8px 18px; background: rgba(74,222,128,0.15); color: #4ade80; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">Track your package →</a>` : ''}
      </div>`
    : '';

  await resend.emails.send({
    from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
    to: userEmail,
    subject: `Your Oxide order ${order.orderNumber} has shipped! 🚚`,
    html: emailWrapper(`
      <h2 style="color: #4ade80; margin: 0 0 16px; font-size: 20px;">Your order is on its way! 🚚</h2>
      ${productImageBlock(lot)}
      <p style="font-size: 15px; color: #b9b6c4; margin: 0 0 4px;">
        Hi ${userName}, <strong style="color: #f4f1ea;">${title}</strong> has been shipped and is heading to you.
      </p>
      <p style="font-size: 12px; color: #7d7a8c; margin: 0 0 16px; font-family: monospace;">Order #${order.orderNumber}</p>
      ${trackingBlock}
      <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 14px; margin: 20px 0;">
        <div style="color: #7d7a8c; font-size: 11px; letter-spacing: 0.08em; margin-bottom: 8px;">SHIPPING TO</div>
        <div style="color: #f4f1ea; font-size: 14px; line-height: 1.7;">${address.name}<br>
          <span style="color: #b9b6c4;">${addressText}</span><br>
          <span style="color: #7d7a8c;">${address.phone}</span>
        </div>
      </div>
      ${appUrl ? ctaButton('View Your Orders', `${appUrl}/orders`, '#4ade80') : ''}
    `),
  });
}

export async function sendInvoiceEmail(order, lot, address, userEmail, userName) {
  const title = getLotTitle(lot);
  const addressText = [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ');
  const paidDate = new Date(order.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const appUrl = getAppUrl();

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Invoice Email Mock] To: ${userEmail}
${title} — Order ${order.orderNumber} confirmed — ₹${(order.amount / 100).toLocaleString('en-IN')}
============================================================
    `);
    return;
  }

  await resend.emails.send({
    from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
    to: userEmail,
    subject: `Your Oxide order ${order.orderNumber} is confirmed ✦`,
    html: emailWrapper(`
      <h2 style="color: #e6c27e; margin: 0 0 4px; font-size: 20px;">Order Confirmed ✦</h2>
      <p style="font-size: 14px; color: #7d7a8c; margin: 0 0 20px;">Hi ${userName}, your order is confirmed and being prepared.</p>
      ${productImageBlock(lot)}
      <div style="margin-bottom: 6px;">
        <div style="font-size: 18px; font-weight: 700; color: #f4f1ea; line-height: 1.3;">${title}</div>
        ${lot.artist ? `<div style="font-size: 13px; color: #7d7a8c; margin-top: 2px;">by ${lot.artist}</div>` : ''}
        <div style="font-size: 11px; color: #4d4a5c; margin-top: 4px; font-family: monospace; letter-spacing: 0.06em;">
          Lot #${lotNo(lot)} · Edition 1/1${lot.size ? ' · ' + lot.size : ''}
        </div>
      </div>
      <div style="background: rgba(230,194,126,0.05); border: 1px solid rgba(230,194,126,0.15); border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Order Number</td>
              <td style="color: #e6c27e; font-weight: 700; text-align: right; padding-bottom: 8px; font-family: monospace;">${order.orderNumber}</td></tr>
          <tr><td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Amount Paid</td>
              <td style="color: #e6c27e; font-size: 17px; font-weight: 700; text-align: right; padding-bottom: 8px;">₹${(order.amount / 100).toLocaleString('en-IN')}</td></tr>
          <tr><td style="color: #7d7a8c; font-size: 13px;">Date</td>
              <td style="color: #b9b6c4; text-align: right; font-size: 13px;">${paidDate}</td></tr>
        </table>
      </div>
      <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 14px; margin-bottom: 20px;">
        <div style="color: #7d7a8c; font-size: 11px; letter-spacing: 0.08em; margin-bottom: 8px;">SHIPPING TO</div>
        <div style="color: #f4f1ea; font-size: 14px; line-height: 1.7;">${address.name}<br>
          <span style="color: #b9b6c4;">${addressText}</span><br>
          <span style="color: #7d7a8c;">${address.phone}</span>
        </div>
      </div>
      ${appUrl ? ctaButton('View Your Orders', `${appUrl}/orders`) : ''}
      <p style="font-size: 12px; color: #4d4a5c; text-align: center; margin: 16px 0 0;">
        We'll email you again once your item ships with full tracking info.
      </p>
    `),
  });
}
