import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { io as socketIO } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { Hero, Toolbar, Grid } from '../components/lots/LotsGrid';
import PeekModal from '../components/lots/PeekModal';
import { buildArchive, LIVE_LOT } from '../data/lotsData';
import '../lots.css';

const API = import.meta.env.VITE_API_URL ?? '';

/* stable archive — built once */
const ARCHIVE = buildArchive();
const OWNED_COUNT = ARCHIVE.filter((l) => l.owned).length;

/* Starfield that covers full scroll height */
function LotsStarfield() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    let w, h, stars, raf;
    const resize = () => {
      w = c.width = window.innerWidth;
      h = c.height = Math.max(window.innerHeight, document.body.scrollHeight);
      stars = Array.from({ length: Math.round(w * h / 16000) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.2,
        a: Math.random() * 0.5 + 0.1,
        tw: Math.random() * 0.02 + 0.004,
        p: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.p += s.tw;
        const a = s.a * (0.6 + 0.4 * Math.sin(s.p));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 7);
        ctx.fillStyle = `rgba(255,250,235,${a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return (
    <canvas
      ref={ref}
      className="starfield"
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
    />
  );
}

/* IST countdown helpers — matches App.jsx exactly */
function checkBiddingClosed() {
  try {
    const str = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).format(new Date());
    return parseInt(str.split(':')[0], 10) >= 18;
  } catch { return false; }
}

function getCountdownTarget(isClosed) {
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = istDate.getUTCFullYear();
  const m = istDate.getUTCMonth();
  const d = istDate.getUTCDate();
  if (isClosed) return Date.UTC(y, m, d, 18, 30, 0);
  return Date.UTC(y, m, d, 12, 30, 0);
}

export default function Lots() {
  const { user, token, logout } = useAuth();

  /* body class so lots page can scroll */
  useEffect(() => {
    document.body.classList.add('lots-page');
    return () => document.body.classList.remove('lots-page');
  }, []);

  /* live lot state — fetched from the real API */
  const [apiLot, setApiLot] = useState(null);
  const [currentBid, setCurrentBid] = useState(null);
  const [liveBids, setLiveBids] = useState(0);
  const [watching, setWatching] = useState(0);
  const [bump, setBump] = useState(false);
  const [lotClosed, setLotClosed] = useState(checkBiddingClosed);
  const myBidRef = useRef(null);

  const flash = () => { setBump(true); setTimeout(() => setBump(false), 520); };

  /* fetch current lot once on mount */
  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API}/api/lots/current`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setApiLot(data.lot);
        setCurrentBid(data.currentBid);
        setLiveBids(data.bids?.length ?? 0);
        const closed = data.lot?.status === 'closed' || checkBiddingClosed();
        setLotClosed(closed);
      })
      .catch(() => null);
  }, [token]);

  /* watching count — simulated from bid activity, same approach as App.jsx */
  useEffect(() => {
    if (!apiLot) return;
    const base = 8 + liveBids * 3;
    setWatching(base + Math.floor(Math.random() * 6));
    const id = setInterval(() => {
      setWatching((n) => Math.max(1, n + (Math.random() < 0.4 ? 1 : -1)));
    }, 7000);
    return () => clearInterval(id);
  }, [apiLot?.id, liveBids]);

  /* socket.io — stay in sync with the live room */
  useEffect(() => {
    if (!apiLot) return;
    const socket = API ? socketIO(API, { path: '/socket.io' }) : socketIO({ path: '/socket.io' });
    socket.emit('join:lot', apiLot.id);
    socket.on('bid:new', ({ bid }) => {
      flash();
      setCurrentBid(bid.amount);
      setLiveBids((n) => n + 1);
    });
    socket.on('lot:closed', () => setLotClosed(true));
    socket.on('lot:new', ({ lot: newLot }) => {
      setApiLot(newLot);
      setCurrentBid(newLot.startingBid);
      setLiveBids(0);
      setLotClosed(false);
    });
    return () => socket.disconnect();
  }, [apiLot?.id]);

  /* merge real API data with mock visual data (hue/seed/shots for ArtBloom) */
  const heroLot = apiLot ? {
    ...LIVE_LOT,
    title: apiLot.title ?? LIVE_LOT.title,
    artist: apiLot.artist ?? LIVE_LOT.artist,
    size: apiLot.size ?? LIVE_LOT.size,
    startingBid: apiLot.startingBid ?? LIVE_LOT.startingBid,
    lotNo: String(apiLot.lotNumber ?? LIVE_LOT.lotNo).padStart(3, '0'),
    totalLots: apiLot.totalLots ?? apiLot.lotNumber ?? 20,
    watching,
  } : { ...LIVE_LOT, watching };

  const displayBid = currentBid ?? LIVE_LOT.startingBid;

  /* filters */
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(false);

  /* quick-peek state */
  const [peekIdx, setPeekIdx] = useState(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const lo = priceMin ? Number(priceMin) : -Infinity;
    const hi = priceMax ? Number(priceMax) : Infinity;
    let list = ARCHIVE.filter((l) => {
      if (ownedOnly && !l.owned) return false;
      if (qq && !l.title.toLowerCase().includes(qq) && !l.lotNo.toLowerCase().includes(qq)) return false;
      const p = l.soldPrice || 0;
      if (l.status === 'sold' && (p < lo || p > hi)) return false;
      if (l.status === 'unsold' && (lo > 0 || hi < Infinity)) return false;
      return true;
    });
    const by = {
      'recent': () => 0,
      'price-desc': (a, b) => (b.soldPrice || 0) - (a.soldPrice || 0),
      'price-asc': (a, b) => (a.soldPrice || Infinity) - (b.soldPrice || Infinity),
      'bids-desc': (a, b) => b.bids - a.bids,
    }[sort];
    return by ? [...list].sort(by) : list;
  }, [q, sort, priceMin, priceMax, ownedOnly]);

  const liveLotForPeek = { ...heroLot, currentBid: displayBid, bids: liveBids };

  const openPeek = useCallback((lot) => {
    if (lot.status === 'live') { setPeekIdx('live'); return; }
    const i = filtered.findIndex((l) => l.id === lot.id);
    setPeekIdx(i);
  }, [filtered]);

  const closePeek = () => setPeekIdx(null);
  const peekLot = peekIdx === 'live'
    ? liveLotForPeek
    : (typeof peekIdx === 'number' && peekIdx >= 0 ? filtered[peekIdx] : null);

  const soldCount = ARCHIVE.filter((l) => l.status === 'sold').length;
  const loggedIn = !!user;
  const userInitial = user?.name?.slice(0, 1)?.toUpperCase() ?? user?.email?.slice(0, 1)?.toUpperCase() ?? '?';

  return (
    <div className="lots-app">
      <LotsStarfield />

      <header className="lots-topbar">
        <Link className="brand" to="/">
          <div className="brand-mark" />
          <div>
            <div className="brand-name">Oxide</div>
            <div className="brand-sub">Lots &amp; Archive</div>
          </div>
        </Link>
        <div className="topbar-right">
          <Link className="pill" to="/">
            <span className="dot" /> Live room · Lot {heroLot.lotNo}
          </Link>
          {user ? (
            <button
              className="pill account"
              onClick={logout}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              <span className="av">{userInitial}</span>
              {user.name ?? user.email?.split('@')[0]}
            </button>
          ) : (
            <Link className="pill" to="/login">Sign in</Link>
          )}
        </div>
      </header>

      <div className="lots-wrap">
        <Hero
          lot={heroLot}
          currentBid={displayBid}
          bids={liveBids}
          bump={bump}
          lotClosed={lotClosed}
          getCountdownTarget={getCountdownTarget}
          onPeek={openPeek}
        />

        <div className="archive-head">
          <div>
            <h2 className="archive-title">The Archive</h2>
            <div className="archive-sub">
              Every Oxide lot that&apos;s come before — {soldCount} sold
              {loggedIn && `, ${OWNED_COUNT} in your gallery`}.
            </div>
          </div>
        </div>

        <Toolbar
          q={q} setQ={setQ}
          sort={sort} setSort={setSort}
          priceMin={priceMin} priceMax={priceMax}
          setPriceMin={setPriceMin} setPriceMax={setPriceMax}
          ownedOnly={ownedOnly} setOwnedOnly={setOwnedOnly}
          ownedCount={OWNED_COUNT}
          userLoggedIn={loggedIn}
        />

        <div className="result-count">
          {ownedOnly
            ? <><b>Your {filtered.length} {filtered.length === 1 ? 'piece' : 'pieces'}</b></>
            : <><b>{filtered.length} lots</b></>}
          {q && <> for &ldquo;{q}&rdquo;</>}
        </div>

        <Grid
          lots={filtered}
          onPeek={openPeek}
          showRibbon={loggedIn}
          ownedOnly={ownedOnly}
          userLoggedIn={loggedIn}
        />
      </div>

      {peekLot && (
        <PeekModal
          lot={peekLot}
          onClose={closePeek}
          userLoggedIn={loggedIn}
        />
      )}
    </div>
  );
}
