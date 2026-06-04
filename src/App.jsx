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
    </div>
  );
}

function CelebrationOverlay({ lot, token, onPaymentSuccess }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);

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

  const handlePay = async () => {
    setLoading(true);
    setError('');
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';
      const r = await fetch(`${API_URL}/api/lots/simulate-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Payment failed');
      setPaid(true);
    } catch (err) {
      setError(err.message || 'Payment simulation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="celebration-overlay">
      <div className="celebration-card">
        <div className="celebration-badge">{paid ? '🎉' : '🏆'}</div>
        {paid ? (
          <>
            <h2 className="celebration-title">Payment Confirmed!</h2>
            <p className="celebration-text" style={{ marginBottom: '24px' }}>
              You have successfully claimed <strong>{lot.title}</strong>! We will contact you shortly to coordinate delivery.
            </p>
            <button className="celebration-pay-btn" onClick={onPaymentSuccess}>
              Go to Auction Stage
            </button>
          </>
        ) : (
          <>
            <h2 className="celebration-title">You Won the Bid!</h2>
            <p className="celebration-text">
              Congratulations! You won today's drop: <strong>{lot.title}</strong>. 
              Please complete your payment within the next 2 hours to claim your product. If you don't pay within this time, the product gets transferred to the 2nd highest bidder.
            </p>
            
            <div className="celebration-timer-box">
              <div className="celebration-timer-label">Time Remaining to Settle</div>
              <div className="celebration-timer-val">{timeLeft}</div>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: '20px', justifyContent: 'center' }}><span>⚠</span> {error}</div>}

            <button className="celebration-pay-btn" onClick={handlePay} disabled={loading || timeLeft === 'EXPIRED'}>
              {loading ? 'Processing Payment…' : 'Simulate Payment (Razorpay Mock)'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
