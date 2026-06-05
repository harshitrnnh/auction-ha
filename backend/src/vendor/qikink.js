import { Resend } from 'resend';
import { prisma } from '../prisma.js';

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
          design_url: lot.imageUrl || '',
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

  const addressText = [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ');

  if (!process.env.RESEND_API_KEY || !vendorEmail) {
    console.log(`
============================================================
[Vendor Email Mock]
To: ${vendorEmail || 'vendor@example.com'}
Subject: New Order: ${order.orderNumber} — ${lot.title}
Order #: ${order.orderNumber}
Lot: ${lot.title} (${lot.size})
Amount: ₹${(order.amount / 100).toLocaleString('en-IN')}
Ship to: ${address.name} · ${addressText} · ${address.phone}
============================================================
    `);
    return;
  }

  await resend.emails.send({
    from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
    to: vendorEmail,
    subject: `New Order: ${order.orderNumber} — ${lot.title}`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e6c27e; margin-top: 0;">New Order Received</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="color: #7d7a8c; padding: 6px 0; font-size: 13px;">Order #</td><td style="color: #f4f1ea; font-weight: bold;">${order.orderNumber}</td></tr>
          <tr><td style="color: #7d7a8c; padding: 6px 0; font-size: 13px;">Product</td><td style="color: #f4f1ea;">${lot.title} — Size: ${lot.size}</td></tr>
          <tr><td style="color: #7d7a8c; padding: 6px 0; font-size: 13px;">Amount</td><td style="color: #e6c27e; font-weight: bold;">₹${(order.amount / 100).toLocaleString('en-IN')}</td></tr>
          <tr><td style="color: #7d7a8c; padding: 6px 0; font-size: 13px;">Ship to</td><td style="color: #f4f1ea;">${address.name}<br>${addressText}<br>${address.phone}</td></tr>
        </table>
        <p style="font-size: 13px; color: #7d7a8c; margin-top: 20px;">Please process and ship this order, then update the tracking details at your earliest.</p>
      </div>
    `,
  });
}

export async function sendShippingEmail(order, lot, address, userEmail, userName) {
  const addressText = [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ');

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Shipping Email Mock] To: ${userEmail}
Order ${order.orderNumber} shipped via ${order.carrier || 'carrier'} — Tracking: ${order.trackingNumber || 'N/A'}
${order.trackingUrl ? 'Track: ' + order.trackingUrl : ''}
============================================================
    `);
    return;
  }

  const trackingSection = order.trackingNumber
    ? `<div style="background: rgba(74,222,128,0.05); border: 1px solid rgba(74,222,128,0.2); border-radius: 8px; padding: 14px; margin: 16px 0;">
        <div style="color: #7d7a8c; font-size: 12px; margin-bottom: 6px;">TRACKING INFO</div>
        ${order.carrier ? `<div style="color: #f4f1ea; font-size: 13px; margin-bottom: 4px;">Carrier: <strong>${order.carrier}</strong></div>` : ''}
        <div style="color: #4ade80; font-size: 15px; font-weight: bold; font-family: monospace;">${order.trackingNumber}</div>
        ${order.trackingUrl ? `<a href="${order.trackingUrl}" style="display: inline-block; margin-top: 10px; padding: 8px 16px; background: rgba(74,222,128,0.15); color: #4ade80; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">Track your package →</a>` : ''}
      </div>`
    : '';

  await resend.emails.send({
    from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
    to: userEmail,
    subject: `Your Oxide order ${order.orderNumber} has shipped! 🚚`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4ade80; margin-top: 0;">Your order is on its way!</h2>
        <p style="font-size: 15px; color: #b9b6c4;">Hi ${userName}, <strong>${lot.title}</strong> has been shipped and is heading to you.</p>
        ${trackingSection}
        <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 14px; margin-bottom: 20px;">
          <div style="color: #7d7a8c; font-size: 12px; margin-bottom: 6px;">SHIPPING TO</div>
          <div style="color: #f4f1ea; font-size: 14px; line-height: 1.6;">${address.name}<br>${addressText}<br>${address.phone}</div>
        </div>
        <p style="font-size: 13px; color: #7d7a8c;">Order #: <strong style="color: #e6c27e;">${order.orderNumber}</strong></p>
      </div>
    `,
  });
}

export async function sendInvoiceEmail(order, lot, address, userEmail, userName) {
  const addressText = [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ');
  const paidDate = new Date(order.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  if (!process.env.RESEND_API_KEY) {
    console.log(`
============================================================
[Invoice Email Mock] To: ${userEmail}
Order ${order.orderNumber} confirmed — ₹${(order.amount / 100).toLocaleString('en-IN')}
============================================================
    `);
    return;
  }

  await resend.emails.send({
    from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
    to: userEmail,
    subject: `Your Oxide order ${order.orderNumber} is confirmed`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e6c27e; margin-top: 0;">Order Confirmed ✦</h2>
        <p style="font-size: 15px; color: #b9b6c4;">Hi ${userName}, your order is confirmed and being prepared.</p>
        <div style="background: rgba(230,194,126,0.05); border: 1px solid rgba(230,194,126,0.2); border-radius: 8px; padding: 18px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Order Number</td><td style="color: #e6c27e; font-weight: bold; text-align: right;">${order.orderNumber}</td></tr>
            <tr><td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Item</td><td style="color: #f4f1ea; text-align: right;">${lot.title}</td></tr>
            <tr><td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Size</td><td style="color: #f4f1ea; text-align: right;">${lot.size}</td></tr>
            <tr><td style="color: #7d7a8c; font-size: 13px; padding-bottom: 8px;">Amount Paid</td><td style="color: #e6c27e; font-size: 16px; font-weight: bold; text-align: right;">₹${(order.amount / 100).toLocaleString('en-IN')}</td></tr>
            <tr><td style="color: #7d7a8c; font-size: 13px;">Date</td><td style="color: #f4f1ea; text-align: right;">${paidDate}</td></tr>
          </table>
        </div>
        <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 14px; margin-bottom: 20px;">
          <div style="color: #7d7a8c; font-size: 12px; margin-bottom: 6px;">SHIPPING TO</div>
          <div style="color: #f4f1ea; font-size: 14px; line-height: 1.6;">${address.name}<br>${addressText}<br>${address.phone}</div>
        </div>
        <p style="font-size: 13px; color: #7d7a8c;">We'll email you again once your tee is on its way with tracking details.</p>
      </div>
    `,
  });
}
