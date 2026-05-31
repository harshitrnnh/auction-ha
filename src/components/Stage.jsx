import { useState, useRef, useEffect } from 'react';

const clampZoom = (z) => Math.max(0.6, Math.min(2.2, z));

function TeeSlide({ rot, zoom }) {
  const sheen = (rot.y % 360 + 360) % 360;
  const ny = (rot.y % 360 + 540) % 360 - 180;
  const showFront = Math.abs(ny) <= 90;
  return (
    <div className="tee-slide">
      <div className="contact-shadow" style={{ transform: `translateX(-50%) scaleX(${0.8 + zoom * 0.25})`, opacity: 0.5 + (zoom - 1) * 0.2 }} />
      <div className="scene">
        <div className="turntable" style={{ transform: `scale(${zoom}) rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
          {[-1, -2, -3, -4].map((z) =>
            <div key={z} className="tee-edge" style={{ transform: `translateZ(${z * 4}px)` }} />
          )}
          <div className="tee-face tee-front" style={{ transform: 'translateZ(2px)', visibility: showFront ? 'visible' : 'hidden' }}>
            <div className="tee-shape">
              <div className="tee-art-frame">
                <div className="tee-art-label">
                  <span className="big">AI-printed artwork</span>
                  <span className="small">front · generative</span>
                </div>
              </div>
              <div className="tee-sheen" style={{ backgroundPosition: `${sheen}% 0` }} />
            </div>
          </div>
          <div className="tee-face tee-back" style={{ transform: 'rotateY(180deg) translateZ(2px)', visibility: showFront ? 'hidden' : 'visible' }}>
            <div className="tee-shape">
              <div className="tee-art-label"><span className="small">back · woven label</span></div>
              <div className="tee-sheen" style={{ backgroundPosition: `${sheen}% 0` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelSlide({ n, count, zoom }) {
  return (
    <div className="model-card" style={{ transform: `scale(${zoom})` }}>
      <div className="ph-icon">◐</div>
      <span className="ph-big">Model wearing the tee</span>
      <span className="ph-small">Editorial shot {n} / {count}</span>
    </div>
  );
}

export default function Stage({ modelCount = 3, lot }) {
  const total = modelCount + 1;
  const [view, setView] = useState(0);
  const [rot, setRot] = useState({ x: -6, y: -18 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [swipeDX, setSwipeDX] = useState(0);
  const drag = useRef(null);
  const swipe = useRef(null);
  const rafIdle = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const isThreeD = view === 0;
  const goTo = (n) => { setView(n); setZoom(1); setInteracted(false); };
  const go = (d) => goTo(Math.max(0, Math.min(total - 1, view + d)));

  useEffect(() => {
    let t0 = performance.now();
    const tick = (now) => {
      if (viewRef.current === 0 && !dragging && !interacted) {
        const e = (now - t0) / 1000;
        setRot({ x: -6 + Math.sin(e * 0.45) * 4, y: -10 + Math.sin(e * 0.32) * 30 });
      }
      rafIdle.current = requestAnimationFrame(tick);
    };
    rafIdle.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafIdle.current);
  }, [dragging, interacted]);

  const onDown = (e) => {
    const p = e.touches ? e.touches[0] : e;
    if (viewRef.current === 0) {
      setDragging(true);
      setInteracted(true);
      drag.current = { x: p.clientX, y: p.clientY, rx: rot.x, ry: rot.y };
    } else {
      swipe.current = { x: p.clientX, dx: 0 };
    }
  };

  useEffect(() => {
    const onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      if (drag.current) {
        const dx = p.clientX - drag.current.x;
        const dy = p.clientY - drag.current.y;
        setRot({ y: drag.current.ry + dx * 0.5, x: Math.max(-32, Math.min(32, drag.current.rx - dy * 0.35)) });
      } else if (swipe.current) {
        swipe.current.dx = p.clientX - swipe.current.x;
        setSwipeDX(swipe.current.dx);
      }
    };
    const onUp = () => {
      if (drag.current) { setDragging(false); drag.current = null; }
      if (swipe.current) {
        const dx = swipe.current.dx;
        if (dx < -55) go(1); else if (dx > 55) go(-1);
        swipe.current = null;
        setSwipeDX(0);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const onWheel = (e) => {
    setInteracted(true);
    setZoom((z) => clampZoom(z - e.deltaY * 0.0014));
  };
  const bumpZoom = (d) => { setInteracted(true); setZoom((z) => clampZoom(z + d)); };
  const reset = () => { setRot({ x: -6, y: -18 }); setZoom(1); setInteracted(false); };

  const STEP = 108;

  return (
    <div className="stage">
      <div className="stage-floor">
        <div className="spotlight" />
        <div className="floor-pool" />
        <div className="vignette" />
      </div>

      <div
        className="canvas"
        onMouseDown={onDown}
        onTouchStart={onDown}
        onWheel={onWheel}
        style={{ cursor: isThreeD ? (dragging ? 'grabbing' : 'grab') : (swipe.current ? 'grabbing' : 'grab') }}
      >
        <div className="carousel-track">
          {Array.from({ length: total }).map((_, i) => {
            const rel = i - view;
            const base = rel * STEP + (!isThreeD ? swipeDX / 7 : 0);
            const center = i === view;
            return (
              <div
                key={i}
                className={'slide' + (center ? '' : ' bg-slide')}
                onMouseDown={!center ? (e) => e.stopPropagation() : undefined}
                onClick={!center ? () => goTo(i) : undefined}
                style={{
                  transform: `translateX(${base}%) scale(${center ? 1 : 0.75}) rotateY(${rel * -7}deg)`,
                  opacity: Math.abs(rel) > 1 ? 0 : center ? 1 : undefined,
                  zIndex: 10 - Math.abs(rel),
                  transition: dragging || swipe.current ? 'none' : undefined,
                }}
              >
                {i === 0
                  ? <TeeSlide rot={rot} zoom={zoom} />
                  : <ModelSlide n={i} count={modelCount} zoom={zoom} />}
              </div>
            );
          })}
        </div>

        <div className="drag-hint" style={{ opacity: interacted ? 0 : 0.9 }}>
          <span>✦</span> {isThreeD ? 'drag to rotate · scroll to zoom' : 'scroll to zoom'}
        </div>

        <div className="zoom-controls" onMouseDown={(e) => e.stopPropagation()}>
          <button className="zoom-btn" onClick={() => bumpZoom(0.25)} aria-label="Zoom in">+</button>
          <button className="zoom-btn" onClick={() => bumpZoom(-0.25)} aria-label="Zoom out">−</button>
          <button className="zoom-btn small" onClick={reset} aria-label="Reset view">⟳</button>
        </div>
      </div>

      <div className="rail">
        <button className="rail-nav" onClick={() => go(-1)} disabled={view === 0} aria-label="Previous">‹</button>
        <button className={'thumb' + (isThreeD ? ' on' : '')} onClick={() => goTo(0)}>
          <div className="tball" />
          <span className="badge">360°</span>
        </button>
        {Array.from({ length: modelCount }).map((_, i) => (
          <button
            key={i}
            className={'thumb model-thumb' + (view === i + 1 ? ' on' : '')}
            onClick={() => goTo(i + 1)}
          >
            <span className="tlabel">0{i + 1}</span>
          </button>
        ))}
        <button className="rail-nav" onClick={() => go(1)} disabled={view === total - 1} aria-label="Next">›</button>
      </div>
    </div>
  );
}
