import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL ?? '';
const ADMIN_EMAILS = ['harshit.rnnh@gmail.com', 'prabhat1992@gmail.com', 'abmzone@gmail.com'];

const STATUSES = ['processing', 'printing', 'shipped', 'delivered'];

const STATUS_META = {
  processing: { label: 'Processing', bg: 'rgba(230,194,126,0.12)', color: '#e6c27e' },
  printing:   { label: 'Printing',   bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa' },
  shipped:    { label: 'Shipped',    bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
  delivered:  { label: 'Delivered',  bg: 'rgba(34,197,94,0.2)',    color: '#86efac' },
};

function StatusChip({ status }) {
  const m = STATUS_META[status] || STATUS_META.processing;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '3px 10px', borderRadius: 20, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAddress(a) {
  if (!a) return '—';
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: '#7d7a8c', marginBottom: 6, ...style }}>
      {children}
    </div>
  );
}

function TimelineDot({ label, date, done }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: done ? '#4ade80' : '#3d3a4c' }}>{done ? '●' : '○'}</span>
      <span style={{ fontSize: 12, color: done ? '#b9b6c4' : '#4d4a5c' }}>{label}</span>
      {date && <span style={{ fontSize: 11, color: '#7d7a8c', marginLeft: 'auto' }}>{fmtDate(date)}</span>}
    </div>
  );
}

function AdminInput({ label, value, onChange, placeholder, type = 'text', textarea }) {
  const sharedStyle = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#f4f1ea',
    fontSize: 13, padding: '7px 10px', outline: 'none', fontFamily: 'inherit',
  };
  return (
    <div style={{ marginBottom: 10 }}>
      {label && <div style={{ fontSize: 11, color: '#7d7a8c', marginBottom: 4 }}>{label}</div>}
      {textarea ? (
        <textarea value={value} onChange={onChange} placeholder={placeholder} rows={3}
          style={{ ...sharedStyle, resize: 'vertical' }} />
      ) : (
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={sharedStyle} />
      )}
    </div>
  );
}

function OrderRow({ order, expanded, onToggle, onUpdate, token }) {
  const initEdit = () => ({
    status: order.status,
    carrier: order.carrier || '',
    trackingNumber: order.trackingNumber || '',
    trackingUrl: order.trackingUrl || '',
    notes: order.notes || '',
  });

  const [edit, setEdit] = useState(initEdit);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (expanded) setEdit(initEdit());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const set = (k) => (e) => setEdit((prev) => ({ ...prev, [k]: e.target.value }));

  const showMsg = (text, ok) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/orders/${order.id}/tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(edit),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      onUpdate(order.id, data.order);
      showMsg('Saved!', true);
    } catch (err) {
      showMsg(err.message, false);
    }
    setSaving(false);
  };

  const handleResend = async (endpoint, label) => {
    try {
      const r = await fetch(`${API}/api/admin/orders/${order.id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      showMsg(`${label} sent!`, true);
    } catch (err) {
      showMsg(err.message, false);
    }
  };

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 20px',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
    borderBottom: expanded ? 'none' : '1px solid rgba(255,255,255,0.04)',
    transition: 'background 0.15s',
  };

  const btnBase = {
    padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
    color: '#b9b6c4', letterSpacing: '0.04em', transition: 'all 0.15s',
  };

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Collapsed row */}
      <button style={rowStyle} onClick={onToggle}>
        <div style={{ flex: '0 0 110px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e6c27e', fontFamily: 'monospace' }}>
            {order.orderNumber}
          </div>
          <div style={{ fontSize: 11, color: '#7d7a8c' }}>Lot #{order.lot?.lotNumber}</div>
        </div>
        <div style={{ flex: '1 1 160px', overflow: 'hidden' }}>
          <div style={{ fontSize: 13, color: '#f4f1ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.lot?.title ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: '#7d7a8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.user?.name} · {order.user?.email}
          </div>
        </div>
        <div style={{ flex: '0 0 90px', textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f4f1ea', fontFamily: 'monospace' }}>
            ₹{(order.amount / 100).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 11, color: '#7d7a8c' }}>{fmtDate(order.paidAt)}</div>
        </div>
        <div style={{ flex: '0 0 90px', display: 'flex', justifyContent: 'center' }}>
          <StatusChip status={order.status} />
        </div>
        <div style={{ fontSize: 12, color: '#4d4a5c', marginLeft: 4 }}>{expanded ? '▲' : '▼'}</div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ padding: '0 20px 24px', background: 'rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', paddingTop: 20 }}>

            {/* Left column: read-only details */}
            <div style={{ flex: '1 1 240px', minWidth: 220 }}>

              <SectionLabel>Customer</SectionLabel>
              <div style={{ fontSize: 14, color: '#f4f1ea', fontWeight: 600, marginBottom: 2 }}>{order.user?.name}</div>
              <div style={{ fontSize: 12, color: '#b9b6c4', marginBottom: 2 }}>{order.user?.email}</div>
              {order.user?.phone && <div style={{ fontSize: 12, color: '#7d7a8c' }}>{order.user.phone}</div>}

              <SectionLabel style={{ marginTop: 18 }}>Shipping address</SectionLabel>
              <div style={{ fontSize: 13, color: '#f4f1ea', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 600 }}>{order.address?.name}</div>
                <div style={{ color: '#b9b6c4' }}>{fmtAddress(order.address)}</div>
                <div style={{ color: '#7d7a8c' }}>{order.address?.phone}</div>
              </div>

              <SectionLabel style={{ marginTop: 18 }}>Payment</SectionLabel>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e6c27e', fontFamily: 'monospace' }}>
                ₹{(order.amount / 100).toLocaleString('en-IN')}
              </div>
              {order.razorpayPaymentId && (
                <div style={{ fontSize: 11, color: '#4d4a5c', fontFamily: 'monospace', marginTop: 2 }}>
                  {order.razorpayPaymentId}
                </div>
              )}
              {order.vendorOrderId && (
                <div style={{ fontSize: 11, color: '#7d7a8c', marginTop: 4 }}>
                  Vendor ID: <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>{order.vendorOrderId}</span>
                </div>
              )}

              <SectionLabel style={{ marginTop: 18 }}>Timeline</SectionLabel>
              <TimelineDot label="Paid" date={order.paidAt} done />
              <TimelineDot label="Printing" date={order.printedAt} done={!!order.printedAt} />
              <TimelineDot label="Shipped" date={order.shippedAt} done={!!order.shippedAt} />
              <TimelineDot label="Delivered" date={order.deliveredAt} done={!!order.deliveredAt} />
            </div>

            {/* Right column: edit */}
            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
              <SectionLabel>Update fulfillment</SectionLabel>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#7d7a8c', marginBottom: 4 }}>Status</div>
                <select value={edit.status} onChange={set('status')} style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, color: '#f4f1ea', fontSize: 13, padding: '7px 10px', outline: 'none',
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s} style={{ background: '#1a1b2e' }}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>

              <AdminInput label="Carrier" value={edit.carrier} onChange={set('carrier')} placeholder="e.g. Blue Dart, DTDC, Delhivery" />
              <AdminInput label="Tracking number" value={edit.trackingNumber} onChange={set('trackingNumber')} placeholder="1234567890" />
              <AdminInput label="Tracking URL" value={edit.trackingUrl} onChange={set('trackingUrl')} placeholder="https://track.carrier.com/…" />
              <AdminInput label="Internal notes" value={edit.notes} onChange={set('notes')} placeholder="Notes visible only to you…" textarea />

              {edit.trackingUrl && (
                <div style={{ marginBottom: 10 }}>
                  <a href={edit.trackingUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: '#4ade80', textDecoration: 'none' }}>
                    ↗ Open tracking link
                  </a>
                </div>
              )}

              {msg && (
                <div style={{ fontSize: 12, color: msg.ok ? '#4ade80' : '#ff6b7d', marginBottom: 10, fontWeight: 600 }}>
                  {msg.ok ? '✓ ' : '⚠ '}{msg.text}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width: '100%', padding: '9px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 12,
                  background: saving ? 'rgba(230,194,126,0.3)' : 'linear-gradient(90deg, #e6c27e, #f0d49a)',
                  color: '#0c0d15', letterSpacing: '0.04em',
                }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => handleResend('resend-invoice', 'Invoice')} style={btnBase}>
                  Resend invoice
                </button>
                <button onClick={() => handleResend('resend-vendor', 'Vendor email')} style={btnBase}>
                  Resend to vendor
                </button>
              </div>

              {edit.status === 'shipped' && order.status !== 'shipped' && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#4ade80', lineHeight: 1.5,
                  padding: '8px 10px', background: 'rgba(74,222,128,0.06)', borderRadius: 6,
                  border: '1px solid rgba(74,222,128,0.15)' }}>
                  Saving will email the customer their tracking info automatically.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, token, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [globalMsg, setGlobalMsg] = useState('');

  const isAdmin = !authLoading && user && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/');
  }, [authLoading, isAdmin]);

  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/orders`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      setOrders(data.orders || []);
    } catch (_) {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const notify = (msg) => {
    setGlobalMsg(msg);
    setTimeout(() => setGlobalMsg(''), 3000);
  };

  const handleAuctionAction = async (endpoint, label) => {
    try {
      const r = await fetch(`${API}/api/admin/${endpoint}`, {
        method: 'POST',
        headers: authHeader(),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      notify(`${label} — done.`);
      fetchOrders();
    } catch (err) {
      notify(`Error: ${err.message}`);
    }
  };

  const handleUpdate = useCallback((orderId, updatedOrder) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updatedOrder } : o)));
  }, []);

  const stats = useMemo(() => {
    const s = { all: orders.length };
    STATUSES.forEach((st) => { s[st] = orders.filter((o) => o.status === st).length; });
    return s;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        [o.orderNumber, o.user?.name, o.user?.email, o.lot?.title]
          .some((v) => v?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  const tabStyle = (active) => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: 'none', letterSpacing: '0.05em', transition: 'all 0.15s',
    background: active ? 'rgba(230,194,126,0.15)' : 'transparent',
    color: active ? '#e6c27e' : '#7d7a8c',
  });

  const auctionBtnStyle = {
    padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
    textTransform: 'uppercase', cursor: 'pointer', border: '1px solid rgba(230,194,126,0.25)',
    background: 'rgba(230,194,126,0.07)', color: '#e6c27e',
  };

  if (authLoading || !isAdmin) return null;

  return (
    <div className="account-page">
      <div className="auth-bg"><div className="auth-nebula-a" /><div className="auth-nebula-b" /></div>

      <div className="account-card" style={{ maxWidth: 960 }}>
        {/* Header */}
        <div className="account-header">
          <button className="account-back" onClick={() => navigate('/')}>← Back</button>
          <div className="account-title-row">
            <div className="brand-mark" style={{ width: 26, height: 26 }} />
            <h2 className="account-title">Admin</h2>
          </div>
        </div>

        {/* Auction controls */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#7d7a8c', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginRight: 4 }}>Auction</span>
          <button style={auctionBtnStyle} onClick={() => handleAuctionAction('close-bid', 'Bid closed')}>✕ Close bid</button>
          <button style={auctionBtnStyle} onClick={() => handleAuctionAction('new-bid', 'New lot started')}>▶ Start bidding</button>
          {globalMsg && (
            <span style={{ fontSize: 13, color: globalMsg.startsWith('Error') ? '#ff6b7d' : '#4ade80', marginLeft: 4 }}>
              {globalMsg}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
          {[['all', 'All'], ...STATUSES.map((s) => [s, STATUS_META[s].label])].map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)} style={{
              ...tabStyle(statusFilter === key),
              borderRadius: 0, padding: '12px 18px', fontSize: 12,
              borderBottom: statusFilter === key ? '2px solid #e6c27e' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}>
              {label}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>({stats[key] ?? 0})</span>
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 12 }}>
            <button onClick={fetchOrders} style={{ fontSize: 11, color: '#7d7a8c', background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Refresh
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, customer name, email, or product…"
            style={{
              width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#f4f1ea',
              fontSize: 13, padding: '8px 12px', outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Column headers */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', padding: '6px 20px', gap: 12 }}>
            {[['Order #', '110px'], ['Product / Customer', '1 1 160px'], ['Amount', '90px'], ['Status', '90px']].map(
              ([h, w]) => (
                <div key={h} style={{ flex: `0 0 ${w}`, fontSize: 11, color: '#4d4a5c',
                  textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 500 }}>
                  {h}
                </div>
              )
            )}
          </div>
        )}

        {/* Orders */}
        {loading ? (
          <div className="account-empty"><div className="account-empty-text">Loading…</div></div>
        ) : filtered.length === 0 ? (
          <div className="account-empty">
            <div className="account-empty-icon">📦</div>
            <div className="account-empty-text">{search ? 'No orders match your search.' : 'No orders yet.'}</div>
          </div>
        ) : (
          filtered.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              expanded={expanded === order.id}
              onToggle={() => setExpanded(expanded === order.id ? null : order.id)}
              onUpdate={handleUpdate}
              token={token}
            />
          ))
        )}
      </div>
    </div>
  );
}
