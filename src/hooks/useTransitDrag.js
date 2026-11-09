import { useCallback, useEffect, useRef, useState } from 'react';
import { PLANET_PERIODS_DAYS } from '../constants';

// ── Drag-a-planet-to-scrub-time ───────────────────────────────────────────
// Shared by the Interactive Kundali tab and the enlarged chart modal, so the
// transit chart behaves the same at either size. Each caller gets its own
// drag state and its own svgRef (the angle maths needs the box of the chart
// actually being dragged — the tab's chart and the modal's chart differ).
//
// Dragging a planet around the chart centre moves time: a full turn equals
// one orbital period of that planet; counter-clockwise is forward in time for
// prograde planets (that's the direction they move through the houses).

/** Angle of a client point around the chart centre (0 = top, clockwise +). */
function angleIn(el, clientX, clientY) {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const x = (clientX - r.left) / r.width * 400 - 200;
  const y = (clientY - r.top) / r.height * 400 - 200;
  return Math.atan2(x, -y);
}

export function useTransitDrag({ transitDateInput, transitTimeInput, setTransitDateInput, setTransitTimeInput }) {
  const [dragInfo, setDragInfo] = useState(null); // { planetId, startAngle, startDateMs }
  const svgRef = useRef(null);

  const onDragStart = useCallback((planetId, startAngle) => setDragInfo({
    planetId,
    startAngle,
    startDateMs: new Date(`${transitDateInput}T${transitTimeInput}Z`).getTime(),
  }), [transitDateInput, transitTimeInput]);

  useEffect(() => {
    if (!dragInfo) return;
    const onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      let delta = angleIn(svgRef.current, p.clientX, p.clientY) - dragInfo.startAngle;
      // Normalise to [-π, π]
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const period = PLANET_PERIODS_DAYS[dragInfo.planetId] || 365.25;
      const d = new Date(dragInfo.startDateMs - (delta / (2 * Math.PI)) * period * 86400000);
      if (Number.isNaN(d.getTime())) return;
      setTransitDateInput(d.toISOString().split('T')[0]);
      setTransitTimeInput(d.toISOString().substring(11, 16));
    };
    const onUp = () => setDragInfo(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [dragInfo, setTransitDateInput, setTransitTimeInput]);

  return { dragInfo, svgRef, onDragStart };
}
