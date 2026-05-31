import { useState, useEffect } from 'react';

const fmt = (n) => '$' + n.toLocaleString('en-US');

function StatusBanner({ status, currentBid, onRaise, lotClosed, winner, user }) {
  if (lotClosed) {
    const isWinner = winner && winner.userId === user?.id;
    return (
      <div className={`status-banner ${isWinner ? 'win' : 'lose'}`}>
        <span className="icon">{isWinner ? '★' : '✕'}</span>
        <span className="sb-text">
          {isWinner
            ? <><b>You won this lot!</b> We&apos;ll reach out to arrange shipping.</>
            : winner
              ? <><b>Auction ended.</b> Won by {winner.name} for {fmt(winner.amount)}.</>
              : <><b>Auction ended.</b> No bids were placed.</>}
        </span>
      </div>
    );
  }
  if (status === 'winning') {
    return (
      <div className="status-banner win">
        <span className="icon">✓</span>
        <span className="sb-text">You&apos;re the <b>highest bidder</b>. Hold tight.</span>
      </div>
    );
  }
  if (status === 'outbid') {
    return (
      <div className="status-banner lose">
        <span className="icon">!</span>
        <span className="sb-text">You&apos;ve been <b>outbid</b> — current is {fmt(currentBid)}.</span>
        <button className="link-btn" style={{ marginLeft: 'auto', color: 'var(--lose)' }} onClick={onRaise}>Raise →</button>
      </div>
    );
  }
  return null;
}

function BidForm({ currentBid, minInc, onPlace, prefill, label, disabled, onLoginPrompt, user }) {
  const minNext = currentBid + minInc;
  const [val, setVal] = useState(String(prefill || minNext));
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setVal(String(prefill || minNext)); setErr(''); }, [prefill, currentBid]);

  const quick = [minInc, minInc * 2, minInc * 4];
  const setQuick = (add) => { setVal(String(currentBid + add)); setErr(''); };

  const submit = async () => {
    if (!user) { onLoginPrompt(); return; }
    const n = Math.round(Number(val));
    if (!val || isNaN(n)) { setErr('Enter a valid amount.'); return; }
    if (n < minNext) { setErr(`Bid must be at least ${fmt(minNext)} (current + ${fmt(minInc)} increment).`); return; }
    setErr('');
    setSubmitting(true);
    try {
      await onPlace(n);
    } catch (e) {
      setErr(e.message || 'Failed to place bid. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (disabled) {
    return (
      <div className="bid-form">
        <div className="bid-help" style={{ textAlign: 'center', padding: '8px 0' }}>
          This auction has ended.
        </div>
      </div>
    );
  }

  return (
    <div className="bid-form">
      <div className="quickbids">
        {quick.map((q) => (
          <button key={q} className="qb" onClick={() => setQuick(q)}>+{fmt(q)}</button>
        ))}
      </div>
      <div className="bid-input-row">
        <div className={'bid-input' + (err ? ' err' : '')}>
          <span className="cur">$</span>
          <input
            inputMode="numeric"
            value={val}
            onChange={(e) => { setVal(e.target.value.replace(/[^0-9]/g, '')); setErr(''); }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={submitting}
          />
        </div>
        <button className="bid-submit" onClick={submit} disabled={submitting}>
          {!user ? 'Sign in' : submitting ? '…' : (label || 'Place bid')}
        </button>
      </div>
      {err
        ? <div className="bid-error"><span>⚠</span> {err}</div>
        : !user
          ? <div className="bid-help">
              <button className="link-btn" style={{ padding: 0 }} onClick={onLoginPrompt}>Sign in or create an account</button> to bid on this lot.
            </div>
          : <div className="bid-help">Minimum next bid {fmt(minNext)} · increment {fmt(minInc)}</div>}
    </div>
  );
}

function MyBid({ myBid, status, onEdit, lotClosed }) {
  return (
    <div className="mybid">
      <div className="row">
        <span className="k">Your bid</span>
        {!lotClosed && <button className="link-btn" onClick={onEdit}>Raise bid</button>}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <span className="amt num">{fmt(myBid)}</span>
        <span style={{ fontSize: 12, color: status === 'winning' ? 'var(--win)' : 'var(--lose)' }}>
          {status === 'winning' ? '● Leading' : '● Outbid'}
        </span>
      </div>
      {!lotClosed && <div className="max-note">You&apos;ll be notified instantly if someone bids higher.</div>}
    </div>
  );
}

function Feed({ bids }) {
  return (
    <div className="feed">
      <div className="feed-head">
        <span className="t">Live activity</span>
        <span className="live"><span className="dot" /> Live · {bids.length} bids</span>
      </div>
      <div className="feed-list">
        {bids.map((b, i) => (
          <div key={b.id} className={'feed-item' + (b.you ? ' you' : '')}>
            <span className="av" style={{ background: b.you ? 'linear-gradient(135deg,var(--gold-bright),var(--gold))' : `hsl(${b.hue ?? 200} 45% 62%)` }}>
              {b.you ? '★' : (b.userName ?? b.name ?? '?').slice(0, 1)}
            </span>
            <div className="who">
              <div className="n">
                {b.you ? 'You' : (b.userName ?? b.name)}
                {i === 0 && <span className="tag">High</span>}
              </div>
              <div className="tm">
                {b.time ?? new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <span className="amt num">{fmt(b.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BidRail({ auction }) {
  const { lot, startingBid, currentBid, minInc, myBid, status, bids, placeBid, bump, user, winner, watching, onLoginPrompt } = auction;
  const [editing, setEditing] = useState(false);

  const lotClosed = lot?.status === 'closed';
  const showForm = !lotClosed && (myBid === null || editing);
  const showMyBid = myBid !== null;

  const handlePlace = async (n) => {
    await placeBid(n);
    setEditing(false);
  };

  return (
    <aside className="bidrail">
      <div className="lot-head">
        <div className="lot-toprow">
          <span className="lot-kicker">Single edition · 1 of 1</span>
          <span className="watching"><span className="dot" /> {watching} watching</span>
        </div>
        <h1 className="lot-title">{lot?.title ?? 'Loading…'}</h1>
        <div className="lot-artist">{lot?.artist ?? ''}</div>
        <p className="lot-desc">{lot?.description ?? ''}</p>
        <div className="lot-meta">
          <div className="m"><span className="k">Size</span><span className="v">{lot?.size ?? 'M'}</span></div>
          <div className="m"><span className="k">Edition</span><span className="v">{lot?.edition ?? '1 / 1'}</span></div>
          <div className="m"><span className="k">Ships</span><span className="v">Worldwide</span></div>
        </div>
      </div>

      <div className="price-block">
        <div className="price-row price-start">
          <span className="label">Starting bid</span>
          <span className="amt num">{fmt(startingBid)}</span>
        </div>
        <div className="current">
          <div className="price-row"><span className="label">Current bid</span></div>
          <div className={'amt' + (bump ? ' bump' : '')} key={currentBid}>
            <span className="cur num">$</span>
            <span className="num">{currentBid.toLocaleString('en-US')}</span>
          </div>
          <div className="sub">{bids.length} bids · {fmt(currentBid - startingBid)} over start</div>
        </div>
      </div>

      <StatusBanner
        status={status}
        currentBid={currentBid}
        onRaise={() => setEditing(true)}
        lotClosed={lotClosed}
        winner={winner}
        user={user}
      />

      {showMyBid && (
        <MyBid myBid={myBid} status={status} onEdit={() => setEditing(true)} lotClosed={lotClosed} />
      )}

      {showForm && (
        <BidForm
          currentBid={currentBid}
          minInc={minInc}
          prefill={editing ? currentBid + minInc : null}
          label={myBid === null ? 'Place bid' : 'Raise bid'}
          onPlace={handlePlace}
          disabled={lotClosed}
          user={user}
          onLoginPrompt={onLoginPrompt}
        />
      )}

      <Feed bids={bids} />
    </aside>
  );
}
