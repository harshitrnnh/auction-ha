import { useState, useEffect, useRef, useCallback } from 'react';
import { getArtworkUrl } from '../../data/lotsData';
import { createFrontCanvasForCard } from './LotsGrid';

const API = import.meta.env.VITE_API_URL ?? '';

export default function CanvasView({ lots, initialIdx, onClose, onViewDetails }) {
  const [idx, setIdx] = useState(initialIdx ?? 0);
  const [animKey, setAnimKey] = useState(0);
  const [overlaySrc, setOverlaySrc] = useState(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const lot = lots[idx];

  useEffect(() => {
    setOverlaySrc(null);
    const artUrl = getArtworkUrl(lot, API);
    if (!artUrl) return;
    createFrontCanvasForCard(artUrl, lot, (canvas) => {
      if (canvas) setOverlaySrc(canvas.toDataURL());
    });
  }, [lot]);

  const goTo = useCallback((newIdx) => {
    setAnimKey((k) => k + 1);
    setIdx(newIdx);
  }, []);

  const goPrev = useCallback(() => {
    if (idx > 0) goTo(idx - 1);
  }, [idx, goTo]);

  const goNext = useCallback(() => {
    if (idx < lots.length - 1) goTo(idx + 1);
  }, [idx, lots.length, goTo]);

  // Swipe detection
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    touchStartX.current = null;
    touchStartY.current = null;
    if (dy > 60) return; // vertical scroll, ignore
    if (dx > 50) goPrev();
    else if (dx < -50) goNext();
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const lotNo = lot?.lotNumber != null
    ? (lot.lotNumber < 0 ? 'Old ' + Math.abs(lot.lotNumber) : String(lot.lotNumber).padStart(3, '0'))
    : (lot?.lotNo ? String(lot.lotNo).padStart(3, '0') : '001');

  const hasPrev = idx > 0;
  const hasNext = idx < lots.length - 1;

  return (
    <div
      className="canvas-view"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div className="cv-header">
        <span className="cv-lot-label">Lot {lotNo}</span>
        <span className="cv-counter">{idx + 1} / {lots.length}</span>
      </div>

      {/* Tap zones for prev/next */}
      {hasPrev && (
        <button className="cv-tap-zone cv-tap-prev" onClick={goPrev} aria-label="Previous lot" />
      )}
      {hasNext && (
        <button className="cv-tap-zone cv-tap-next" onClick={goNext} aria-label="Next lot" />
      )}

      {/* Art stage */}
      <div className="cv-stage">
        <div className="cv-spotlight" />
        <div className="cv-art-wrap" key={animKey}>
          <div className="cv-tshirt-wrap">
            <img
              src="/tshirt_front_black_transparent10small.png"
              alt=""
              className="cv-tshirt-base"
            />
            {overlaySrc && (
              <img
                src={overlaySrc}
                alt={lot.title}
                className="cv-chest-art"
              />
            )}
            {!overlaySrc && (
              <div className="cv-art-loading">
                <span className="cv-spin" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Title area */}
      <div className="cv-title-area">
        <h2 className="cv-title">{lot.title}</h2>
        <p className="cv-subtitle">Edition 1/1 · Never reprinted</p>
      </div>

      {/* Progress dots (≤12 lots) or thin bar (more) */}
      {lots.length <= 12 ? (
        <div className="cv-dots" role="tablist">
          {lots.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Lot ${i + 1}`}
              className={'cv-dot' + (i === idx ? ' active' : '')}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      ) : (
        <div className="cv-progress-bar">
          <div
            className="cv-progress-fill"
            style={{ width: `${((idx + 1) / lots.length) * 100}%` }}
          />
        </div>
      )}

      {/* Bottom bar */}
      <div className="cv-bottom-bar">
        <button className="cv-btn-exit" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Exit
        </button>
        <button className="cv-btn-details" onClick={() => onViewDetails(lot)}>
          View Details
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
