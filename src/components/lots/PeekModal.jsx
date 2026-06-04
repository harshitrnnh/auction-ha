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
            <div className="m-tshirt-wrap">
              {/* Base t-shirt — front or back depending on shot */}
              <img
                src={shot === 0 ? '/tshirt_black_front_png.png' : '/tshirt_black_back_png.png'}
                alt=""
                className="m-tshirt-base"
              />
              {/* Artwork overlay on chest (front view only) */}
              {shot === 0 && lot.artworkUrl && (
                <img
                  src={lot.artworkUrl}
                  alt={lot.title}
                  className="m-chest-art"
                />
              )}
            </div>
          </div>
          <div className="m-thumbs">
            {/* Thumbnail 0: front view */}
            <button
              className={'m-thumb' + (shot === 0 ? ' on' : '')}
              onClick={() => setShot(0)}
            >
              <div className="m-thumb-tshirt">
                <img src="/tshirt_black_front_png.png" alt="Front" className="m-thumb-img" />
                {lot.artworkUrl && (
                  <img src={lot.artworkUrl} alt="" className="m-thumb-art" />
                )}
              </div>
            </button>
            {/* Thumbnail 1: back view */}
            <button
              className={'m-thumb' + (shot === 1 ? ' on' : '')}
              onClick={() => setShot(1)}
            >
              <div className="m-thumb-tshirt">
                <img src="/tshirt_black_back_png.png" alt="Back" className="m-thumb-img" />
              </div>
            </button>
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
