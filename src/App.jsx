import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io as socketIO } from 'socket.io-client';
import { useAuth } from './contexts/AuthContext';
import Starfield from './components/Starfield';
import Stage from './components/Stage';
import BidRail from './components/BidRail';
import UserMenu from './components/UserMenu';

const pad = (n) => String(n).padStart(2, '0');

function useCountdown(endsAt) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!endsAt) return { h: 0, m: 0, s: 0, total: 0 };
  const ms = Math.max(0, new Date(endsAt) - Date.now());
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

  const myBidRef = useRef(myBid);
  myBidRef.current = myBid;

  const cd = useCountdown(lot?.endsAt);
  const flash = () => { setBump(true); setTimeout(() => setBump(false), 520); };

  const fetchLot = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch('/api/lots/current', { headers });
      if (!r.ok) { setError('No active lot right now.'); return; }
      const data = await r.json();
      setLot(data.lot);
      setBids(data.bids);
      setCurrentBid(data.currentBid);
      if (data.myBid !== null && data.myBid !== undefined) {
        setMyBid(data.myBid);
        setStatus(data.myStatus);
      }
    } catch {
      setError('Could not connect to the auction server.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchLot(); }, [fetchLot]);

  // Socket.io — join lot room for real-time bid updates
  useEffect(() => {
    if (!lot) return;
    const socket = socketIO({ path: '/socket.io' });

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

    return () => socket.disconnect();
  }, [lot?.id, user?.id]);

  const placeBid = useCallback(async (amount) => {
    if (!user) { navigate('/login', { state: { from: '/' } }); return; }
    const r = await fetch(`/api/lots/${lot.id}/bids`, {
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

  const urgent = cd.total < 300 && cd.total > 0;
  const minInc = 25;
  const startingBid = lot?.startingBid ?? 100;

  const auction = {
    lot, startingBid, currentBid, minInc, myBid, status, bids,
    placeBid, bump, user, winner,
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

  return (
    <div className="app">
      <Starfield />

      <header className="topbar">
        <div className="brand">
          {user ? (
            <UserMenu user={user} logout={logout} />
          ) : (
            <div className="brand-mark" />
          )}
          <div>
            <div className="brand-name">Oxide</div>
            <div className="brand-sub">Live Auction</div>
          </div>
          {!user && (
            <button className="pill auth-pill" onClick={() => navigate('/login')}>
              Sign in to bid
            </button>
          )}
        </div>

        <div className={'countdown' + (urgent ? ' urgent' : '')}>
          <span className="countdown-label">
            {lot?.status === 'closed' ? 'Auction ended' : urgent ? 'Ending soon' : 'Auction ends in'}
          </span>
          {lot?.status !== 'closed' && (
            <span className="countdown-time num">
              {cd.h > 0 && <><span>{pad(cd.h)}</span><span className="u">h</span></>}
              <span>{pad(cd.m)}</span><span className="u">m</span>
              <span>{pad(cd.s)}</span><span className="u">s</span>
            </span>
          )}
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
            ${currentBid.toLocaleString('en-US')}
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
