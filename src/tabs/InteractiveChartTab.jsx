import KundaliChart from '../components/KundaliChart';
import TransitScrubber from '../components/TransitScrubber';
import { useTransitDrag } from '../hooks/useTransitDrag';
import { SIGNS } from '../astrologyEngine';
import { formatDegrees } from '../constants';

export default function InteractiveChartTab({
  natalChart, transitChart, vargaCharts,
  transitDateInput, setTransitDateInput,
  transitTimeInput, setTransitTimeInput,
  showNakshatras, setShowNakshatras,
  onZoom,
}) {
  // Transit drag-to-scrub (shared with the enlarged chart — hooks/useTransitDrag.js)
  const { dragInfo: transitDragInfo, svgRef: transitSvgRef, onDragStart: handleDragStart } = useTransitDrag({
    transitDateInput, transitTimeInput, setTransitDateInput, setTransitTimeInput,
  });

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
                
                <TransitScrubber
                  transitDateInput={transitDateInput} setTransitDateInput={setTransitDateInput}
                  transitTimeInput={transitTimeInput} setTransitTimeInput={setTransitTimeInput}
                >
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
                </TransitScrubber>
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
