import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DeliveryTracker from '../components/lots/DeliveryTracker';

const API = import.meta.env.VITE_API_URL ?? '';

const STATUS_LABELS = {
  processing: 'Order received',
  printing: 'Printing',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const STATUS_STAGE = {
  processing: 0,
  printing: 1,
  shipped: 2,
  delivered: 3,
};

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAddress(a) {
  if (!a) return '';
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
}

function orderToDelivery(order) {
  return {
    stage: STATUS_STAGE[order.status] ?? 0,
    paidOn: fmtDate(order.paidAt),
    printedOn: fmtDate(order.printedAt),
    shippedOn: fmtDate(order.shippedAt),
    deliveredOn: fmtDate(order.deliveredAt),
    eta: null,
    carrier: order.carrier || '—',
    tracking: order.trackingNumber || null,
    address: order.address ? `${order.address.name} · ${fmtAddress(order.address)}` : '—',
    trackingUrl: order.trackingUrl || null,
  };
}

function StatusChip({ status }) {
  const colors = {
    processing: { bg: 'rgba(230,194,126,0.12)', color: '#e6c27e' },
    printing: { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
    shipped: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80' },
    delivered: { bg: 'rgba(34,197,94,0.2)', color: '#86efac' },
  };
  const style = colors[status] || colors.processing;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20, background: style.bg, color: style.color }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function Orders() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/orders`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json();
        setOrders(data.orders || []);
      } catch (_) {}
      setLoading(false);
    })();
  }, [token]);

  return (
    <div className="account-page">
      <div className="auth-bg">
        <div className="auth-nebula-a" />
        <div className="auth-nebula-b" />
      </div>

      <div className="account-card">
        <div className="account-header">
          <button className="account-back" onClick={() => navigate('/')}>← Back</button>
          <div className="account-title-row">
            <img src="/favicon.png" className="brand-mark" style={{ width: 26, height: 26, background: 'none', boxShadow: 'none' }} alt="" />
            <h2 className="account-title">Orders</h2>
          </div>
        </div>

        {loading ? (
          <div className="account-empty">
            <div className="account-empty-text">Loading…</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="account-empty">
            <div className="account-empty-icon">📦</div>
            <div className="account-empty-text">No orders yet</div>
            <div className="account-empty-sub">Orders from auctions you&apos;ve won will appear here.</div>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => {
              const lot = order.lot;
              let parsedTitle = lot?.title || 'Unknown Item';
              let dateStr = '';
              const lotNo = lot?.lotNumber != null 
                ? (lot.lotNumber < 0 ? 'Old ' + Math.abs(lot.lotNumber) : String(lot.lotNumber).padStart(3, '0')) 
                : (lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

              if (lot) {
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
              }

              return (
                <div key={order.id} className="order-item">
                  <button className="order-row" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    <div className="order-row-left">
                      <div className="order-number">{order.orderNumber}</div>
                      <div className="order-title">{parsedTitle}</div>
                      <div className="order-meta">
                        {dateStr && `${dateStr} · `}Lot {lotNo} · ₹{(order.amount / 100).toLocaleString('en-IN')}
                        {order.tshirtSize ? ` · Size ${order.tshirtSize}` : ''}
                      </div>
                    </div>
                  <div className="order-row-right">
                    <StatusChip status={order.status} />
                    <span className="order-chevron">{expanded === order.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded === order.id && (
                  <div className="order-detail">
                    {(order.trackingNumber || order.status !== 'processing') ? (
                      <DeliveryTracker delivery={orderToDelivery(order)} />
                    ) : (
                      <div className="order-processing-msg">
                        <div style={{ fontSize: 13, color: '#b9b6c4', lineHeight: 1.6 }}>
                          Your order is confirmed. We're preparing it for printing — you'll get an email once it ships.
                        </div>
                        <div style={{ marginTop: 12, fontSize: 12, color: '#7d7a8c' }}>
                          Shipping to: {order.address ? `${order.address.name} · ${fmtAddress(order.address)}` : '—'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#7d7a8c', margin: 0 }}>
            Issue with your order?{' '}
            <a href="mailto:support-oxide@chemicalfarmers.com" style={{ color: '#b9b6c4', textDecoration: 'underline' }}>
              support-oxide@chemicalfarmers.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
