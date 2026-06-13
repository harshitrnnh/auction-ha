import { useState, useEffect, useRef, useCallback } from 'react';
import { fmt, getArtworkUrl } from '../../data/lotsData';

const API = import.meta.env.VITE_API_URL ?? '';
import DeliveryTracker from './DeliveryTracker';

/* ---------- Pinch/scroll zoom wrapper ---------- */
function ZoomableImage({ children, resetKey }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const lastDist = useRef(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const liveOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    liveOffset.current = { x: 0, y: 0 };
    lastDist.current = null;
  }, [resetKey]);

  const clampOffset = (ox, oy, s) => {
    const maxShift = (s - 1) * 150;
    return {
      x: Math.max(-maxShift, Math.min(maxShift, ox)),
      y: Math.max(-maxShift, Math.min(maxShift, oy)),
    };
  };

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      lastDist.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      dragging.current = true;
      dragStart.current = {
        x: e.touches[0].clientX - liveOffset.current.x,
        y: e.touches[0].clientY - liveOffset.current.y,
      };
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDist.current) {
        const ratio = dist / lastDist.current;
        setScale((s) => {
          const ns = Math.min(5, Math.max(1, s * ratio));
          const clamped = clampOffset(liveOffset.current.x, liveOffset.current.y, ns);
          liveOffset.current = clamped;
          setOffset(clamped);
          return ns;
        });
      }
      lastDist.current = dist;
    } else if (e.touches.length === 1 && dragging.current) {
      e.preventDefault();
      setScale((s) => {
        if (s <= 1) return s;
        const nx = e.touches[0].clientX - dragStart.current.x;
        const ny = e.touches[0].clientY - dragStart.current.y;
        const clamped = clampOffset(nx, ny, s);
        liveOffset.current = clamped;
        setOffset(clamped);
        return s;
      });
    }
  };

  const onTouchEnd = (e) => {
    if (e.touches.length < 2) lastDist.current = null;
    if (e.touches.length === 0) {
      dragging.current = false;
      setScale((s) => {
        if (s <= 1.05) {
          setOffset({ x: 0, y: 0 });
          liveOffset.current = { x: 0, y: 0 };
          return 1;
        }
        return s;
      });
    }
  };

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => {
      const ns = Math.min(5, Math.max(1, s * factor));
      if (ns <= 1.05) {
        setOffset({ x: 0, y: 0 });
        liveOffset.current = { x: 0, y: 0 };
        return 1;
      }
      const clamped = clampOffset(liveOffset.current.x, liveOffset.current.y, ns);
      liveOffset.current = clamped;
      setOffset(clamped);
      return ns;
    });
  }, []);

  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div
      ref={containerRef}
      style={{
        overflow: 'hidden',
        cursor: scale > 1 ? 'grab' : 'zoom-in',
        userSelect: 'none',
        touchAction: 'none',
        width: '100%',
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
          transformOrigin: 'center center',
          transition: dragging.current ? 'none' : 'transform 0.15s ease',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
      {scale > 1 && (
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(0,0,0,0.55)', color: '#fff',
          fontSize: '10px', borderRadius: 4, padding: '2px 6px',
          pointerEvents: 'none', letterSpacing: '0.04em',
        }}>
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}

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
  // draft overlay srcs: array parallel to lot.artworkDrafts
  const [draftSrcs, setDraftSrcs] = useState([]);

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

  // Render draft images
  useEffect(() => {
    const drafts = lot.artworkDrafts ?? [];
    if (drafts.length === 0) { setDraftSrcs([]); return; }
    const srcs = new Array(drafts.length).fill(null);
    let mounted = true;
    drafts.forEach((draft, i) => {
      const url = getArtworkUrl({ artworkUrl: draft.artworkUrl, lotNumber: lot.lotNumber }, API);
      if (!url) return;
      createFrontCanvasForCard(url, lot, (canvas) => {
        if (!mounted || !canvas) return;
        srcs[i] = canvas.toDataURL();
        setDraftSrcs([...srcs]);
      });
    });
    return () => { mounted = false; };
  }, [lot.id]);

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
            <ZoomableImage resetKey={shot}>
              {/* Shot 0: front t-shirt with selected artwork */}
              {(shot === 0 || shot >= 4) && (
                <div className="m-tshirt-wrap">
                  <img src="/tshirt_front_black_transparent10small.png" alt="" className="m-tshirt-base" />
                  {shot === 0 && frontOverlaySrc && (
                    <img src={frontOverlaySrc} alt={lot.title} className="m-chest-art" />
                  )}
                  {shot >= 4 && draftSrcs[shot - 4] && (
                    <img src={draftSrcs[shot - 4]} alt={`Draft ${shot - 3}`} className="m-chest-art" />
                  )}
                </div>
              )}
              {/* Shot 1: back t-shirt */}
              {shot === 1 && (
                <div className="m-tshirt-wrap">
                  <img src="/tshirt_back_black_transparent10small.png" alt="" className="m-tshirt-base" />
                  {backOverlaySrc && (
                    <img src={backOverlaySrc} alt={lot.title} className="m-chest-art" />
                  )}
                </div>
              )}
              {/* Shot 2: artwork with background removed */}
              {shot === 2 && frontOverlaySrc && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', padding: '12px',
                }}>
                  <img
                    src={frontOverlaySrc}
                    alt={lot.title}
                    style={{
                      maxWidth: 'min(80%, 320px)',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: 8,
                    }}
                  />
                </div>
              )}
            </ZoomableImage>
            <div style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              fontSize: '10px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.05em',
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              Scroll or pinch to zoom
            </div>
          </div>
          <div className="m-thumbs">
            {/* Shot 0: front t-shirt */}
            <button
              className={'m-thumb' + (shot === 0 ? ' on' : '')}
              onClick={() => setShot(0)}
              title="Front view"
            >
              <div className="m-thumb-tshirt">
                <img src="/tshirt_front_black_transparent10small.png" alt="Front" className="m-thumb-img" />
                {frontOverlaySrc && (
                  <img src={frontOverlaySrc} alt="" className="m-thumb-art" />
                )}
              </div>
            </button>
            {/* Shot 1: back t-shirt */}
            <button
              className={'m-thumb' + (shot === 1 ? ' on' : '')}
              onClick={() => setShot(1)}
              title="Back view"
            >
              <div className="m-thumb-tshirt">
                <img src="/tshirt_back_black_transparent10small.png" alt="Back" className="m-thumb-img" />
                {backOverlaySrc && (
                  <img src={backOverlaySrc} alt="" className="m-thumb-art" />
                )}
              </div>
            </button>
            {/* Shot 2: artwork without background */}
            {frontOverlaySrc && (
              <button
                className={'m-thumb' + (shot === 2 ? ' on' : '')}
                onClick={() => setShot(2)}
                title="Artwork image"
              >
                <div className="m-thumb-tshirt" style={{ padding: 4 }}>
                  <img
                    src={frontOverlaySrc}
                    alt="Artwork"
                    style={{ width: '90%', height: '90%', objectFit: 'contain', borderRadius: 4 }}
                  />
                </div>
              </button>
            )}
            {/* Shots 4+: draft artwork alternatives */}
            {(lot.artworkDrafts ?? []).map((draft, i) => (
              <button
                key={draft.id ?? i}
                className={'m-thumb' + (shot === i + 4 ? ' on' : '')}
                onClick={() => setShot(i + 4)}
                title={`Generated image ${i + 1}`}
              >
                <div className="m-thumb-tshirt">
                  <img src="/tshirt_front_black_transparent.png" alt="" className="m-thumb-img" />
                  {draftSrcs[i]
                    ? <img src={draftSrcs[i]} alt="" className="m-thumb-art" />
                    : <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', color: 'rgba(255,255,255,0.35)',
                      }}>…</div>
                  }
                  <div style={{
                    position: 'absolute', bottom: 2, right: 2,
                    fontSize: '8px', color: 'rgba(255,255,255,0.55)',
                    background: 'rgba(0,0,0,0.45)', borderRadius: 3, padding: '0 3px',
                    lineHeight: '1.6',
                  }}>v{i + 1}</div>
                </div>
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
                    
                    let text = sig.trim();
                    let source = '';
                    
                    // 1. Detect category from the original string before any stripping
                    const orig = text.toLowerCase();
                    
                    if (orig.includes('weird news') || orig.includes('upi_weird_news') || orig.includes('weird') || orig.includes('watch:')) {
                      source = 'UPI Weird News';
                    } else if (orig.includes('oddity_central') || orig.includes('oddity')) {
                      source = 'Oddity Central';
                    } else if (orig.includes('global attention') || orig.includes('collective attention') || orig.includes('top_wikipedia') || orig.includes('top wikipedia') || orig.includes('pageviews') || orig.includes('wikipedia top search') || orig.includes('daily news') || orig.includes('daily_news') || (orig.includes('wikipedia') && !orig.includes('day') && !orig.includes('event'))) {
                      source = 'Wikipedia Top Search';
                    } else if (orig.includes('optimist_daily') || orig.includes('optimist')) {
                      source = 'Optimist Daily';
                    } else if (orig.includes('positive_news') || orig.includes('positive news') || orig.includes('good news') || orig.includes('gnn')) {
                      source = 'Good News Network';
                    } else if (orig.includes('future prediction') || orig.includes('polymarket') || orig.includes('prediction') || orig.includes('probability') || orig.includes('percent probability') || orig.includes('% probability')) {
                      source = 'Polymarket Trending';
                    } else if (orig.includes('cultural resonance') || orig.includes('top_song') || orig.includes('top song') || orig.includes('song') || orig.includes('spotify') || orig.includes('apple music')) {
                      source = 'Top Song';
                    } else if (orig.includes('historical lens') || orig.includes('wikipedia_on_this_day') || orig.includes('wikipedia event') || orig.includes('historical') || orig.includes('history') || orig.includes('wikipedia on this day') || orig.includes('day') || orig.match(/^\d{3,4}:/)) {
                      source = 'Wikipedia On this Day';
                    }
                    
                    // 2. Define patterns to remove category prefixes
                    const categoryPatterns = [
                      /^(weird\s*news|upi_weird_news|oddity_central):\s*/i,
                      /^(global\s*attention|top_wikipedia|collective\s*attention):\s*/i,
                      /^(positive\s*news|optimist_daily):\s*/i,
                      /^(future\s*prediction|polymarket):\s*/i,
                      /^(cultural\s*resonance|top_song|song):\s*/i,
                      /^(historical\s*lens|wikipedia_on_this_day|wikipedia\s*event):\s*/i
                    ];
                    
                    // 3. Define patterns to remove source prefixes
                    const sourcePatterns = [
                      { pat: /^watch:\s*/i, src: 'UPI Weird News' },
                      { pat: /^upi\s*weird\s*news:\s*/i, src: 'UPI Weird News' },
                      { pat: /^top\s*wikipedia:\s*/i, src: 'Wikipedia Top Search' },
                      { pat: /^wikipedia\s*top\s*search:\s*/i, src: 'Wikipedia Top Search' },
                      { pat: /^wikipedia\s*on\s*this\s*day:\s*/i, src: 'Wikipedia On this Day' },
                      { pat: /^optimist\s*daily:\s*/i, src: 'Optimist Daily' },
                      { pat: /^positive\s*news:\s*/i, src: 'Good News Network' },
                      { pat: /^good\s*news\s*network:\s*/i, src: 'Good News Network' },
                      { pat: /^polymarket:\s*/i, src: 'Polymarket Trending' },
                      { pat: /^polymarket\s*trending:\s*/i, src: 'Polymarket Trending' },
                      { pat: /^top\s*song:\s*/i, src: 'Top Song' },
                      { pat: /^oddity\s*central:\s*/i, src: 'Oddity Central' }
                    ];
                    
                    // 4. Repeatedly strip category & source prefixes from the text until stable
                    let cleaned = true;
                    while (cleaned) {
                      cleaned = false;
                      for (const pat of categoryPatterns) {
                        if (pat.test(text)) {
                          text = text.replace(pat, '');
                          cleaned = true;
                          break;
                        }
                      }
                      for (const item of sourcePatterns) {
                        if (item.pat.test(text)) {
                          if (!source) source = item.src;
                          text = text.replace(item.pat, '');
                          cleaned = true;
                          break;
                        }
                      }
                    }
                    
                    // 5. Ultimate fallback if still no source determined
                    if (!source) {
                      source = 'Wikipedia Top Search';
                    }
                    
                    // Capitalize first letter of the remaining text
                    if (text.length > 0) {
                      text = text.charAt(0).toUpperCase() + text.slice(1);
                    }
                    
                    return (
                      <>
                        {text} <span style={{ fontStyle: 'italic' }}>[{source}]</span>
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
            <div className="m"><span className="k">Material</span><span className="v">220 GSM, 100% Cotton</span></div>
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
