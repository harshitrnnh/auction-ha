import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { io as socketIO } from 'socket.io-client';
import { useAuth } from './contexts/AuthContext';
import Starfield from './components/Starfield';
import Stage from './components/Stage';
import BidRail from './components/BidRail';
import UserMenu from './components/UserMenu';

const API = import.meta.env.VITE_API_URL ?? '';

const pad = (n) => String(n).padStart(2, '0');

function getISTParts() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23'
  });
  const str = formatter.format(now);
  const [hStr, mStr, sStr] = str.split(':');
  return {
    hour: parseInt(hStr, 10),
    minute: parseInt(mStr, 10),
    second: parseInt(sStr, 10)
  };
}

function checkBiddingClosed() {
  try {
    const parts = getISTParts();
    return parts.hour >= 12 && parts.hour < 18; // Closed 12:00 PM to 6:00 PM IST
  } catch (e) {
    console.error('Error checking bidding closed:', e);
    return false;
  }
}

function getCountdownTarget(isClosed) {
  try {
    const now = new Date();
    // Get current year, month, date, and hour in Asia/Kolkata
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(now);
    const dateMap = {};
    parts.forEach(p => dateMap[p.type] = p.value);
    
    const y = parseInt(dateMap.year, 10);
    const m = parseInt(dateMap.month, 10);
    const d = parseInt(dateMap.day, 10);
    const h = parseInt(dateMap.hour, 10);

    if (isClosed) {
      // Bidding is closed (between 12:00 PM and 6:00 PM IST). 
      // Next auction starts at 6:00 PM IST today.
      const target = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T18:00:00+05:30`;
      return new Date(target).getTime();
    } else {
      // Bidding is active (either >= 18:00 today or < 12:00 today).
      // If hour >= 18, it ends at 12:00 PM tomorrow.
      // If hour < 12, it ends at 12:00 PM today.
      let targetDate = new Date(now);
      if (h >= 18) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      
      const targetParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: 'numeric', day: 'numeric'
      }).formatToParts(targetDate);
      
      const tmMap = {};
      targetParts.forEach(p => tmMap[p.type] = p.value);
      const ty = parseInt(tmMap.year, 10);
      const tm = parseInt(tmMap.month, 10);
      const td = parseInt(tmMap.day, 10);

      const target = `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}T12:00:00+05:30`;
      return new Date(target).getTime();
    }
  } catch (e) {
    console.error('Error calculating countdown target:', e);
    const now = new Date();
    // Safe fallback: 6:00 PM IST today = 12:30 UTC today
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 30, 0);
  }
}

function useCountdown(lotClosed) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const targetMs = getCountdownTarget(lotClosed);
  const ms = Math.max(0, targetMs - Date.now());
  const total = Math.floor(ms / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    total,
  };
}


export default function App() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [lot, setLot] = useState(null);
  const [bids, setBids] = useState([]);
  const [currentBid, setCurrentBid] = useState(0);
  const [myBid, setMyBid] = useState(null);
  const [status, setStatus] = useState('none');
  const [bump, setBump] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [winner, setWinner] = useState(null);
  const [watching, setWatching] = useState(0);

  const myBidRef = useRef(myBid);
  myBidRef.current = myBid;

  // Simulate a viewer count: seed from bid activity, drift slowly over time
  useEffect(() => {
    if (!lot) return;
    const base = 8 + bids.length * 3;
    setWatching(base + Math.floor(Math.random() * 6));
    const id = setInterval(() => {
      setWatching((n) => Math.max(1, n + (Math.random() < 0.4 ? 1 : -1)));
    }, 7000);
    return () => clearInterval(id);
  }, [lot?.id, bids.length]);

  const lotClosed = lot?.status === 'closed' || checkBiddingClosed();
  const cd = useCountdown(lotClosed);
  const flash = () => { setBump(true); setTimeout(() => setBump(false), 520); };

  const fetchLot = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`${API}/api/lots/current`, { headers });
      if (!r.ok) { setError('No active lot right now.'); return; }
      const data = await r.json();
      setLot(data.lot);
      setBids(data.bids);
      setCurrentBid(data.currentBid);
      setMyBid(data.myBid ?? null);
      setStatus(data.myStatus ?? 'none');

      // Initialize winner state from the highest bid if the lot is closed
      const isClosed = data.lot.status === 'closed' || checkBiddingClosed();
      if (isClosed && data.bids && data.bids.length > 0) {
        const top = data.bids[0];
        setWinner({
          userId: top.userId,
          name: top.userName || top.name,
          amount: top.amount
        });
      } else {
        setWinner(null);
      }
    } catch {
      setError('Could not connect to the auction server.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!user) {
      setMyBid(null);
      setStatus('none');
    }
  }, [user]);

  useEffect(() => { fetchLot(); }, [fetchLot]);

  // Socket.io — join lot room for real-time bid updates
  useEffect(() => {
    if (!lot) return;
    const socket = API
      ? socketIO(API, { path: '/socket.io' })
      : socketIO({ path: '/socket.io' });

    socket.emit('join:lot', lot.id);

    socket.on('bid:new', ({ bid }) => {
      flash();
      const isMe = bid.userId === user?.id;
      setBids((prev) => [{ ...bid, you: isMe }, ...prev]);
      setCurrentBid(bid.amount);
      if (isMe) {
        setMyBid(bid.amount);
        setStatus('winning');
      } else if (myBidRef.current !== null && bid.amount > myBidRef.current) {
        setStatus('outbid');
      }
    });

    socket.on('lot:closed', ({ winner: w }) => {
      setLot((prev) => prev ? { ...prev, status: 'closed' } : prev);
      setWinner(w);
    });

    socket.on('lot:new', ({ lot: newLot }) => {
      setLot(newLot);
      setBids([]);
      setCurrentBid(newLot.startingBid);
      setMyBid(null);
      setStatus('none');
      setWinner(null);
    });

    socket.on('lot:payee_changed', () => {
      fetchLot();
    });

    socket.on('lot:paid', () => {
      fetchLot();
    });

    return () => socket.disconnect();
  }, [lot?.id, user?.id]);

  const placeBid = useCallback(async (amount) => {
    if (!user) { navigate('/login', { state: { from: '/' } }); return; }
    const r = await fetch(`${API}/api/lots/${lot.id}/bids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount }),
    });
    if (!r.ok) {
      const data = await r.json();
      throw new Error(data.error || 'Bid failed');
    }
    // Socket.io will push the update to all clients including us
  }, [user, lot?.id, token, navigate]);

  const handleAdminReset = async () => {
    const pwd = prompt('Enter admin reset password:');
    if (!pwd) return;
    if (pwd !== 'cron1212') {
      alert('Invalid password!');
      return;
    }
    
    try {
      const response = await fetch(`${API}/api/admin/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: pwd }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Reset failed');
      }
      
      alert('Auction reset successful! A new lot with generated AI artwork has been drop-created.');
      fetchLot();
    } catch (err) {
      alert(`Error resetting auction: ${err.message}`);
    }
  };

  const scrollToBid = () => {
    const el = document.querySelector('.bidrail');
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 70, behavior: 'smooth' });
  };

  const urgent = cd.total < 300 && cd.total > 0 && !lotClosed;
  const minInc = 50;
  const startingBid = lot?.startingBid ?? 100;

  const auction = {
    lot, startingBid, currentBid, minInc, myBid, status, bids,
    placeBid, bump, user, winner, watching, lotClosed,
    onLoginPrompt: () => navigate('/login', { state: { from: '/' } }),
  };

  if (loading) {
    return (
      <div className="app">
        <Starfield />
        <div className="app-loading">
          <div className="brand-mark" style={{ width: 40, height: 40, marginBottom: 16 }} />
          <span>Loading auction…</span>
        </div>
      </div>
    );
  }

  if (error && !lot) {
    return (
      <div className="app">
        <Starfield />
        <div className="app-loading">
          <div className="brand-mark" style={{ width: 40, height: 40, marginBottom: 16 }} />
          <span style={{ color: 'var(--txt-mute)' }}>{error}</span>
          <button className="app-retry" onClick={fetchLot}>Retry</button>
        </div>
      </div>
    );
  }

  const showCelebration = lot?.status === 'closed' &&
                          user &&
                          lot.currentPayeeId === user.id &&
                          lot.paymentStatus?.startsWith('pending_') &&
                          lot.payeeExpiresAt &&
                          new Date(lot.payeeExpiresAt) > new Date();

  return (
    <div className="app">
      <Starfield />
      {showCelebration && (
        <CelebrationOverlay
          lot={lot}
          token={token}
          onPaymentSuccess={() => {
            fetchLot();
          }}
        />
      )}

      <header className="topbar">
        <div className="brand">
          {user ? (
            <UserMenu user={user} logout={logout} />
          ) : (
            <div className="brand-mark" />
          )}
          <div>
            <div className="brand-name">Oxide</div>
            {lot && (
              <div className="brand-lot-wrap">
                <span className="brand-lot num">
                  Lot {String(lot.lotNumber).padStart(3, '0')} / {String(lot.totalLots || lot.lotNumber).padStart(3, '0')}
                </span>
                <Link to="/lots" className="brand-view-all">View all lots →</Link>
              </div>
            )}
          </div>
          {!user && (
            <button className="pill auth-pill" onClick={() => navigate('/login')}>
              Sign in to bid
            </button>
          )}
        </div>

        <div className={'countdown' + (urgent ? ' urgent' : '')}>
          <span className="countdown-label">
            {lotClosed ? 'Next auction starts in' : urgent ? 'Ending soon' : 'Auction ends in'}
          </span>
          <span className="countdown-time num">
            {cd.h > 0 && <><span>{pad(cd.h)}</span><span className="u">h</span></>}
            <span>{pad(cd.m)}</span><span className="u">m</span>
            <span>{pad(cd.s)}</span><span className="u">s</span>
          </span>
        </div>
      </header>

      <div className="stage-wrap">
        <Stage modelCount={3} lot={lot} />
      </div>

      <BidRail auction={auction} />

      <div className="mobile-bidbar">
        <div className="mb-info">
          <div className="k">{status === 'outbid' ? "You've been outbid" : 'Current bid'}</div>
          <div className="v num" style={{ color: status === 'outbid' ? 'var(--lose)' : 'var(--txt)' }}>
            ₹{currentBid.toLocaleString('en-IN')}
          </div>
        </div>
        <button
          className="mb-btn"
          onClick={user ? scrollToBid : () => navigate('/login', { state: { from: '/' } })}
        >
          {!user ? 'Sign in to bid' : myBid === null ? 'Place bid' : 'Raise bid'}
        </button>
      </div>

      {/* Floating admin reset button */}
      <button 
        onClick={handleAdminReset}
        style={{
          position: 'fixed',
          left: '20px',
          bottom: '80px',
          zIndex: 1000,
          background: 'rgba(22, 19, 31, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: 'var(--txt-mute, #7d7a8c)',
          padding: '8px 12px',
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '10px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(8px)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#e6c27e';
          e.currentTarget.style.color = '#e6c27e';
          e.currentTarget.style.boxShadow = '0 0 15px rgba(230, 194, 126, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
          e.currentTarget.style.color = 'var(--txt-mute, #7d7a8c)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        ⟳ Reset Drop
      </button>
    </div>
  );
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function AddressForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', line1: '', line2: '', city: '', state: '', pincode: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API}/api/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to save address');
      onSave(data.address);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="celebration-addr-form">
      <div className="celebration-addr-row">
        <input className="celebration-input" placeholder="Full name" value={form.name} onChange={set('name')} required />
        <input className="celebration-input" placeholder="Phone" value={form.phone} onChange={set('phone')} required />
      </div>
      <input className="celebration-input" placeholder="Address line 1" value={form.line1} onChange={set('line1')} required />
      <input className="celebration-input" placeholder="Address line 2 (optional)" value={form.line2} onChange={set('line2')} />
      <div className="celebration-addr-row">
        <input className="celebration-input" placeholder="City" value={form.city} onChange={set('city')} required />
        <input className="celebration-input" placeholder="State" value={form.state} onChange={set('state')} required />
        <input className="celebration-input" placeholder="Pincode" value={form.pincode} onChange={set('pincode')} required />
      </div>
      {err && <div className="auth-error" style={{ marginBottom: '8px', justifyContent: 'center' }}><span>⚠</span> {err}</div>}
      <div className="celebration-addr-actions">
        <button type="button" className="celebration-cancel-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="celebration-pay-btn" disabled={saving}>{saving ? 'Saving…' : 'Save address'}</button>
      </div>
    </form>
  );
}

function CelebrationOverlay({ lot, token, onPaymentSuccess }) {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState('');
  const [step, setStep] = useState('address'); // 'address' | 'paying' | 'paid'
  const [addresses, setAddresses] = useState([]);
  const [selectedAddr, setSelectedAddr] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loadingAddrs, setLoadingAddrs] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!lot?.payeeExpiresAt) return;
    const updateTimer = () => {
      const diff = new Date(lot.payeeExpiresAt) - new Date();
      if (diff <= 0) {
        setTimeLeft('EXPIRED');
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lot?.payeeExpiresAt]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/addresses`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json();
        const list = data.addresses || [];
        setAddresses(list);
        const def = list.find((a) => a.isDefault) || list[0] || null;
        setSelectedAddr(def?.id ?? null);
        if (list.length === 0) setShowForm(true);
      } catch (_) {}
      setLoadingAddrs(false);
    })();
  }, [token]);

  const handleNewAddress = (addr) => {
    setAddresses((prev) => [...prev, addr]);
    setSelectedAddr(addr.id);
    setShowForm(false);
  };

  const handlePay = async () => {
    if (!selectedAddr) return;
    setError('');
    setStep('paying');

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError('Could not load Razorpay. Check your internet connection.');
      setStep('address');
      return;
    }

    try {
      const r = await fetch(`${API}/api/lots/create-razorpay-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to create order');

      const rzp = new window.Razorpay({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        order_id: data.razorpayOrderId,
        amount: data.amount,
        currency: data.currency,
        name: 'Oxide Atelier',
        description: data.lotTitle,
        theme: { color: '#e6c27e' },
        handler: async (response) => {
          try {
            const vr = await fetch(`${API}/api/lots/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                addressId: selectedAddr,
              }),
            });
            const vdata = await vr.json();
            if (!vr.ok) throw new Error(vdata.error || 'Verification failed');
            setStep('paid');
            onPaymentSuccess?.();
          } catch (err) {
            setError(err.message || 'Payment verification failed');
            setStep('address');
          }
        },
        modal: {
          ondismiss: () => setStep('address'),
        },
      });
      rzp.open();
    } catch (err) {
      setError(err.message || 'Payment failed');
      setStep('address');
    }
  };

  return (
    <div className="celebration-overlay">
      <div className="celebration-card">
        {step === 'paid' ? (
          <>
            <div className="celebration-badge">🎉</div>
            <h2 className="celebration-title">Payment Confirmed!</h2>
            <p className="celebration-text" style={{ marginBottom: '24px' }}>
              You have successfully claimed <strong>{lot.title}</strong>. A confirmation email is on its way.
            </p>
            <button className="celebration-pay-btn" onClick={() => navigate('/orders')}>
              View your order →
            </button>
          </>
        ) : (
          <>
            <div className="celebration-badge">🏆</div>
            <h2 className="celebration-title">You Won the Bid!</h2>
            <p className="celebration-text">
              Congratulations! You won today's drop: <strong>{lot.title}</strong>.
              Complete payment within the next 2 hours to claim it.
            </p>

            <div className="celebration-timer-box">
              <div className="celebration-timer-label">Time Remaining to Settle</div>
              <div className="celebration-timer-val">{timeLeft}</div>
            </div>

            <div className="celebration-section-label">Ship to</div>

            {loadingAddrs ? (
              <div className="celebration-loading">Loading addresses…</div>
            ) : showForm ? (
              <AddressForm
                onSave={handleNewAddress}
                onCancel={addresses.length > 0 ? () => setShowForm(false) : undefined}
              />
            ) : (
              <>
                <div className="celebration-addr-list">
                  {addresses.map((a) => (
                    <label key={a.id} className={'celebration-addr-card' + (selectedAddr === a.id ? ' selected' : '')}>
                      <input type="radio" name="address" value={a.id} checked={selectedAddr === a.id} onChange={() => setSelectedAddr(a.id)} />
                      <div className="celebration-addr-info">
                        <div className="celebration-addr-name">{a.name}</div>
                        <div className="celebration-addr-text">{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</div>
                        <div className="celebration-addr-text">{a.phone}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button className="celebration-add-addr-btn" onClick={() => setShowForm(true)}>+ Add new address</button>
              </>
            )}

            {error && <div className="auth-error" style={{ margin: '12px 0', justifyContent: 'center' }}><span>⚠</span> {error}</div>}

            {!showForm && (
              <button
                className="celebration-pay-btn"
                onClick={handlePay}
                disabled={step === 'paying' || !selectedAddr || timeLeft === 'EXPIRED'}
                style={{ marginTop: '16px' }}
              >
                {step === 'paying' ? 'Opening payment…' : `Pay ₹${lot.startingBid?.toLocaleString('en-IN')} →`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
