import AIReading from '../AIReading';
import PromptGenerator from '../components/PromptGenerator';
import { SIGNS, NAKSHATRAS, DASHA_YEARS, getCurrentDasha, getPlanetDignity } from '../astrologyEngine';
import { PLANET_NAMES, PLANET_GLYPHS, formatDegrees } from '../constants';
import { DUSTHANA_INTERPRETATIONS } from '../dusthanaInterpretations';

const DIGNITY_LABEL = { exalted: '⬆ Exalted', debilitated: '⬇ Debilitated', own: '✦ Own Sign' };
const DIGNITY_CLASS = { exalted: 'dignity-exalted', debilitated: 'dignity-debilitated', own: 'dignity-own' };

/** One display row per body (ascendant first), shared by the table and the phone list. */
function buildRows(natalChart) {
  const lagnaLon = natalChart.lagnaSign * 30 + natalChart.lagnaDegree;
  const lagnaNak = NAKSHATRAS[Math.floor(lagnaLon / (360 / 27))];
  const rows = [{
    id: 'asc', glyph: '↑', name: 'Ascendant (Lagna)', short: 'Ascendant',
    sign: SIGNS[natalChart.lagnaSign].name, sanskrit: SIGNS[natalChart.lagnaSign].sanskrit,
    house: 1, degree: formatDegrees(natalChart.lagnaDegree),
    nakshatra: lagnaNak.name, pada: Math.floor((lagnaLon % (360 / 27)) / (360 / 108)) + 1, nakLord: lagnaNak.lord,
    dignity: null, retrograde: false,
  }];
  Object.keys(natalChart.planets).forEach(key => {
    const p = natalChart.planets[key];
    const dignity = getPlanetDignity(p.id, p.signIndex);
    rows.push({
      id: p.id, glyph: PLANET_GLYPHS[p.id], name: PLANET_NAMES[p.id],
      short: PLANET_NAMES[p.id].replace(/\s*\(.*\)$/, ''),
      sign: p.signName, sanskrit: p.signSanskrit,
      house: ((p.signIndex - natalChart.lagnaSign + 12) % 12) + 1,
      degree: formatDegrees(p.degree),
      nakshatra: p.nakshatraName, pada: p.pada, nakLord: p.nakshatraLord,
      dignity: DIGNITY_LABEL[dignity] ? dignity : null,
      dignityLabel: DIGNITY_LABEL[dignity] || '—',
      dignityClass: DIGNITY_CLASS[dignity] || '',
      retrograde: !!p.retrograde,
    });
  });
  return rows;
}

export default function BirthChartTab({ birthDetails, natalChart, dashaData, trikBhavaAnalysis, chartSummary, vargaCharts, setActiveTab }) {
  const rows = buildRows(natalChart);
  return (
            <div className="tab-content-fade">
              {/* Who/when/where and the Big Three now live in the chart card above
                  every tab (components/ChartHero.jsx), so this tab opens straight
                  on the positions table. */}
              <div className="birth-summary-row">
                <h3 className="tab-section-title">
                  Planetary Positions
                  {birthDetails.name ? <span className="title-for"> · {birthDetails.name}</span> : null}
                </h3>
                <span className="info-badge">Lahiri Ayanamsha: {formatDegrees(natalChart.ayanamsha)}</span>
              </div>

              {/* Table of Planet Positions matching Astro-Sage Grid style.
                  Desktop/tablet only — phones get the compact .planet-list below
                  (CSS swaps them at 768px; see styles/shell.css). */}
              <div className="table-responsive natal-table">
                <table className="planetary-table">
                  <thead>
                    <tr>
                      <th>Planet</th>
                      <th>Zodiac Sign</th>
                      <th>House</th>
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
                    {/* data-label is kept on every cell so the generic stacked
                        card layout still works if this table is ever shown on
                        a phone. Keep in sync with the <th> text above. */}
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td data-label="Planet">
                          <span className={`planet-glyph pg-${r.id}`} aria-hidden="true">{r.glyph}</span>
                          {r.id === 'asc' ? <strong>{r.name}</strong> : r.name}
                        </td>
                        <td data-label="Zodiac Sign">{r.sign}</td>
                        <td data-label="House">{r.house}</td>
                        <td data-label="Sanskrit Sign">{r.sanskrit}</td>
                        <td data-label="Longitude">{r.degree}</td>
                        <td data-label="Dignity">{r.id === 'asc' ? '--' : <span className={r.dignityClass}>{r.dignityLabel}</span>}</td>
                        <td data-label="Retrograde">{r.id === 'asc' ? '--' : r.retrograde ? <span className="retrograde-indicator">Yes (R)</span> : 'No'}</td>
                        <td data-label="Nakshatra">{r.nakshatra}</td>
                        <td data-label="Pada">{r.pada}</td>
                        <td data-label="Nakshatra Lord">{r.nakLord}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone layout: one short card per body instead of a ten-row
                  label/value stack — the whole chart fits in about two screens. */}
              <ul className="planet-list" aria-label="Planetary positions">
                {rows.map(r => (
                  <li key={r.id} className="planet-card">
                    <span className={`planet-glyph pg-${r.id}`} aria-hidden="true">{r.glyph}</span>
                    <div className="pc-main">
                      <div className="pc-line">
                        <span className="pc-name">{r.short}</span>
                        <span className="pc-pos">{r.sign} <strong>{r.degree}</strong></span>
                      </div>
                      <div className="pc-line pc-sub">
                        <span>{r.nakshatra} · pada {r.pada}</span>
                        <span>House {r.house}</span>
                      </div>
                      <div className="pc-tags">
                        <span>{r.sanskrit}</span>
                        <span>Star lord {r.nakLord}</span>
                        {r.dignity && <span className={`pc-tag ${r.dignityClass}`}>{r.dignityLabel}</span>}
                        {r.retrograde && r.id !== 'asc' && <span className="pc-tag retrograde-indicator">Retrograde</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <PromptGenerator
                birthDetails={birthDetails} natalChart={natalChart}
                dashaData={dashaData} vargaCharts={vargaCharts}
              />

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
