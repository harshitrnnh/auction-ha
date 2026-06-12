import { useState, useEffect } from 'react';
import { fmt, getArtworkUrl } from '../../data/lotsData';
import ArtBloom from './ArtBloom';

const API = import.meta.env.VITE_API_URL ?? '';
import DeliveryTracker from './DeliveryTracker';

function createBackCanvasForCard(logoImage, lot, callback) {
  let signalsSummarized = [];
  if (lot?.artworkHeadline && lot.artworkHeadline.startsWith('{')) {
    try {
      const parsed = JSON.parse(lot.artworkHeadline);
      signalsSummarized = parsed.data_signals_used_summarized || [];
    } catch (e) {}
  }

  const lotNo = lot?.lotNumber != null 
    ? String(lot.lotNumber).padStart(3, '0') 
    : (lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

  const lotDate = lot?.startsAt 
    ? new Date(lot.startsAt).toLocaleDateString('en-GB') 
    : new Date().toLocaleDateString('en-GB');

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = logoImage;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');

    // Transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const logoSize = 460;
    ctx.drawImage(img, (1200 - logoSize) / 2, 80, logoSize, logoSize);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';

    // Lot number and Date
    ctx.font = '46px Georgia, serif';
    ctx.fillText(`LOT NO. ${lotNo}`, 600, 640);
    ctx.fillText(`DATE - ${lotDate}`, 600, 705);

    // Summarized signals
    if (signalsSummarized.length > 0) {
      ctx.font = '36px Georgia, serif';
      const signalsText = signalsSummarized.join('   •   ');
      
      const words = signalsText.split(' ');
      let line = '';
      const lines = [];
      const maxWidth = 960;
      const lineHeight = 50;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());

      let currentY = 800;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 600, currentY);
        currentY += lineHeight;
      }
    }

    callback(canvas);
  };
  img.onerror = () => {
    callback(null);
  };
}

function createFrontCanvasForCard(artworkImage, lot, callback) {
  const lotNo = lot?.lotNumber != null 
    ? String(lot.lotNumber).padStart(3, '0') 
    : (lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

  const rawDate = lot?.startsAt || new Date();
  let dateStr = '';
  try {
    dateStr = new Date(rawDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    dateStr = '';
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = artworkImage;
  img.onload = () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.naturalWidth || img.width;
    tempCanvas.height = img.naturalHeight || img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    try {
      const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const data = imgData.data;
      const threshold = 15;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r < threshold && g < threshold && b < threshold) {
          data[i + 3] = 0;
        }
      }
      tempCtx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn('Failed to process image transparency:', e);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    
    ctx.drawImage(tempCanvas, 124, 70, 952, 1360);

    ctx.font = '46px Georgia, serif';
    ctx.fillText('Field Notes From the Day', 600, 1495);

    ctx.font = '32px Georgia, serif';
    ctx.fillText(`${dateStr}   •   Lot ${lotNo}   •   Edition 1/1`, 600, 1545);

    callback(canvas);
  };
  img.onerror = () => {
    callback(null);
  };
}

export default function PeekModal({ lot, onClose, userLoggedIn }) {
  const [shot, setShot] = useState(0);
  const live = lot.status === 'live';
  const passed = lot.status === 'unsold';

  const [frontOverlaySrc, setFrontOverlaySrc] = useState(null);
  const [backOverlaySrc, setBackOverlaySrc] = useState(null);

  const artworkUrl = getArtworkUrl(lot, API);

  useEffect(() => {
    setShot(0);
  }, [lot.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    if (artworkUrl) {
      createFrontCanvasForCard(artworkUrl, lot, (canvas) => {
        if (canvas) setFrontOverlaySrc(canvas.toDataURL());
      });
    }
    createBackCanvasForCard('/cf_logo.png', lot, (canvas) => {
      if (canvas) setBackOverlaySrc(canvas.toDataURL());
    });
  }, [artworkUrl, lot]);

  const overStart = !passed && !live && lot.startingBid
    ? Math.round((lot.soldPrice - lot.startingBid) / lot.startingBid * 100)
    : 0;

  let signalsUsed = [];
  let isJson = false;
  let interpretiveStatement = '';
  try {
    if (lot?.artworkHeadline && lot.artworkHeadline.startsWith('{')) {
      const parsed = JSON.parse(lot.artworkHeadline);
      signalsUsed = parsed.data_signals_used || [];
      interpretiveStatement = parsed.interpretive_statement || '';
      isJson = true;
    }
  } catch (e) {}

  const getDynamicTitle = () => {
    if (isJson) {
      try {
        const parsed = JSON.parse(lot.artworkHeadline);
        if (parsed.title) return parsed.title;
      } catch (e) {}
    }
    return lot.title ?? 'Loading…';
  };

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
                src={shot === 0 ? '/tshirt_front_black_transparent.png' : '/tshirt_back_black_transparent.png'}
                alt=""
                className="m-tshirt-base"
              />
              {/* Artwork overlay on chest (front or back overlay depending on shot) */}
              {shot === 0 && frontOverlaySrc && (
                <img
                  src={frontOverlaySrc}
                  alt={lot.title}
                  className="m-chest-art"
                />
              )}
              {shot === 1 && backOverlaySrc && (
                <img
                  src={backOverlaySrc}
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
                <img src="/tshirt_front_black_transparent.png" alt="Front" className="m-thumb-img" />
                {frontOverlaySrc && (
                  <img src={frontOverlaySrc} alt="" className="m-thumb-art" />
                )}
              </div>
            </button>
            {/* Thumbnail 1: back view */}
            <button
              className={'m-thumb' + (shot === 1 ? ' on' : '')}
              onClick={() => setShot(1)}
            >
              <div className="m-thumb-tshirt">
                <img src="/tshirt_back_black_transparent.png" alt="Back" className="m-thumb-img" />
                {backOverlaySrc && (
                  <img src={backOverlaySrc} alt="" className="m-thumb-art" />
                )}
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
          <h2 className="m-title">{getDynamicTitle()}</h2>
          <div className="m-artist">{lot.artist}</div>
          
          {isJson ? (
            <>
              <div className="lot-news-banner" style={{
                marginTop: '14px',
                padding: '10px 12px',
                borderRadius: 'var(--r-sm)',
                border: '1px dashed rgba(230, 194, 126, 0.25)',
                background: 'rgba(230, 194, 126, 0.04)',
                fontSize: '12px',
                textAlign: 'left'
              }}>
                <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '9.5px', color: 'var(--gold-bright)', marginBottom: '4px', fontWeight: 600 }}>
                  🗞 Inspired by today's happenings
                </span>
                {(() => {
                  const formatSignalWithSource = (sig) => {
                    if (!sig) return '';
                    const match = sig.match(/^([^:]+):\s*(.*)$/);
                    if (!match) return sig;
                    
                    const prefix = match[1].trim().toLowerCase();
                    const rest = match[2].trim();
                    
                    let source = '';
                    if (prefix.includes('upi') || prefix.includes('weird news') || prefix === 'weird') {
                      source = 'UPI Weid News';
                    } else if (prefix.includes('wikipedia') || prefix.includes('historical')) {
                      source = 'Wikipedia Top';
                    } else if (prefix.includes('oddity')) {
                      source = 'Oddity Central';
                    } else if (prefix.includes('positive') || prefix.includes('optimist') || prefix.includes('good news') || prefix.includes('huffpost')) {
                      source = 'HuffPost Positive';
                    } else if (prefix.includes('polymarket') || prefix.includes('future prediction') || prefix.includes('prediction')) {
                      source = 'Polymarket Predictions';
                    } else if (prefix.includes('song') || prefix.includes('spotify') || prefix.includes('cultural')) {
                      source = 'Spotify Top';
                    } else if (prefix.includes('meme') || prefix.includes('know your')) {
                      source = 'Know Your Meme';
                    } else if (prefix.includes('google trends') || prefix.includes('collective') || prefix.includes('trends')) {
                      source = 'Google Trends';
                    } else if (prefix.includes('apod') || prefix.includes('nasa')) {
                      source = 'NASA APOD';
                    } else {
                      source = match[1].split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    }
                    
                    return (
                      <>
                        {rest} <span style={{ fontStyle: 'italic' }}>[{source}]</span>
                      </>
                    );
                  };
                  return (
                    <ul style={{ color: 'var(--txt-dim)', lineHeight: '1.45', margin: 0, paddingLeft: '14px', listStyleType: 'disc' }}>
                      {signalsUsed.map((sig, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          {formatSignalWithSource(sig)}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>

              {interpretiveStatement && (
                <div style={{ marginTop: '20px', textAlign: 'left' }}>
                  <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '9.5px', color: 'var(--gold-bright)', marginBottom: '6px', fontWeight: 600 }}>
                    Artist Interpretive Statement
                  </span>
                  <p style={{ color: 'var(--txt-dim)', fontSize: '12.5px', lineHeight: '1.55', margin: 0, fontStyle: 'italic' }}>
                    {interpretiveStatement}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="m-desc">{lot.desc}</p>
          )}

          <div className="m-meta">
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
                    : <div className="r-price num"><span className="cur">₹</span>{lot.soldPrice.toLocaleString('en-IN')}</div>}
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
