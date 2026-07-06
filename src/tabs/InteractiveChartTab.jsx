import { useState, useEffect, useRef } from 'react';
import KundaliChart from '../components/KundaliChart';
import { SIGNS } from '../astrologyEngine';
import { PLANET_PERIODS_DAYS, formatDegrees } from '../constants';

export default function InteractiveChartTab({
  natalChart, transitChart, vargaCharts,
  transitDateInput, setTransitDateInput,
  transitTimeInput, setTransitTimeInput,
  showNakshatras, setShowNakshatras,
  onZoom,
}) {
  // Transit drag-to-scrub state (local to this tab)
  const [transitDragInfo, setTransitDragInfo] = useState(null); // { planetId, startAngle, startDateMs }
  const transitSvgRef = useRef(null);

  const handleDragStart = (planetId, startAngle) => setTransitDragInfo({
    planetId, startAngle,
    startDateMs: new Date(`${transitDateInput}T${transitTimeInput}Z`).getTime(),
  });

  // Mouse/touch drag → time scrub on transit chart
  useEffect(() => {
    if (!transitDragInfo) return;
    const getSvgAngle = (clientX, clientY) => {
      const el = transitSvgRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const x = (clientX - r.left) / r.width * 400 - 200;
      const y = (clientY - r.top) / r.height * 400 - 200;
      return Math.atan2(x, -y); // 0 = top, clockwise positive
    };
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      let delta = getSvgAngle(clientX, clientY) - transitDragInfo.startAngle;
      // Normalise to [-π, π]
      while (delta > Math.PI)  delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const period = PLANET_PERIODS_DAYS[transitDragInfo.planetId] || 365.25;
      // Counterclockwise drag (delta < 0) = forward in time for prograde planets
      const newMs = transitDragInfo.startDateMs - (delta / (2 * Math.PI)) * period * 86400000;
      const d = new Date(newMs);
      setTransitDateInput(d.toISOString().split('T')[0]);
      setTransitTimeInput(d.toISOString().substring(11, 16));
    };
    const onUp = () => setTransitDragInfo(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, [transitDragInfo, setTransitDateInput, setTransitTimeInput]);

  // Small magnifier button overlaid on each chart; opens the enlarge modal.
  const zoomBtn = (id) => (
    <button type="button" className="chart-zoom-btn" title="Enlarge chart" aria-label="Enlarge chart"
      onClick={() => onZoom(id)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
  );

  const renderNorthIndianChart = (planetsList, lagnaSign, draggable = false) => (
    <KundaliChart
      planets={planetsList}
      lagnaSign={lagnaSign}
      draggable={draggable}
      transitDragInfo={transitDragInfo}
      onDragStart={handleDragStart}
      svgRef={transitSvgRef}
    />
  );

  return (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Vedic Chart Layout (Kundali)</h3>
              
              <div className="chart-comparison-view">
                
                {/* Natal Chart Column */}
                <div className="chart-column">
                  <h4 className="chart-column-title">Lagna / Birth Chart</h4>
                  <div className="chart-svg-container">
                    {zoomBtn('natal')}
                    {renderNorthIndianChart(natalChart.planets, natalChart.lagnaSign)}
                  </div>
                  <p className="chart-description">
                    Lagna: <strong>{SIGNS[natalChart.lagnaSign].name}</strong> ({formatDegrees(natalChart.lagnaDegree)})
                  </p>
                </div>

                {/* Transit Chart Column */}
                <div className="chart-column">
                  <h4 className="chart-column-title font-purple">Transit Chart</h4>
                  <div className="chart-svg-container">
                    {transitChart && zoomBtn('transit')}
                    {transitChart && renderNorthIndianChart(transitChart.planets, natalChart.lagnaSign, true)}
                  </div>
                  <p className="chart-description" style={{ minHeight: '2.8em' }}>
                    {transitDragInfo
                      ? <span style={{ color:'var(--accent-gold)', fontWeight:700 }}>
                          ⟳ Dragging <em>{transitDragInfo.planetId}</em> — {transitDateInput} {transitTimeInput} UTC
                        </span>
                      : <>Transit Date: <strong>{transitDateInput}</strong> {transitTimeInput} UTC
                          <br/><span style={{ fontSize:'11px', opacity:0.6 }}>Drag any planet to scrub time</span></>
                    }
                  </p>
                </div>
              </div>

              {/* Divisional charts (Vargas) */}
              {vargaCharts.length > 0 && (
                <div className="varga-section glass-subcard">
                  <h4 className="card-subtitle">Divisional Charts (Vargas)</h4>
                  <p className="section-description">
                    Harmonic sub-charts derived from your sidereal positions — each magnifies a
                    specific area of life. Lagna and planets are re-mapped per the Parashari method.
                  </p>
                  <div className="varga-grid">
                    {vargaCharts.map(v => (
                      <div key={v.id} className="varga-cell">
                        <div className="varga-cell-title">{v.label}</div>
                        <div className="chart-svg-container varga-svg">
                          {zoomBtn(v.id)}
                          {renderNorthIndianChart(v.planets, v.lagnaSign)}
                        </div>
                        <div className="varga-cell-sub">Lagna: <strong>{SIGNS[v.lagnaSign].name}</strong></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Slider for real-time transit scrubbing */}
              <div className="transit-slider-controls glass-subcard">
                <h4 className="card-subtitle">Real-Time Transit Scrubber</h4>
                
                <div className="slider-row">
                  <div className="input-group flex-1">
                    <label htmlFor="transitDate" className="input-label">Transit Date</label>
                    <input
                      type="date"
                      id="transitDate"
                      value={transitDateInput}
                      onChange={(e) => setTransitDateInput(e.target.value)}
                      className="text-input"
                    />
                  </div>
                  <div className="input-group flex-1">
                    <label htmlFor="transitTime" className="input-label">Transit Time (UTC)</label>
                    <input
                      type="time"
                      id="transitTime"
                      value={transitTimeInput}
                      onChange={(e) => setTransitTimeInput(e.target.value)}
                      className="text-input"
                    />
                  </div>
                  <div className="input-group flex-1 checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={showNakshatras}
                        onChange={(e) => setShowNakshatras(e.target.checked)}
                      />
                      Show Nakshatras
                    </label>
                  </div>
                </div>

                {/* Timeline scrubber: direct date control, monthly precision, 1950–2060 */}
                <div className="scrubber-range-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                    <label htmlFor="yearScrubber" className="input-label" style={{ marginBottom: 0 }}>
                      Timeline Scrubber
                    </label>
                    <span style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                      {new Date(`${transitDateInput}T12:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                    </span>
                  </div>
                  <input
                    type="range"
                    id="yearScrubber"
                    min="1950"
                    max="2060"
                    step="0.0833"
                    value={(() => {
                      const d = new Date(`${transitDateInput}T12:00:00Z`);
                      return d.getFullYear() + d.getMonth() / 12;
                    })()}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      const year = Math.floor(val);
                      const month = Math.round((val - year) * 12);
                      const d = new Date(Date.UTC(year, month, 1));
                      setTransitDateInput(d.toISOString().split('T')[0]);
                    }}
                    className="range-scrubber"
                  />
                  <div className="scrubber-legend">
                    <span>1950</span>
                    <span>2005</span>
                    <span>2060</span>
                  </div>
                </div>
              </div>

              {/* Transit Nakshatra Info if enabled */}
              {showNakshatras && transitChart && (
                <div className="nakshatra-explorer glass-subcard spacing-top">
                  <h4 className="card-subtitle">Transit Nakshatra Coordinates</h4>
                  <div className="nakshatra-grid">
                    {Object.keys(transitChart.planets).map(key => {
                      const p = transitChart.planets[key];
                      const nLord = p.nakshatraLord;
                      const nPada = p.pada;
                      const nName = p.nakshatraName;
                      
                      return (
                        <div key={p.id} className="nak-badge">
                          <strong>{p.name}</strong>: {nName} (Pada {nPada})
                          <br />
                          <small className="font-gold">Ruler: {nLord}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
  );
}
