import { useState, useEffect } from 'react';
import { fmt } from '../../data/lotsData';
import ArtBloom from './ArtBloom';
import DeliveryTracker from './DeliveryTracker';

export default function PeekModal({ lot, onClose, userLoggedIn }) {
  const [shot, setShot] = useState(0);
  const live = lot.status === 'live';
  const passed = lot.status === 'unsold';

  useEffect(() => { setShot(0); }, [lot.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const overStart = !passed && !live && lot.startingBid
    ? Math.round((lot.soldPrice - lot.startingBid) / lot.startingBid * 100)
    : 0;

  return (
    <div
      className="lots-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="peek-modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {/* gallery — left column */}
        <div className="m-gallery">
          <div className="m-main">
            {shot === 0
              ? <ArtBloom lot={lot} />
              : (
                <div className="model-shot">
                  <span className="ic">◐</span>
                  <span className="lab">Model wearing the tee</span>
                  <span className="sub">Editorial shot {shot} / {lot.shots - 1}</span>
                </div>
              )}
          </div>
          <div className="m-thumbs">
            <button
              className={'m-thumb' + (shot === 0 ? ' on' : '')}
              onClick={() => setShot(0)}
            >
              <ArtBloom lot={lot} />
            </button>
            {Array.from({ length: lot.shots - 1 }).map((_, i) => (
              <button
                key={i}
                className={'m-thumb' + (shot === i + 1 ? ' on' : '')}
                onClick={() => setShot(i + 1)}
              >
                <span className="mlabel">0{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        {/* detail — right column */}
        <div className="m-detail">
          <div className="m-kicker">
            <span className="lotno num">Lot {lot.lotNo}</span>
            {live
              ? (
                <span className="l-tag sold" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--live, #ff6b7d)',
                    boxShadow: '0 0 10px var(--live, #ff6b7d)',
                    display: 'inline-block',
                    animation: 'lots-blink 1.4s infinite',
                  }} />
                  Live now
                </span>
              )
              : <span className={'l-tag ' + (passed ? 'unsold' : 'sold')}>{passed ? 'Passed' : 'Sold'}</span>}
          </div>
          <h2 className="m-title">{lot.title}</h2>
          <div className="m-artist">{lot.artist}</div>
          <p className="m-desc">{lot.desc}</p>

          <div className="m-meta">
            <div className="m"><span className="k">Size</span><span className="v">{lot.size}</span></div>
            <div className="m"><span className="k">Edition</span><span className="v">1 / 1</span></div>
            <div className="m"><span className="k">Ships</span><span className="v">Worldwide</span></div>
          </div>

          {live ? (
            <div className="m-result">
              <div className="r-top">
                <div>
                  <div className="r-k">Current bid</div>
                  <div className="r-price">
                    <span className="cur">₹</span>
                    {lot.currentBid != null ? lot.currentBid.toLocaleString('en-IN') : '—'}
                  </div>
                </div>
                <div className="r-bids"><span className="n num">{lot.bids}</span> bids so far</div>
              </div>
              <div className="r-foot">
                <span>Auction in progress</span>
                <a href="/" style={{ color: 'var(--gold-bright)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                  Enter live room →
                </a>
              </div>
            </div>
          ) : (
            <div className={'m-result' + (passed ? ' passed' : '')}>
              <div className="r-top">
                <div>
                  <div className="r-k">{passed ? 'Outcome' : 'Hammer price'}</div>
                  {passed
                    ? <div className="r-price passed">No sale</div>
                    : <div className="r-price num"><span className="cur">$</span>{lot.soldPrice.toLocaleString('en-US')}</div>}
                </div>
                <div className="r-bids">
                  <span className="n num">{lot.bids}</span> bid{lot.bids === 1 ? '' : 's'} placed
                </div>
              </div>
              <div className="r-foot">
                {passed ? (
                  <span>Reserve was not met — returned to the atelier.</span>
                ) : (
                  <>
                    <span className={'winner' + (lot.winner?.name === 'You' ? ' you' : '')}>
                      Won by
                      <span
                        className="av"
                        style={{
                          background: lot.winner?.name === 'You'
                            ? 'linear-gradient(135deg,var(--gold-bright),var(--gold))'
                            : `hsl(${lot.winner?.hue ?? 0} 45% 62%)`,
                        }}
                      >
                        {lot.winner ? (lot.winner.name === 'You' ? '★' : lot.winner.name.slice(0, 1)) : '?'}
                      </span>
                      <b>{lot.winner?.name ?? '—'}</b>
                    </span>
                    {overStart > 0 && <span className="over">+{overStart}% over start</span>}
                  </>
                )}
              </div>
            </div>
          )}

          {userLoggedIn && lot.owned && lot.delivery && (
            <DeliveryTracker delivery={lot.delivery} />
          )}
        </div>
      </div>
    </div>
  );
}
