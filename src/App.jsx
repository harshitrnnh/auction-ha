import { useState, useRef, useEffect } from 'react';
import Starfield from './components/Starfield';
import Stage from './components/Stage';
import BidRail from './components/BidRail';

const RIVALS = [
  { name: 'Vela K.', hue: 268 },
  { name: 'Nori', hue: 32 },
  { name: 'Astra_09', hue: 200 },
  { name: 'M. Reyes', hue: 150 },
  { name: 'k060x', hue: 320 },
  { name: 'Juno', hue: 48 },
];

const pad = (n) => String(n).padStart(2, '0');

function useCountdown(endRef) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, endRef.current - Date.now());
  const total = Math.floor(ms / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    total,
  };
}

export default function App() {
  const startingBid = 120;
  const minInc = 25;
  const endRef = useRef(Date.now() + (1 * 3600 + 47 * 60 + 12) * 1000);
  const cd = useCountdown(endRef);

  const [currentBid, setCurrentBid] = useState(485);
  const [myBid, setMyBid] = useState(null);
  const [status, setStatus] = useState('none');
  const [bump, setBump] = useState(false);
  const [bids, setBids] = useState(() => {
    const seed = [
      { amount: 485, name: 'Vela K.', hue: 268, time: '1m ago' },
      { amount: 440, name: 'Nori', hue: 32, time: '4m ago' },
      { amount: 390, name: 'astra_09', hue: 200, time: '7m ago' },
      { amount: 310, name: 'M. Reyes', hue: 150, time: '12m ago' },
      { amount: 210, name: 'k060x', hue: 320, time: '18m ago' },
      { amount: 120, name: 'Juno', hue: 48, time: '26m ago' },
    ];
    return seed.map((b, i) => ({ ...b, id: 'seed' + i, you: false }));
  });

  const flash = () => { setBump(true); setTimeout(() => setBump(false), 520); };
  const addBid = (entry) => setBids((prev) => [{ id: 'b' + Date.now() + Math.random(), time: 'just now', ...entry }, ...prev]);

  const placeBid = (n) => {
    setCurrentBid(n);
    setMyBid(n);
    setStatus('winning');
    flash();
    addBid({ amount: n, you: true, name: 'You', hue: 45 });
  };

  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const delay = 7000 + Math.random() * 9000;
      setTimeout(() => {
        if (!alive) return;
        setCurrentBid((cb) => {
          if (endRef.current - Date.now() < 0) return cb;
          const inc = minInc * (1 + Math.floor(Math.random() * 3));
          const next = cb + inc;
          const r = RIVALS[Math.floor(Math.random() * RIVALS.length)];
          addBid({ amount: next, you: false, name: r.name, hue: r.hue });
          flash();
          setMyBid((mb) => {
            if (mb !== null && next > mb) setStatus('outbid');
            return mb;
          });
          return next;
        });
        loop();
      }, delay);
    };
    loop();
    return () => { alive = false; };
  }, []);

  const urgent = cd.total < 300;

  const scrollToBid = () => {
    const el = document.querySelector('.bidrail');
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 70, behavior: 'smooth' });
  };

  const auction = { startingBid, currentBid, minInc, myBid, status, bids, placeBid, bump };

  return (
    <div className="app">
      <Starfield />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-name">Oxide</div>
            <div className="brand-sub">Live Auction</div>
          </div>
        </div>

        <div className={'countdown' + (urgent ? ' urgent' : '')}>
          <span className="countdown-label">{urgent ? 'Ending soon' : 'Auction ends in'}</span>
          <span className="countdown-time num">
            {cd.h > 0 && <><span>{pad(cd.h)}</span><span className="u">h</span></>}
            <span>{pad(cd.m)}</span><span className="u">m</span>
            <span>{pad(cd.s)}</span><span className="u">s</span>
          </span>
        </div>

        <div className="topbar-right">
          <div className="pill">
            <span className="dot" />
            214 watching
          </div>
        </div>
      </header>

      <div className="stage-wrap">
        <Stage modelCount={3} />
      </div>

      <BidRail auction={auction} />

      <div className="mobile-bidbar">
        <div className="mb-info">
          <div className="k">{status === 'outbid' ? "You've been outbid" : 'Current bid'}</div>
          <div className="v num" style={{ color: status === 'outbid' ? 'var(--lose)' : 'var(--txt)' }}>
            ${currentBid.toLocaleString('en-US')}
          </div>
        </div>
        <button className="mb-btn" onClick={scrollToBid}>{myBid === null ? 'Place bid' : 'Raise bid'}</button>
      </div>
    </div>
  );
}
