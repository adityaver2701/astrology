import AIReading from '../AIReading';
import { SIGNS, NAKSHATRAS, DASHA_YEARS, getCurrentDasha, getPlanetDignity } from '../astrologyEngine';
import { PLANET_NAMES, formatDegrees } from '../constants';
import { DUSTHANA_INTERPRETATIONS } from '../dusthanaInterpretations';

export default function BirthChartTab({ birthDetails, natalChart, dashaData, trikBhavaAnalysis, chartSummary, setActiveTab }) {
  return (
            <div className="tab-content-fade">
              <div className="birth-summary-row">
                <h3 className="tab-section-title">Birth Analysis of {birthDetails.name}</h3>
                <span className="info-badge">Lahiri Ayanamsha: {formatDegrees(natalChart.ayanamsha)}</span>
              </div>

              {/* At-a-glance summary strip */}
              {(() => {
                const moon = natalChart.planets.moon;
                const sun = natalChart.planets.sun;
                const { currentMahadasha, currentAntardasha } = dashaData
                  ? getCurrentDasha(dashaData, new Date())
                  : { currentMahadasha: null, currentAntardasha: null };
                return (
                  <div className="glance-strip">
                    <div className="glance-chip">
                      <span className="glance-icon">↑</span>
                      <div className="glance-body">
                        <div className="glance-label">Lagna (Asc)</div>
                        <div className="glance-value">{SIGNS[natalChart.lagnaSign].name}</div>
                        <div className="glance-sub">{SIGNS[natalChart.lagnaSign].sanskrit} · {formatDegrees(natalChart.lagnaDegree)}</div>
                      </div>
                    </div>
                    {moon && (
                      <div className="glance-chip">
                        <span className="glance-icon">☽</span>
                        <div className="glance-body">
                          <div className="glance-label">Moon Sign</div>
                          <div className="glance-value">{moon.signName}</div>
                          <div className="glance-sub">{moon.nakshatraName} · Pada {moon.pada}</div>
                        </div>
                      </div>
                    )}
                    {sun && (
                      <div className="glance-chip">
                        <span className="glance-icon">☉</span>
                        <div className="glance-body">
                          <div className="glance-label">Sun Sign</div>
                          <div className="glance-value">{sun.signName}</div>
                          <div className="glance-sub">{sun.nakshatraName}</div>
                        </div>
                      </div>
                    )}
                    {currentMahadasha && (
                      <div
                        className="glance-chip clickable"
                        onClick={() => setActiveTab('dasha-system')}
                        title="Open the full Vimshottari Dasha timeline"
                      >
                        <span className="glance-icon">⏳</span>
                        <div className="glance-body">
                          <div className="glance-label">Running Dasha</div>
                          <div className="glance-value">
                            {currentMahadasha.lord}{currentAntardasha ? ` / ${currentAntardasha.lord}` : ''}
                          </div>
                          <div className="glance-sub">
                            Until {currentMahadasha.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })} →
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Table of Planet Positions matching Astro-Sage Grid style */}
              <div className="table-responsive">
                <table className="planetary-table">
                  <thead>
                    <tr>
                      <th>Planet</th>
                      <th>Zodiac Sign</th>
                      <th>Sanskrit Sign</th>
                      <th>Longitude</th>
                      <th>Dignity</th>
                      <th>Retrograde</th>
                      <th>Nakshatra</th>
                      <th>Pada</th>
                      <th>Nakshatra Lord</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Ascendant details as first row */}
                    {/* data-label drives the stacked-card layout on phones:
                        under 768px the table collapses to one card per row and
                        each cell renders its column name via ::before. Keep
                        these in sync with the <th> text above. */}
                    <tr>
                      <td data-label="Planet"><strong>Ascendant (Lagna)</strong></td>
                      <td data-label="Zodiac Sign">{SIGNS[natalChart.lagnaSign].name}</td>
                      <td data-label="Sanskrit Sign">{SIGNS[natalChart.lagnaSign].sanskrit}</td>
                      <td data-label="Longitude">{formatDegrees(natalChart.lagnaDegree)}</td>
                      <td data-label="Dignity">--</td>
                      <td data-label="Retrograde">--</td>
                      <td data-label="Nakshatra">{NAKSHATRAS[Math.floor((natalChart.lagnaSign * 30 + natalChart.lagnaDegree) / 13.333333)].name}</td>
                      <td data-label="Pada">{Math.floor(((natalChart.lagnaSign * 30 + natalChart.lagnaDegree) % 13.333333) / 3.333333) + 1}</td>
                      <td data-label="Nakshatra Lord">{NAKSHATRAS[Math.floor((natalChart.lagnaSign * 30 + natalChart.lagnaDegree) / 13.333333)].lord}</td>
                    </tr>
                    {/* Planet positions rows */}
                    {Object.keys(natalChart.planets).map(key => {
                      const p = natalChart.planets[key];
                      const dignity = getPlanetDignity(p.id, p.signIndex);
                      const dignityLabel = dignity === 'exalted' ? '⬆ Exalted' : dignity === 'debilitated' ? '⬇ Debilitated' : dignity === 'own' ? '✦ Own Sign' : '—';
                      const dignityClass = dignity === 'exalted' ? 'dignity-exalted' : dignity === 'debilitated' ? 'dignity-debilitated' : dignity === 'own' ? 'dignity-own' : '';
                      return (
                        <tr key={p.id}>
                          <td data-label="Planet">{PLANET_NAMES[p.id]}</td>
                          <td data-label="Zodiac Sign">{p.signName}</td>
                          <td data-label="Sanskrit Sign">{p.signSanskrit}</td>
                          <td data-label="Longitude">{formatDegrees(p.degree)}</td>
                          <td data-label="Dignity"><span className={dignityClass}>{dignityLabel}</span></td>
                          <td data-label="Retrograde">{p.retrograde ? <span className="retrograde-indicator">Yes (R)</span> : 'No'}</td>
                          <td data-label="Nakshatra">{p.nakshatraName}</td>
                          <td data-label="Pada">{p.pada}</td>
                          <td data-label="Nakshatra Lord">{p.nakshatraLord}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ✨ AI Reading (Cloudflare Workers AI) */}
              <AIReading
                summary={chartSummary}
                birth={{
                  name: birthDetails.name,
                  place: birthDetails.placeName,
                  date: birthDetails.date,
                  time: birthDetails.time,
                }}
                disabled={!chartSummary}
              />

              {/* Trik Bhava Commentary and Yogas Section */}
              {trikBhavaAnalysis && (
                <div className="trik-analysis-block">
                  <h3 className="tab-section-title spacing-top">Trik Bhava & Karmic Shadow Analysis</h3>
                  <p className="karmic-disclaimer">
                    Based on <em>Brihat Parashara Hora Shastra</em> and the karmic-psychological teachings of 
                    Pandit Krishna Ashant's <em>Trik Bhavo Ki Gatha</em>. Focusing on the challenges, transformations, 
                    and expenditures of the 6th, 8th, and 12th houses.
                  </p>

                  {/* Active Yogas */}
                  {trikBhavaAnalysis.yogas.length > 0 && (
                    <div className="yogas-list">
                      <h4 className="card-subtitle font-gold">Formed Vipareeta Raja Yogas</h4>
                      {trikBhavaAnalysis.yogas.map((yoga, i) => (
                        <div key={i} className="yoga-card alert-card">
                          <strong>{yoga.name}</strong>: {yoga.description}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* House Commentary Grid */}
                  <div className="trik-commentary-grid">
                    <div className="trik-card glass-subcard">
                      <div className="trik-card-header">
                        <span className="card-badge bg-6">6th House</span>
                        <h4>Shatru, Roga, Rina (Struggles & Healing)</h4>
                      </div>
                      <p className="trik-detail-text">
                        <strong>6th Lord ({trikBhavaAnalysis.placements[6].lord.toUpperCase()})</strong> resides in the{' '}
                        <strong>{trikBhavaAnalysis.placements[6].placedHouse} House</strong> ({trikBhavaAnalysis.placements[6].placedSignName}).
                      </p>
                      <p className="trik-body-text">
                        {DUSTHANA_INTERPRETATIONS.lord6[trikBhavaAnalysis.placements[6].placedHouse]}
                      </p>
                    </div>

                    <div className="trik-card glass-subcard">
                      <div className="trik-card-header">
                        <span className="card-badge bg-8">8th House</span>
                        <h4>Ayu, Randhra (Secret transformations & Occult)</h4>
                      </div>
                      <p className="trik-detail-text">
                        <strong>8th Lord ({trikBhavaAnalysis.placements[8].lord.toUpperCase()})</strong> resides in the{' '}
                        <strong>{trikBhavaAnalysis.placements[8].placedHouse} House</strong> ({trikBhavaAnalysis.placements[8].placedSignName}).
                      </p>
                      <p className="trik-body-text">
                        {DUSTHANA_INTERPRETATIONS.lord8[trikBhavaAnalysis.placements[8].placedHouse]}
                      </p>
                    </div>

                    <div className="trik-card glass-subcard">
                      <div className="trik-card-header">
                        <span className="card-badge bg-12">12th House</span>
                        <h4>Vyaya, Moksha (Losses, Sleep, Dissolution)</h4>
                      </div>
                      <p className="trik-detail-text">
                        <strong>12th Lord ({trikBhavaAnalysis.placements[12].lord.toUpperCase()})</strong> resides in the{' '}
                        <strong>{trikBhavaAnalysis.placements[12].placedHouse} House</strong> ({trikBhavaAnalysis.placements[12].placedSignName}).
                      </p>
                      <p className="trik-body-text">
                        {DUSTHANA_INTERPRETATIONS.lord12[trikBhavaAnalysis.placements[12].placedHouse]}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Current Dasha Summary Banner */}
              {dashaData && (() => {
                const { currentMahadasha, currentAntardasha } = getCurrentDasha(dashaData, new Date());
                if (!currentMahadasha) return null;
                const mEnd = currentMahadasha.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
                const adEnd = currentAntardasha ? currentAntardasha.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : '';
                return (
                  <div className="dasha-banner glass-subcard spacing-top" style={{ borderLeft: '3px solid var(--accent-gold)', padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>Current Mahadasha</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-gold)', textTransform: 'capitalize' }}>{currentMahadasha.lord} Dasha</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ends {mEnd} · {DASHA_YEARS[currentMahadasha.lord]} yr period</div>
                    </div>
                    {currentAntardasha && (
                      <div style={{ borderLeft: '1px solid rgba(139,92,246,0.3)', paddingLeft: '18px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>Current Antardasha</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-violet)', textTransform: 'capitalize' }}>{currentAntardasha.lord} Antardasha</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ends {adEnd}</div>
                      </div>
                    )}
                    <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
                      → See full timeline in <strong style={{ color: 'var(--accent-violet)', cursor: 'pointer' }} onClick={() => setActiveTab('dasha-system')}>Vimshottari Dasha</strong> tab
                    </div>
                  </div>
                );
              })()}
            </div>
  );
}
