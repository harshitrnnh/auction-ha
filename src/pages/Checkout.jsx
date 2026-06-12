import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL ?? '';

function useCountdown(expiresAt) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = new Date(expiresAt) - new Date();
      if (diff <= 0) { setTimeLeft('EXPIRED'); setExpired(true); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return { timeLeft, expired };
}

export default function Checkout() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [lot, setLot] = useState(null);
  const [loadingLot, setLoadingLot] = useState(true);
  const [stage, setStage] = useState('win'); // 'win' | 'address' | 'confirmed'
  const [address, setAddress] = useState({ name: '', line1: '', line2: '', city: '', state: '', pincode: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);

  const { timeLeft, expired } = useCountdown(lot?.payeeExpiresAt);

  let parsedTitle = lot?.title || 'Unknown Item';
  if (lot) {
    try {
      if (lot.artworkHeadline && lot.artworkHeadline.startsWith('{')) {
        const parsed = JSON.parse(lot.artworkHeadline);
        if (parsed.title) parsedTitle = parsed.title;
      }
    } catch (e) {}
  }

  useEffect(() => {
    if (!token) { navigate('/login', { state: { from: '/checkout' } }); return; }
    fetch(`${API}/api/lots/current`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.pendingPayment) {
          setLot(data.pendingPayment);
        } else {
          // No pending payment — go home
          navigate('/');
        }
      })
      .catch(() => navigate('/'))
      .finally(() => setLoadingLot(false));
  }, [token]);

  const handleAddrChange = (e) => setAddress(a => ({ ...a, [e.target.name]: e.target.value }));
  const addrFilled = address.name && address.line1 && address.city && address.pincode;

  const handlePay = async () => {
    setSubmitting(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/lots/simulate-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Payment failed');
      setOrder(data.order);
      setStage('confirmed');
    } catch (err) {
      setError(err.message || 'Payment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingLot) {
    return (
      <div className="account-page">
        <div className="auth-bg"><div className="auth-nebula-a" /><div className="auth-nebula-b" /></div>
        <div className="account-card checkout-card">
          <div className="account-empty"><div className="account-empty-text">Loading…</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <div className="auth-bg">
        <div className="auth-nebula-a" />
        <div className="auth-nebula-b" />
      </div>

      <div className="account-card checkout-card">
        <div className="account-header">
          <button className="account-back" onClick={() => navigate('/')}>← Back to auction</button>
        </div>

        {stage === 'win' && lot && (
          <div className="checkout-stage">
            <div className="checkout-badge">🏆</div>
            <h2 className="checkout-title">You Won the Bid!</h2>
            <p className="checkout-sub">
              Congratulations — you won today's drop: <strong>{parsedTitle}</strong> by {lot.artist}.
              Complete payment within your 2-hour window or the piece passes to the next bidder.
            </p>
            <div className="celebration-timer-box" style={{ margin: '24px 0' }}>
              <div className="celebration-timer-label">Time Remaining to Settle</div>
              <div className="celebration-timer-val">{timeLeft}</div>
            </div>
            <button className="celebration-pay-btn" onClick={() => setStage('address')} disabled={expired}>
              Proceed to Shipping →
            </button>
          </div>
        )}

        {stage === 'address' && lot && (
          <div className="checkout-stage">
            <div className="checkout-badge">📦</div>
            <h2 className="checkout-title">Shipping Details</h2>
            <p className="checkout-sub" style={{ marginBottom: 20 }}>
              Where should we deliver <strong>{parsedTitle}</strong>?
            </p>
            <div className="checkout-form">
              <div className="checkout-row">
                <input className="checkout-input" name="name" placeholder="Full name *" value={address.name} onChange={handleAddrChange} />
                <input className="checkout-input" name="phone" placeholder="Phone number" value={address.phone} onChange={handleAddrChange} />
              </div>
              <input className="checkout-input" name="line1" placeholder="Address line 1 *" value={address.line1} onChange={handleAddrChange} />
              <input className="checkout-input" name="line2" placeholder="Address line 2 (apt, floor…)" value={address.line2} onChange={handleAddrChange} />
              <div className="checkout-row">
                <input className="checkout-input" name="city" placeholder="City *" value={address.city} onChange={handleAddrChange} />
                <input className="checkout-input" name="state" placeholder="State" value={address.state} onChange={handleAddrChange} />
                <input className="checkout-input" name="pincode" placeholder="Pincode *" value={address.pincode} onChange={handleAddrChange} />
              </div>
            </div>

            <div className="celebration-timer-box" style={{ margin: '20px 0 8px' }}>
              <div className="celebration-timer-label">Time Remaining</div>
              <div className="celebration-timer-val" style={{ fontSize: '1.3rem' }}>{timeLeft}</div>
            </div>

            {error && (
              <div className="auth-error" style={{ marginBottom: 16, justifyContent: 'center' }}>
                <span>⚠</span> {error}
              </div>
            )}

            <div className="checkout-actions" style={{ marginTop: 16 }}>
              <button className="celebration-back-btn" onClick={() => setStage('win')}>← Back</button>
              <button
                className="celebration-pay-btn"
                onClick={handlePay}
                disabled={submitting || !addrFilled || expired}
                style={{ flex: 1 }}
              >
                {submitting ? 'Processing…' : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        )}

        {stage === 'confirmed' && order && (
          <div className="checkout-stage">
            <div className="checkout-badge">🎉</div>
            <h2 className="checkout-title">Order Confirmed!</h2>
            <p className="checkout-sub">
              You've claimed <strong>{parsedTitle}</strong>. We'll start printing and ship it your way.
            </p>
            <div className="order-confirm-box" style={{ margin: '24px 0' }}>
              <div className="oc-row">
                <span className="oc-k">Tracking ID</span>
                <span className="oc-v oc-track">{order.trackingId}</span>
              </div>
              <div className="oc-row">
                <span className="oc-k">Amount Paid</span>
                <span className="oc-v">₹{order.amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="oc-row">
                <span className="oc-k">Deliver to</span>
                <span className="oc-v">{address.name}, {address.line1}, {address.city} – {address.pincode}</span>
              </div>
              <div className="oc-row">
                <span className="oc-k">Status</span>
                <span className="oc-v" style={{ color: 'var(--win,#a8e6a3)' }}>Confirmed</span>
              </div>
            </div>
            <div className="checkout-actions">
              <button className="celebration-back-btn" style={{ flex: 1 }} onClick={() => navigate('/')}>
                Back to Auction
              </button>
              <button className="celebration-pay-btn" style={{ flex: 1 }} onClick={() => navigate('/orders')}>
                View My Orders →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
