export default function AlignmentsTab({
  handleScanDegreeAlignments, scanningAlignments, hasScannedAlignments, degreeAlignments,
}) {
  return (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Degree & Nakshatra Transits Scanner</h3>
              <p className="tab-instructions">
                In Vedic Jyotish, deep karmic shifts are triggered when a transiting planet passes through the exact degree (within 1.0°) of a natal planet. 
                If the transit is also in the <strong>same Nakshatra</strong> (direct conjunction), it is categorized as a <strong>Life-Changing Event</strong>. 
                If they match in degree but transits in a <strong>different house/sign</strong>, it triggers key harmonic aspects and adjustments.
              </p>

              <div className="scan-controls-block glass-subcard spacing-bottom text-center" style={{ textAlign: 'center', padding: '30px 20px' }}>
                <h4 className="card-subtitle font-gold">Scan Future Transit Alignments (2026 - 2056)</h4>
                <p className="section-description spacing-bottom" style={{ maxWidth: '600px', margin: '10px auto 20px' }}>
                  The engine will scan the next 30 years of Saturn, Jupiter, Rahu, and Ketu transits, cross-referencing your birth chart coordinates to identify these key dates.
                </p>
                <button 
                  onClick={handleScanDegreeAlignments} 
                  className="btn btn-secondary"
                  disabled={scanningAlignments}
                >
                  {scanningAlignments ? 'Scanning Future Transits...' : 'Scan 30 Years for Alignments'}
                </button>
              </div>

              {scanningAlignments && (
                <div className="prediction-loading">
                  Searching daily ephemeris, checking Lahiri Ayanamsha boundaries, and computing degree overlaps...
                </div>
              )}

              {hasScannedAlignments && !scanningAlignments && (
                <div className="scanned-alignments-results tab-content-fade">
                  <h4 className="card-subtitle">Found {degreeAlignments.length} Significant Transit Alignments</h4>
                  <p className="section-description spacing-bottom">
                    Review the chronological timeline of planetary triggers below. Pay special attention to "Life-Changing Conjunctions" which mark major shifts.
                  </p>
                  <div className="alignments-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {degreeAlignments.length === 0 ? (
                      <p className="no-matches-found">No alignments matching the exact degree (within 1°) of your birth chart planets were found in this timeframe.</p>
                    ) : (
                      degreeAlignments.map((al, index) => {
                        const isHigh = al.severity === 'high';
                        return (
                          <div
                            key={index}
                            className={`alignment-card glass-subcard ${isHigh ? 'life-changing' : 'aspect-only'}`}
                            style={{
                              borderLeft: isHigh ? '3px solid var(--accent-gold)' : '3px solid var(--accent-violet)',
                              boxShadow: isHigh ? 'var(--shadow-neon-gold)' : 'none',
                              padding: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <div className="alignment-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(139, 92, 246, 0.1)', paddingBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                              <span className="prediction-date-range">
                                Peak Date: <strong>{al.date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                              </span>
                              <span className={`event-category-badge ${isHigh ? 'cat-finance' : 'cat-career'}`} style={{ fontSize: '10px', padding: '3px 8px', fontWeight: 'bold' }}>
                                {al.matchType}
                              </span>
                            </div>
                            <div className="alignment-card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginTop: '4px' }}>
                              <div className="alignment-quick-info" style={{ borderRight: '1px solid rgba(139, 92, 246, 0.1)', paddingRight: '16px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px' }}>
                                <div><strong>Transit:</strong> <span className="font-purple">{al.transitPlanet}</span> at {al.transitDegree.toFixed(1)}°</div>
                                <div><strong>House:</strong> {al.transitHouse} ({al.transitSign})</div>
                                <div><strong>Nakshatra:</strong> {al.transitNakshatra}</div>
                                <div style={{ height: '1px', background: 'rgba(139, 92, 246, 0.08)', margin: '4px 0' }}></div>
                                <div><strong>Natal Match:</strong> <span className="font-gold">{al.natalPlanet}</span> at {al.natalDegree.toFixed(1)}°</div>
                                <div><strong>House:</strong> {al.natalHouse} ({al.natalSign})</div>
                                <div><strong>Nakshatra:</strong> {al.natalNakshatra}</div>
                              </div>
                              <div className="alignment-explanation-text" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', lineHeight: '1.5', textAlign: 'justify' }}>
                                <p style={{ margin: 0 }}>{al.description}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
  );
}
