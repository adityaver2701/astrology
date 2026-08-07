import { SIGNS } from '../astrologyEngine';

export default function HistoricalTransitsTab({
  selectedTransitPlanet, setSelectedTransitPlanet,
  historicalTransits, scanningTransits, handleScanHistoricalTransits,
}) {
  return (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Sign Transits Lookup (1976 - 2026)</h3>
              <p className="tab-instructions">
                Scan when the slow-moving planetary bodies (Saturn, Jupiter, Rahu, Ketu) changed zodiac signs during the last 50 years.
              </p>

              <div className="transit-selector-row glass-subcard">
                <div className="input-group">
                  <label htmlFor="transitPlanet" className="input-label">Select Planet</label>
                  <select
                    id="transitPlanet"
                    value={selectedTransitPlanet}
                    onChange={(e) => setSelectedTransitPlanet(e.target.value)}
                    className="text-input"
                  >
                    <option value="saturn">Saturn (Shani) - Slow transit ~2.5 yrs per sign</option>
                    <option value="jupiter">Jupiter (Guru) - Mid transit ~1 yr per sign</option>
                    <option value="rahu">Rahu (North Node) - Nodes transit ~1.5 yrs per sign</option>
                    <option value="ketu">Ketu (South Node) - Nodes transit ~1.5 yrs per sign</option>
                  </select>
                </div>
                <button
                  onClick={handleScanHistoricalTransits}
                  className="btn btn-primary"
                  disabled={scanningTransits}
                >
                  {scanningTransits ? 'Scanning...' : 'Scan 50 Years'}
                </button>
              </div>

              {/* Transit results */}
              {historicalTransits.length > 0 && (
                <div className="historical-results-list">
                  <h4 className="card-subtitle">Found {historicalTransits.length} Transit Sign Changes</h4>
                  <div className="table-responsive">
                    <table className="transit-results-table">
                      <thead>
                        <tr>
                          <th>Date of Transit</th>
                          <th>Left Sign</th>
                          <th>Entered Sign</th>
                          <th>Sign Element</th>
                          <th>Sign Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalTransits.map((tr, index) => {
                          const toSign = SIGNS.find(s => s.name === tr.toSignName);
                          // data-label drives the stacked-card layout under
                          // 768px — see .table-responsive rules in index.css
                          return (
                            <tr key={index}>
                              <td data-label="Date of Transit"><strong>{new Date(tr.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></td>
                              <td data-label="Left Sign" className="text-muted">{tr.fromSignName} ({SIGNS[tr.fromSign].sanskrit})</td>
                              <td data-label="Entered Sign" className="text-highlight">{tr.toSignName} ({SIGNS[tr.toSign].sanskrit})</td>
                              <td data-label="Sign Element">{toSign ? toSign.element : ''}</td>
                              <td data-label="Sign Quality">{toSign ? toSign.nature : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
  );
}
