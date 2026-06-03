import { useState, useRef, useEffect } from 'react';
import { fmt } from '../../data/lotsData';
import ArtBloom from './ArtBloom';

/* ---------- Hero banner (live lot) ---------- */
const pad = (n) => String(n).padStart(2, '0');

function useCountdown(getTarget) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, getTarget() - Date.now());
  const total = Math.floor(ms / 1000);
  return { h: Math.floor(total / 3600), m: Math.floor(total % 3600 / 60), s: total % 60, total };
}

export function Hero({ lot, currentBid, bids, bump, lotClosed, getCountdownTarget, onPeek }) {
  const cd = useCountdown(() => getCountdownTarget(lotClosed));

  return (
    <section className="lots-hero">
      <div className="hero-spot" />
      <div className="hero-body">
        <div className="live-row">
          {lotClosed
            ? <span className="hero-lotno" style={{ color: 'var(--txt-mute)' }}>Auction closed for today</span>
            : <>
                <span className="live-badge"><span className="dot" /> Live now</span>
                <span className="hero-lotno">
                  Lot {lot.lotNo} / {String(lot.totalLots || lot.lotNo).padStart(3, '0')} · Single edition 1 of 1
                </span>
              </>}
        </div>
        <h1 className="hero-title">{lot.title}</h1>
        <p className="hero-artist">{lot.artist}</p>

        <div className="hero-stats">
          <div className="hstat">
            <div className="k">Current bid</div>
            <div className={'v num' + (bump ? ' bump' : '')}>
              <span className="cur">₹</span>
              <span>{currentBid.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="hstat">
            <div className="k">Bids</div>
            <div className="v num">{bids}</div>
          </div>
          <div className="hstat">
            <div className="k">{lotClosed ? 'Next auction in' : 'Ends in'}</div>
            <div className={'v cd num' + (lotClosed ? ' cd-closed' : '')}>
              {cd.h > 0 && <><span>{pad(cd.h)}</span><span className="u">h</span></>}
              <span>{pad(cd.m)}</span><span className="u">m</span>
              <span>{pad(cd.s)}</span><span className="u">s</span>
            </div>
          </div>
        </div>

        <div className="hero-cta">
          <a className="btn-primary" href="/">Enter live room <span aria-hidden="true">→</span></a>
          <button className="btn-ghost" onClick={() => onPeek(lot)}>Quick peek</button>
        </div>
      </div>

      <div className="hero-art">
        <ArtBloom lot={lot} />
        <span className="hero-watching"><span className="dot" /> {lot.watching} watching</span>
      </div>
    </section>
  );
}

/* ---------- Toolbar ---------- */
const SORTS = [
  { id: 'recent', label: 'Most recent' },
  { id: 'price-desc', label: 'Highest sold price' },
  { id: 'price-asc', label: 'Lowest sold price' },
  { id: 'bids-desc', label: 'Most bids' },
];

export function Toolbar({
  q, setQ,
  sort, setSort,
  priceMin, priceMax, setPriceMin, setPriceMax,
  ownedOnly, setOwnedOnly,
  ownedCount,
  userLoggedIn,
}) {
  return (
    <div className="lots-toolbar">
      <label className="lots-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lots by name…"
        />
        {q && (
          <button className="clr" onClick={() => setQ('')} aria-label="Clear search">×</button>
        )}
      </label>

      <div className="tool-field price-field">
        <span className="lbl">Price</span>
        <input
          className="num"
          inputMode="numeric"
          value={priceMin}
          placeholder="Min"
          onChange={(e) => setPriceMin(e.target.value.replace(/[^0-9]/g, ''))}
          aria-label="Minimum price"
        />
        <span className="dash">–</span>
        <input
          className="num"
          inputMode="numeric"
          value={priceMax}
          placeholder="Max"
          onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ''))}
          aria-label="Maximum price"
        />
      </div>

      <div className="tool-field">
        <span className="lbl">Sort</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {userLoggedIn && (
        <button
          className={'owned-chip' + (ownedOnly ? ' on' : '')}
          onClick={() => setOwnedOnly((v) => !v)}
        >
          {ownedOnly && <span className="shine" />}
          <span className="spark">✦</span>
          Your gallery
          <span className="count num">{ownedCount}</span>
        </button>
      )}
    </div>
  );
}

/* ---------- Lot card ---------- */
export function LotCard({ lot, onPeek, showRibbon, userLoggedIn }) {
  const passed = lot.status === 'unsold';
  return (
    <button
      className={'lot-card' + (lot.owned && userLoggedIn ? ' is-owned' : '')}
      onClick={() => onPeek(lot)}
    >
      <div className="card-art">
        <ArtBloom lot={lot} />
        <div className="card-badges">
          <span className="l-tag lotno num">Lot {lot.lotNo}</span>
          {lot.owned && userLoggedIn && showRibbon
            ? <span className="owned-ribbon">✦ Yours</span>
            : <span className={'l-tag ' + (passed ? 'unsold' : 'sold')}>{passed ? 'Passed' : 'Sold'}</span>}
        </div>
        <span className="peek-hint">Quick peek →</span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{lot.title}</h3>
        <div className="card-meta">{lot.size} · 1 of 1</div>
        <div className="card-result">
          <div>
            <div className="price-k">{passed ? 'Reserve not met' : 'Sold for'}</div>
            {passed
              ? <div className="price-v passed num">No sale</div>
              : <div className="price-v num">{fmt(lot.soldPrice)}</div>}
          </div>
          <div className="bids">
            <span className="n num">{lot.bids}</span> bid{lot.bids === 1 ? '' : 's'}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------- Infinite-scroll grid ---------- */
const BATCH = 12;

export function Grid({ lots, onPeek, showRibbon, ownedOnly, userLoggedIn }) {
  const [shown, setShown] = useState(BATCH);
  const sentinel = useRef(null);

  useEffect(() => { setShown(BATCH); }, [lots]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setShown((s) => s < lots.length ? Math.min(s + BATCH, lots.length) : s);
      }
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [lots.length]);

  if (lots.length === 0) {
    return (
      <div className="lots-empty">
        <div className="big">No lots match your filters</div>
        <div>
          {ownedOnly
            ? "You haven't won any lots in this range yet."
            : 'Try widening the price range or clearing the search.'}
        </div>
      </div>
    );
  }

  const visible = lots.slice(0, shown);
  const more = shown < lots.length;

  return (
    <>
      <div className="lots-grid">
        {visible.map((lot) => (
          <LotCard
            key={lot.id}
            lot={lot}
            onPeek={onPeek}
            showRibbon={showRibbon}
            userLoggedIn={userLoggedIn}
          />
        ))}
      </div>
      <div ref={sentinel} className="lots-sentinel" />
      {more
        ? <div className="lots-loader"><span className="spin" /> Loading more lots</div>
        : <div className="lots-end-note">You&apos;ve reached the end of the archive · {lots.length} lots</div>}
    </>
  );
}
