import { DASHA_YEARS, getCurrentDasha, getActivePratyantar, shadbalLabel } from '../astrologyEngine';
import { formatDegrees } from '../constants';

export default function DashaTab({ natalChart, dashaData, activePDFData, expandedDasha, setExpandedDasha }) {
            const today = new Date();
            const { currentMahadasha, currentAntardasha, nextMahadasha } = getCurrentDasha(dashaData, today);

            const dashaColors = {
              ketu: '#ef4444', venus: '#ec4899', sun: '#f97316', moon: '#6366f1',
              mars: '#dc2626', rahu: '#8b5cf6', jupiter: '#22c55e', saturn: '#64748b', mercury: '#06b6d4'
            };

            const fmtDate = (d) => d instanceof Date
              ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
              : '';

            const totalMs = (d) => d.endDate.getTime() - d.startDate.getTime();
            const pct = (d) => Math.max(0, Math.min(100, (Math.min(today.getTime(), d.endDate.getTime()) - d.startDate.getTime()) / totalMs(d) * 100));

            return (
              <div className="tab-content-fade">
                <h3 className="tab-section-title">Vimshottari Dasha — 120 Year Planetary Period System</h3>
                <p className="tab-instructions">
                  Derived from the Moon&apos;s Nakshatra at birth. The Mahadasha (major period) governs the primary karmic theme of each life phase, subdivided into 9 Antardashas following the same planetary sequence.
                  {activePDFData?.pratyantar?.length > 0 && ' Pratyantar (3rd-level) periods from your uploaded PDF are shown inside each Antardasha.'}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Birth Moon: <strong style={{ color: 'var(--accent-gold)' }}>{natalChart.planets.moon.nakshatraName}</strong> Nakshatra (Lord: {natalChart.planets.moon.nakshatraLord}) — Pada {natalChart.planets.moon.pada} · {formatDegrees(natalChart.planets.moon.longitude)} in {natalChart.planets.moon.signName}
                </p>

                {/* Pratyantar summary banner when PDF loaded */}
                {activePDFData?.pratyantar?.length > 0 && (() => {
                  const pr = getActivePratyantar(activePDFData, today);
                  if (!pr) return null;
                  return (
                    <div className="pratantar-banner glass-subcard spacing-bottom">
                      <div className="pratantar-banner-icon">⏱</div>
                      <div className="pratantar-banner-body">
                        <div className="pratantar-banner-title">Active Pratyantar (3rd-Level Period)</div>
                        <div className="pratantar-banner-lords">
                          <span style={{ textTransform: 'capitalize' }}>{pr.maha}</span>
                          <span className="pratantar-arrow">›</span>
                          <span style={{ textTransform: 'capitalize' }}>{pr.antar}</span>
                          <span className="pratantar-arrow">›</span>
                          <span style={{ textTransform: 'capitalize', color: 'var(--gold-bright)', fontWeight: 700 }}>{pr.pratantar}</span>
                        </div>
                        <div className="pratantar-banner-dates">
                          {pr.startDate instanceof Date ? pr.startDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                          {' → '}
                          {pr.endDate instanceof Date ? pr.endDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                        </div>
                      </div>
                      {activePDFData.shadbala?.[pr.pratantar] && (() => {
                        const sl = shadbalLabel(activePDFData, pr.pratantar);
                        return sl ? (
                          <div className="pratantar-banner-strength" style={{ color: sl.color }}>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '2px' }}>Pratyantar Lord Strength</div>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>{sl.label}</div>
                            <div style={{ fontSize: '11px' }}>{sl.val.toFixed(2)} Rupas</div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  );
                })()}

                {currentMahadasha && (
                  <div className="glass-subcard spacing-bottom" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '20px', border: '1px solid rgba(234,179,8,0.3)' }}>
                    <div>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>Active Mahadasha</div>
                      <div style={{ fontSize: '22px', fontWeight: 'bold', color: dashaColors[currentMahadasha.lord] || 'var(--accent-gold)', textTransform: 'capitalize' }}>{currentMahadasha.lord} Dasha</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{fmtDate(currentMahadasha.startDate)} → {fmtDate(currentMahadasha.endDate)}</div>
                      <div style={{ marginTop: '10px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct(currentMahadasha).toFixed(1)}%`, background: dashaColors[currentMahadasha.lord] || 'var(--accent-gold)', borderRadius: '3px' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{pct(currentMahadasha).toFixed(1)}% elapsed</div>
                    </div>
                    {currentAntardasha && (
                      <div>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>Active Antardasha</div>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: dashaColors[currentAntardasha.lord] || 'var(--accent-violet)', textTransform: 'capitalize' }}>{currentAntardasha.lord} Antardasha</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{fmtDate(currentAntardasha.startDate)} → {fmtDate(currentAntardasha.endDate)}</div>
                        <div style={{ marginTop: '10px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct(currentAntardasha).toFixed(1)}%`, background: dashaColors[currentAntardasha.lord] || 'var(--accent-violet)', borderRadius: '3px' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{pct(currentAntardasha).toFixed(1)}% elapsed</div>
                      </div>
                    )}
                    {nextMahadasha && (
                      <div style={{ opacity: 0.7 }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>Next Mahadasha</div>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: dashaColors[nextMahadasha.lord] || 'var(--text-primary)', textTransform: 'capitalize' }}>{nextMahadasha.lord} Dasha</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Begins {fmtDate(nextMahadasha.startDate)}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{DASHA_YEARS[nextMahadasha.lord]}-year period</div>
                      </div>
                    )}
                  </div>
                )}

                <h4 className="card-subtitle spacing-top" style={{ marginBottom: '10px' }}>Full Dasha Timeline</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dashaData.map((dasha, dashIdx) => {
                    const isActive = currentMahadasha && dasha.lord === currentMahadasha.lord && dasha.startDate.getTime() === currentMahadasha.startDate.getTime();
                    const isPast = dasha.endDate < today;
                    const isExpanded = expandedDasha === dashIdx;
                    return (
                      <div
                        key={dashIdx}
                        className="glass-subcard"
                        style={{
                          border: isActive ? '1px solid var(--accent-gold)' : '1px solid rgba(139,92,246,0.15)',
                          boxShadow: isActive ? '0 0 12px rgba(234,179,8,0.12)' : 'none',
                          opacity: isPast ? 0.55 : 1,
                          overflow: 'hidden'
                        }}
                      >
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' }}
                          onClick={() => setExpandedDasha(isExpanded ? null : dashIdx)}
                        >
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dashaColors[dasha.lord] || '#888', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'capitalize', color: isActive ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                              {dasha.lord.charAt(0).toUpperCase() + dasha.lord.slice(1)} Mahadasha
                            </span>
                            {dasha.isPartial && (
                              <span style={{ fontSize: '10px', background: 'rgba(139,92,246,0.2)', padding: '1px 6px', borderRadius: '8px', marginLeft: '8px', color: 'var(--text-muted)' }}>Balance</span>
                            )}
                            {isActive && (
                              <span style={{ fontSize: '10px', background: 'rgba(234,179,8,0.2)', padding: '1px 6px', borderRadius: '8px', marginLeft: '8px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>ACTIVE NOW</span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                            <div>{fmtDate(dasha.startDate)} → {fmtDate(dasha.endDate)}</div>
                            <div>{dasha.years.toFixed(1)} yrs</div>
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>

                        {/* Progress bar for active mahadasha */}
                        {isActive && (
                          <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}>
                            <div style={{ height: '100%', width: `${pct(dasha).toFixed(1)}%`, background: 'var(--accent-gold)' }} />
                          </div>
                        )}

                        {/* Expanded: Antardasha grid */}
                        {isExpanded && (
                          <div style={{ borderTop: '1px solid rgba(139,92,246,0.12)', padding: '12px 16px 8px' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '8px' }}>Antardashas</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px' }}>
                              {dasha.antardashas.map((antar, aIdx) => {
                                const isCurrentAntar = isActive && currentAntardasha && antar.lord === currentAntardasha.lord && Math.abs(antar.startDate.getTime() - currentAntardasha.startDate.getTime()) < 864e5;
                                const antarPast = antar.endDate < today;
                                return (
                                  <div key={aIdx} style={{
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    background: isCurrentAntar ? 'rgba(234,179,8,0.06)' : 'rgba(255,255,255,0.02)',
                                    border: isCurrentAntar ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(139,92,246,0.1)',
                                    opacity: antarPast ? 0.5 : 1,
                                    fontSize: '12px'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: dashaColors[antar.lord] || '#888' }} />
                                      <strong style={{ textTransform: 'capitalize', color: isCurrentAntar ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                                        {antar.lord.charAt(0).toUpperCase() + antar.lord.slice(1)}
                                      </strong>
                                      {isCurrentAntar && (
                                        <span style={{ fontSize: '9px', background: 'rgba(234,179,8,0.25)', padding: '0 4px', borderRadius: '6px', color: 'var(--accent-gold)' }}>NOW</span>
                                      )}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                      {fmtDate(antar.startDate)} {'->'} {fmtDate(antar.endDate)}
                                    </div>
                                    {/* Pratyantar (3rd level) inline list from PDF data */}
                                    {isCurrentAntar && activePDFData?.pratyantar?.length > 0 && (() => {
                                      const prMatch = activePDFData.pratyantar.find(pr =>
                                        pr.maha === dasha.lord && pr.antar === antar.lord &&
                                        pr.startDate && pr.endDate && today >= pr.startDate && today <= pr.endDate
                                      );
                                      if (!prMatch?.pratantars?.length) return null;
                                      let segCursor = prMatch.startDate;
                                      return (
                                        <div className="pratantar-inline-list">
                                          {prMatch.pratantars.map((pp, pIdx) => {
                                            const segStart = segCursor;
                                            segCursor = pp.endDate;
                                            const isNow = pp.endDate && today <= pp.endDate && today >= segStart;
                                            const isPastSeg = pp.endDate && today > pp.endDate;
                                            return (
                                              <div key={pIdx} className={`pratantar-inline-row${isNow ? ' active' : ''}${isPastSeg ? ' past' : ''}`}>
                                                <div className="pratantar-dot" style={{ background: dashaColors[pp.lord] || '#888' }} />
                                                <span className="pratantar-lord" style={{ textTransform: 'capitalize' }}>{pp.lord}</span>
                                                <span className="pratantar-end">{'->'}  {fmtDate(pp.endDate)}</span>
                                                {isNow && <span className="pratantar-now-badge">NOW</span>}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
}
