import { useState, useEffect } from 'react';

const fmt = (n) => '₹' + n.toLocaleString('en-IN');

function StatusBanner({ status, currentBid, lotClosed, winner, user }) {
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
      </div>
    );
  }
  return null;
}

function BidForm({ minNext, onPlace, disabled, onLoginPrompt, user, bidsCount, isHighestBidder }) {
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) {
      onLoginPrompt();
      return;
    }
    setErr('');
    setSubmitting(true);
    try {
      await onPlace(minNext);
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

  const isBtnDisabled = submitting || isHighestBidder;

  return (
    <div className="bid-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        className="bid-submit"
        onClick={submit}
        disabled={isBtnDisabled}
        style={{
          width: '100%',
          padding: '14px 18px',
          fontSize: '15px',
          borderRadius: 'var(--r-sm)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        {!user 
          ? 'Sign in to bid' 
          : submitting 
            ? 'Placing bid…' 
            : bidsCount === 0 
              ? 'Place Bid' 
              : `Raise Bid : ${fmt(minNext)}`
        }
      </button>
      {err && <div className="bid-error" style={{ justifyContent: 'center' }}><span>⚠</span> {err}</div>}
      {!user && (
        <div className="bid-help" style={{ textAlign: 'center', marginTop: '4px' }}>
          <button className="link-btn" style={{ padding: 0 }} onClick={onLoginPrompt}>Sign in or create an account</button> to bid on this lot.
        </div>
      )}
    </div>
  );
}

function MyBid({ myBid, status }) {
  return (
    <div className="mybid">
      <div className="row">
        <span className="k">Your bid</span>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <span className="amt num">{fmt(myBid)}</span>
        <span style={{ fontSize: 12, color: status === 'winning' ? 'var(--win)' : 'var(--lose)' }}>
          {status === 'winning' ? '● Leading' : '● Outbid'}
        </span>
      </div>
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
  const { lot, startingBid, currentBid, minInc, myBid, status, bids, placeBid, bump, user, winner, watching, onLoginPrompt, lotClosed } = auction;
  const minNext = bids.length > 0 ? currentBid + minInc : startingBid;

  const showForm = !lotClosed;
  const showMyBid = myBid !== null;

  const handlePlace = async (n) => {
    await placeBid(n);
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
          <div className="m"><span className="k">Ships</span><span className="v">India Only</span></div>
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
            <span className="cur num">₹</span>
            <span className="num">{currentBid.toLocaleString('en-IN')}</span>
          </div>
          <div className="sub">{bids.length} bids · {fmt(currentBid - startingBid)} over start</div>
        </div>
      </div>

      <StatusBanner
        status={status}
        currentBid={currentBid}
        lotClosed={lotClosed}
        winner={winner}
        user={user}
      />

      {showMyBid && (
        <MyBid myBid={myBid} status={status} />
      )}

      {showForm && (
        <BidForm
          minNext={minNext}
          onPlace={handlePlace}
          disabled={lotClosed}
          user={user}
          onLoginPrompt={onLoginPrompt}
          bidsCount={bids.length}
          isHighestBidder={status === 'winning'}
        />
      )}

      {lotClosed && (
        <div className="settlement-info" style={{ padding: '24px 20px', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.2)', textAlign: 'center', marginTop: '16px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--txt)', fontWeight: 600 }}>Bidding Closed</h3>
          {bids.length > 0 ? (
            <p style={{ fontSize: '13px', line-height: '1.6', color: 'var(--txt-mute)', margin: '0 0 16px 0' }}>
              <strong>{bids[0].userName || bids[0].name}</strong> has won the bid with <strong>{fmt(bids[0].amount)}</strong>.
            </p>
          ) : (
            <p style={{ fontSize: '13px', line-height: '1.6', color: 'var(--txt-mute)', margin: '0 0 16px 0' }}>
              No bids were placed on this lot.
            </p>
          )}
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-bright)', borderTop: '1px solid var(--line)', paddingTop: '12px', fontWeight: 500 }}>
            Next bidding starts at 12:00 AM IST. Log back in then for an exciting new drop!
          </div>
        </div>
      )}

      <Feed bids={bids} />
    </aside>
  );
}
