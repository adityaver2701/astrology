import { useEffect, useRef } from 'react';
import KundaliChart from './KundaliChart';
import TransitScrubber from './TransitScrubber';
import { useTransitDrag } from '../hooks/useTransitDrag';
import { IconClose } from './Icons';

// ── Enlarged chart viewer ─────────────────────────────────────────────────
// Opened from the magnifier on any chart in the Interactive Kundali tab, with
// ‹ › to step through every chart (D1, transit, vargas).
//
// The TRANSIT chart stays live when enlarged: planets can be dragged to scrub
// time exactly like in the tab, and the timeline slider / step buttons sit
// under it. Both views share App's transitDateInput/transitTimeInput, so
// closing the modal leaves the tab at the moment you scrubbed to.

export default function ChartZoomModal({
  charts, zoomId, setZoomId,
  transitDateInput, setTransitDateInput,
  transitTimeInput, setTransitTimeInput,
}) {
  const drag = useTransitDrag({ transitDateInput, transitTimeInput, setTransitDateInput, setTransitTimeInput });
  // A drag (planet or slider) that ends outside the modal produces a click on
  // the overlay — only close when the press also STARTED on the overlay.
  const pressStartedOnOverlay = useRef(false);

  const idx = charts.findIndex(c => c.id === zoomId);
  const close = () => setZoomId(null);
  const go = (delta) => {
    const next = charts[idx + delta];
    if (next) setZoomId(next.id);
  };

  // Escape closes; ←/→ step between charts (unless a form control has focus,
  // where the arrows belong to the slider / date inputs).
  useEffect(() => {
    if (idx < 0) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setZoomId(null); return; }
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && charts[idx - 1]) setZoomId(charts[idx - 1].id);
      if (e.key === 'ArrowRight' && charts[idx + 1]) setZoomId(charts[idx + 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, charts, setZoomId]);

  if (idx < 0) return null;
  const cur = charts[idx];
  const isTransit = cur.id === 'transit';

  return (
    <div
      className="chart-zoom-overlay"
      onPointerDown={(e) => { pressStartedOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (pressStartedOnOverlay.current && e.target === e.currentTarget) close();
        pressStartedOnOverlay.current = false;
      }}
    >
      <div
        className={`chart-zoom-modal${isTransit ? ' has-scrubber' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-zoom-title"
        data-testid="chart-zoom"
      >
        <div className="chart-zoom-head">
          <h3 className="chart-zoom-title" id="chart-zoom-title">{cur.title}</h3>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close enlarged chart">
            <IconClose size={18} />
          </button>
        </div>

        <div className="chart-zoom-body">
          <button type="button" className="chart-zoom-nav" disabled={idx <= 0}
            onClick={() => go(-1)} aria-label="Previous chart">‹</button>
          <div className={`chart-zoom-svg${isTransit ? ' is-draggable' : ''}`}>
            <KundaliChart
              planets={cur.planets}
              lagnaSign={cur.lagnaSign}
              draggable={isTransit}
              transitDragInfo={isTransit ? drag.dragInfo : null}
              onDragStart={drag.onDragStart}
              svgRef={drag.svgRef}
            />
          </div>
          <button type="button" className="chart-zoom-nav" disabled={idx >= charts.length - 1}
            onClick={() => go(1)} aria-label="Next chart">›</button>
        </div>

        {isTransit ? (
          <>
            <p className="chart-zoom-hint" aria-live="polite">
              {drag.dragInfo
                ? <><strong>⟳ Moving {drag.dragInfo.planetId}</strong> — {transitDateInput} {transitTimeInput} UTC</>
                : <>Drag any planet around the chart, or use the timeline below, to move through time.</>}
            </p>
            <TransitScrubber
              idPrefix="zoomTransit"
              compact
              transitDateInput={transitDateInput} setTransitDateInput={setTransitDateInput}
              transitTimeInput={transitTimeInput} setTransitTimeInput={setTransitTimeInput}
            />
            <p className="chart-zoom-sub">{idx + 1} / {charts.length}</p>
          </>
        ) : (
          <p className="chart-zoom-sub">{cur.subtitle} · {idx + 1} / {charts.length}</p>
        )}
      </div>
    </div>
  );
}
