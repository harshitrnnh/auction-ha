import { useState } from 'react';
import { TRACK_STEPS } from '../../data/lotsData';

export default function DeliveryTracker({ delivery }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    try { navigator.clipboard.writeText(delivery.tracking); } catch (_) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const stageLabel = [
    'Payment received',
    'Printing in the atelier',
    'On its way to you',
    'Delivered',
  ][delivery.stage];

  return (
    <div className="m-owned">
      <div className="own-head">
        <span className="spark">✦</span>
        <span className="t">You own this piece</span>
      </div>
      <div className="own-sub">
        {stageLabel}
        {delivery.eta && delivery.stage < 3 ? ' · arriving around ' + delivery.eta : ''}
      </div>

      <div className="tracker">
        {TRACK_STEPS.map((step, i) => {
          const last = TRACK_STEPS.length - 1;
          const done = i < delivery.stage || (i === delivery.stage && delivery.stage === last);
          const current = i === delivery.stage && delivery.stage < last;
          const when = delivery[step.field];
          return (
            <div key={step.key} className={'t-step' + (done ? ' done' : current ? ' current' : '')}>
              <div className="t-rail">
                <span className="t-node">
                  {done ? '✓' : current ? <span className="pulse" /> : i + 1}
                </span>
                <span className="t-line" />
              </div>
              <div className="t-body">
                <div className="lab">{step.lab}</div>
                <div className="when">
                  {done && when
                    ? when
                    : current
                      ? (when || 'In progress')
                      : 'Pending'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ship-info">
        <div className="si">
          <span className="k">Carrier</span>
          <span className="v">{delivery.carrier}</span>
        </div>
        <div className="si">
          <span className="k">{delivery.stage >= 3 ? 'Delivered' : 'Est. arrival'}</span>
          <span className="v">{delivery.stage >= 3 ? delivery.deliveredOn : delivery.eta}</span>
        </div>
        <div className="si full">
          <span className="k">Tracking number</span>
          <span className="v track">
            {delivery.tracking}
            <button className="copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </span>
        </div>
        <div className="si full">
          <span className="k">Shipping to</span>
          <span className="v">{delivery.address}</span>
        </div>
      </div>

      <button className="track-btn" onClick={delivery.trackingUrl ? () => window.open(delivery.trackingUrl, '_blank') : copy}>
        {delivery.stage >= 3 ? 'View delivery receipt' : 'Track this shipment →'}
      </button>
    </div>
  );
}
