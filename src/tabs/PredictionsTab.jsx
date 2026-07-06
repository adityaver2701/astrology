import { Fragment } from 'react';
import {
  SIGNS, getCurrentDasha, getAccuracyProfile, getActivePratyantar, getActiveSadesati,
  enhanceTransitWithPDFData, binduLabel, analyzePeakDateAlignments, shadbalLabel,
} from '../astrologyEngine';

export default function PredictionsTab({
  natalChart, dashaData, activePDFData, lifeEvents, isAdmin,
  autoMatches, autoMatchesComputed, autoMatchesLoading,
  expandedAutoMatch, setExpandedAutoMatch, setAutoMatchesKey, setAutoMatches,
  savedPredictions, handleLoadSavedPrediction, handleDeleteSavedPrediction,
  csvPreviewEvents, setCsvPreviewEvents, dragActive, csvError,
  handleDrag, handleDrop, handleFileChange, handleLoadWorkspaceCSV,
  handleBulkImport, handleUpdatePreviewEvent, handleToggleSelectAllPreview,
  newEvent, setNewEvent, addEventFormOpen, setAddEventFormOpen,
  eventsListOpen, setEventsListOpen,
  selectedEventId, predicting, predictionResults,
  handleAddEvent, handleDeleteEvent, handlePredictFuture,
  predictionSaveNameInput, setPredictionSaveNameInput, handleSaveCurrentPrediction,
}) {
  return (
            <div className="tab-content-fade">
              <h3 className="tab-section-title">Life Events Transit Analytics Matcher</h3>
              <p className="tab-instructions">
                Log major events in your life (marriage, relocations, career changes, illnesses) to map the planetary transit signature during that time.
                The engine will identify similar future transits of Saturn, Jupiter, Rahu, and Ketu between 2026 and 2056, calculating a similarity score, and analyzing your birth chart potential.
              </p>

              {/* ── ACCURACY ENGINE PANEL ── */}
              {(() => {
                const acc = getAccuracyProfile(activePDFData);
                const today = new Date();
                const pratantar = activePDFData ? getActivePratyantar(activePDFData, today) : null;
                const sadesati = activePDFData ? getActiveSadesati(activePDFData, today) : null;
                return (
                  <div className="accuracy-panel glass-subcard spacing-bottom">
                    <div className="acc-header">
                      <div className="acc-title">⚡ Prediction Accuracy Engine</div>
                      <div className="acc-score-row">
                        <div className="acc-bar-track">
                          <div className="acc-bar-fill acc-base" style={{ width: `${acc.base}%` }} title={`Base: ${acc.base}%`} />
                          <div className="acc-bar-fill acc-earned" style={{ width: `${acc.earned}%`, marginLeft: `${acc.base}%` }} title={`PDF boost: +${acc.earned}%`} />
                        </div>
                        <span className="acc-score-num">{acc.total}<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/{acc.max}%</span></span>
                      </div>
                    </div>

                    {/* Data sources grid */}
                    <div className="acc-sources">
                      <div className={`acc-source active`}>
                        <span className="acc-src-dot green" />Transit Positions
                      </div>
                      <div className={`acc-source active`}>
                        <span className="acc-src-dot green" />Mahadasha / Antardasha
                      </div>
                      <div className={`acc-source active`}>
                        <span className="acc-src-dot green" />Trik Bhava Analysis
                      </div>
                      {acc.breakdown.map(b => (
                        <div key={b.key} className={`acc-source${b.active ? ' active' : ' locked'}`}>
                          <span className={`acc-src-dot${b.active ? ' green' : ' grey'}`} />
                          {b.label}
                          {b.active && <span className="acc-src-plus">+{b.points}%</span>}
                        </div>
                      ))}
                    </div>

                    {/* Active Pratyantar & Sadesati */}
                    {(pratantar || sadesati) && (
                      <div className="acc-live-row">
                        {pratantar && (
                          <div className="acc-live-chip">
                            <span className="acc-live-label">Pratyantar Now</span>
                            <strong style={{ textTransform: 'capitalize' }}>
                              {pratantar.maha} › {pratantar.antar} › {pratantar.pratantar}
                            </strong>
                            <span className="acc-live-dates">
                              ends {pratantar.endDate instanceof Date ? pratantar.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            </span>
                          </div>
                        )}
                        {sadesati && (
                          <div className={`acc-live-chip sadesati-${sadesati.phase?.toLowerCase() || 'active'}`}>
                            <span className="acc-live-label">Sadesati</span>
                            <strong>{sadesati.type} — {sadesati.phase || ''} Phase</strong>
                            <span className="acc-live-dates">{sadesati.sign} · ends {sadesati.endDate instanceof Date ? sadesati.endDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Unlock suggestions when no PDF */}
                    {!activePDFData && (
                      <div className="acc-unlock-row">
                        <span className="acc-unlock-icon">🔓</span>
                        <div className="acc-unlock-text">
                          <strong>Upload an AstroSage PDF to this profile</strong> to unlock Ashtakvarga bindu scoring,
                          Pratyantar-level timing (±2 week precision), KP sub-lord event triggers, Shadbala-weighted dashas and Sadesati overlays.
                          <br /><em style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Open ⊙ Profiles → select this profile → drop PDF in the upload zone</em>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── UPCOMING TRANSIT WINDOWS (auto-computed) ── */}
              <div className="upcoming-windows-panel glass-subcard spacing-bottom">
                <div className="uw-header">
                  <div className="uw-title">
                    🔮 Upcoming Transit Windows
                    <span className="uw-subtitle">auto-scanned from {lifeEvents.length} life events · past analogs & upcoming</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {autoMatchesComputed && !autoMatchesLoading && (
                      <button className="uw-refresh-btn" onClick={() => { setAutoMatchesKey(null); setAutoMatches([]); setExpandedAutoMatch(null); }}>
                        ↻ Refresh
                      </button>
                    )}
                    {autoMatchesLoading && <span className="uw-scanning-text">⟳ Scanning all events…</span>}
                  </div>
                </div>

                {autoMatchesLoading && (
                  <div className="uw-loading">
                    <div className="uw-loading-bar" />
                    <span>Computing transit signatures for {lifeEvents.length} life events across {new Date().getFullYear()}–{new Date().getFullYear()+3}…</span>
                  </div>
                )}

                {autoMatchesComputed && !autoMatchesLoading && autoMatches.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px 0' }}>
                    No matching transit windows (past or upcoming) found. Try adding more life events.
                  </p>
                )}

                {autoMatchesComputed && !autoMatchesLoading && autoMatches.length > 0 && (
                  <div className="uw-list">
                    {autoMatches.map((match, idx) => {
                      const enhanced = enhanceTransitWithPDFData(match, activePDFData);
                      const isExpanded = expandedAutoMatch === idx;
                      const today = new Date();
                      const peakDate = match.peakDate instanceof Date ? match.peakDate : new Date(match.peakDate);
                      const startDate = match.startDate instanceof Date ? match.startDate : new Date(match.startDate);
                      const endDate = match.endDate instanceof Date ? match.endDate : new Date(match.endDate);
                      const daysToStart = Math.ceil((startDate.getTime() - today.getTime()) / 86400000);
                      const isNow = today >= startDate && today <= endDate;
                      const isThisMonth = !isNow && daysToStart >= 0 && daysToStart <= 35;
                      const isNextMonth = !isNow && !isThisMonth && daysToStart > 35 && daysToStart <= 70;
                      const isPast = match._group === 'past' || endDate.getTime() < today.getTime();
                      const monthsAgo = Math.round((today.getTime() - endDate.getTime()) / (30.4 * 86400000));
                      const pastAgoLabel = monthsAgo >= 12 ? `${Math.round(monthsAgo/12)}y ago` : `${Math.max(1, monthsAgo)}mo ago`;
                      const grp = match._group;
                      const showGroupHeader = idx === 0 || autoMatches[idx - 1]._group !== grp;

                      const { currentMahadasha, currentAntardasha } = dashaData
                        ? getCurrentDasha(dashaData, peakDate) : {};

                      const peakPratantar = activePDFData ? getActivePratyantar(activePDFData, peakDate) : null;
                      const peakSadesati = activePDFData ? getActiveSadesati(activePDFData, peakDate) : null;
                      const peakAlignments = (() => {
                        try { return analyzePeakDateAlignments(peakDate, natalChart.planets, natalChart.lagnaSign); }
                        catch { return []; }
                      })();

                      return (
                        <Fragment key={idx}>
                        {showGroupHeader && (
                          <div className={`uw-group-header ${grp === 'past' ? 'uw-group-past' : 'uw-group-upcoming'}`}>
                            {grp === 'past' ? '↩ Past similar transits (already occurred)' : '🔮 Upcoming windows'}
                          </div>
                        )}
                        <div className={`uw-item${isExpanded ? ' expanded' : ''}${isNow ? ' uw-now' : ''}${isPast ? ' uw-past' : ''}`}>
                          {/* ── Window Header ── */}
                          <div className="uw-item-header" onClick={() => setExpandedAutoMatch(isExpanded ? null : idx)}>
                            <div className="uw-item-left">
                              {/* Time badge */}
                              {isPast && <span className="uw-badge uw-badge-past">↩ {pastAgoLabel}</span>}
                              {isNow && <span className="uw-badge uw-badge-now">● NOW</span>}
                              {isThisMonth && <span className="uw-badge uw-badge-soon">This Month</span>}
                              {isNextMonth && <span className="uw-badge uw-badge-next">Next Month</span>}
                              {!isNow && !isThisMonth && !isNextMonth && daysToStart > 0 && (
                                <span className="uw-badge uw-badge-future">In {Math.ceil(daysToStart/30)}mo</span>
                              )}

                              {/* Date range */}
                              <span className="uw-date-range">
                                <strong>{startDate.toLocaleDateString(undefined, { month:'short', year:'numeric' })}</strong>
                                {' – '}
                                <strong>{endDate.toLocaleDateString(undefined, { month:'short', year:'numeric' })}</strong>
                              </span>

                              {/* Match scores */}
                              <span className="uw-score">{match.score}%</span>
                              {enhanced.adjustedScore !== match.score && activePDFData?.ashtakvarga && (
                                <span className="uw-score adjusted">{enhanced.adjustedScore}%▲</span>
                              )}
                              {peakSadesati && (
                                <span className={`sadesati-chip phase-${peakSadesati.phase?.toLowerCase() || 'active'}`}>
                                  ☄ {peakSadesati.phase}
                                </span>
                              )}
                            </div>

                            <div className="uw-item-right">
                              {/* Reference event */}
                              <span className={`event-category-badge cat-${(match.referenceEvent.category || 'career').toLowerCase()}`}>
                                {match.referenceEvent.category}
                              </span>
                              <span className="uw-ref-name">
                                {match.referenceEvent.name.slice(0, 45)}{match.referenceEvent.name.length > 45 ? '…' : ''}
                                <span className="uw-ref-year">
                                  ({new Date(match.referenceEvent.startDate).getFullYear()})
                                </span>
                              </span>
                              <span className="uw-chevron">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </div>

                          {/* ── Quick summary strip ── */}
                          <div className="uw-summary-strip">
                            {/* Transit houses */}
                            <div className="uw-transits-row">
                              {Object.entries(match.transits || {}).map(([p, t]) => (
                                <span key={p} className="uw-transit-chip">
                                  <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{p.slice(0,3)}</span>
                                  <span>H{t.house}</span>
                                </span>
                              ))}
                            </div>
                            {/* Dasha */}
                            {currentMahadasha && (
                              <div className="uw-dasha-row">
                                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Dasha: </span>
                                <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{currentMahadasha.lord}</span>
                                {currentAntardasha && <span style={{ color: 'var(--text-muted)' }}> › {currentAntardasha.lord}</span>}
                                {peakPratantar && <span style={{ color: 'var(--cyan)', fontSize: '10px' }}> › {peakPratantar.pratantar}</span>}
                              </div>
                            )}
                            {/* Bindu scores if PDF */}
                            {activePDFData?.ashtakvarga && enhanced.binduScores && (
                              <div className="uw-bindu-row">
                                {Object.entries(enhanced.binduScores).map(([planet, scores]) => {
                                  const bl = binduLabel(scores.bindu);
                                  if (!bl) return null;
                                  return (
                                    <span key={planet} className="bindu-chip" style={{ borderColor: bl.color, color: bl.color, fontSize: '10px', padding: '1px 6px' }}>
                                      {planet.slice(0,3)} {scores.bindu}/8
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* ── Expanded full report ── */}
                          {isExpanded && (
                            <div className="uw-expanded-body">
                              {/* Section 1: Transit Data */}
                              <div className="prediction-body-grid" style={{ borderTop: '1px solid var(--border-gold)', paddingTop: '14px' }}>
                                <div className="prediction-section border-right">
                                  <h5 className="prediction-sec-title">Transit Positions at Peak ({peakDate.toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' })})</h5>
                                  <ul className="details-list">
                                    {Object.entries(match.transits || {}).map(([key, tInfo]) => {
                                      const origInfo = match.originalSignature?.eventSignature?.[key];
                                      return (
                                        <li key={key} className={origInfo && tInfo.house === origInfo.house ? 'exact-match' : ''}>
                                          <strong>{key.toUpperCase()}</strong>: House {tInfo.house} ({SIGNS[tInfo.signIndex]?.name})
                                          {origInfo && <><br /><small className="text-muted">(Past: House {origInfo.house} in {SIGNS[origInfo.signIndex]?.name})</small></>}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>

                                <div className="prediction-section">
                                  <h5 className="prediction-sec-title font-purple">Trik Bhava & Natal Potential</h5>
                                  <div className="commentary-scroll">
                                    {match.trikCommentaries.map((com, ci) => (
                                      <div key={ci} className="trik-commentary-item">
                                        <h6 className="commentary-item-title font-gold">{com.title}</h6>
                                        <p className="commentary-item-text">{com.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Section 3: Degree alignments */}
                                {peakAlignments.length > 0 && (
                                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-gold)', paddingTop: '12px' }}>
                                    <h5 className="prediction-sec-title font-gold">
                                      Degree & Nakshatra Triggers ({peakAlignments.length} planet{peakAlignments.length !== 1 ? 's' : ''} matched)
                                    </h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {peakAlignments.map((al, ai) => {
                                        const isHigh = al.severity === 'high';
                                        return (
                                          <div key={ai} style={{ padding: '7px 10px', borderRadius: '6px', background: isHigh ? 'rgba(234,179,8,0.05)' : 'rgba(139,92,246,0.03)', border: isHigh ? '1px solid rgba(234,179,8,0.25)' : '1px solid rgba(139,92,246,0.1)', fontSize: '12px' }}>
                                            <strong className="font-purple">{al.transitPlanet}</strong> transits your <strong className="font-gold">{al.transitHouse}H</strong> ({al.transitSign}) at {al.transitDegree.toFixed(1)}° matching natal <strong className="font-gold">{al.natalPlanet}</strong> at {al.natalDegree.toFixed(1)}° — <span style={{ color: isHigh ? 'var(--gold-bright)' : 'var(--violet)', fontWeight: 600 }}>{al.matchType}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Saved Matcher Memory List */}
              {savedPredictions.length > 0 && (
                <div className="saved-predictions-history glass-subcard spacing-bottom">
                  <h4 className="card-subtitle font-gold">Saved Predictions Memory</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {savedPredictions.map(pred => (
                      <div
                        key={pred.id}
                        className="prediction-history-item"
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(139, 92, 246, 0.2)',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px'
                        }}
                      >
                        <div>
                          <strong className="text-highlight" style={{ fontSize: '13px' }}>{pred.title}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Birth Profile: <strong>{pred.profileName}</strong> | Event: <strong>{pred.eventName}</strong> ({pred.eventStart} to {pred.eventEnd})
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleLoadSavedPrediction(pred)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedPrediction(pred.id)}
                            className="btn"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              background: 'transparent',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: 'var(--accent-red, #ef4444)'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CSV Uploader Panel */}
              <div className="csv-uploader-section glass-subcard spacing-bottom">
                <h4 className="card-subtitle">Bulk Import Life Events (CSV)</h4>
                <p className="section-description">
                  Attach/upload a CSV file containing your historical timeline or load the preloaded workspace CSV.
                  Required columns: <code>Year</code>, <code>Event Title</code>. Optional: <code>Description</code>.
                </p>
                
                <div 
                  className={`csv-dropzone ${dragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="dropzone-content">
                    <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                    <p>Drag and drop your life events CSV file here, or</p>
                    <label className="btn btn-primary file-browse-btn">
                      Browse Files
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleFileChange} 
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>

                {isAdmin && (
                  <div className="csv-actions-row">
                    <button onClick={handleLoadWorkspaceCSV} className="btn btn-secondary">
                      Load Workspace CSV Timeline
                    </button>
                  </div>
                )}

                {csvError && <p className="error-message csv-error">{csvError}</p>}
              </div>

              {/* CSV Import Preview Wizard */}
              {csvPreviewEvents.length > 0 && (
                <div className="import-wizard-card glass-subcard tab-content-fade spacing-bottom">
                  <div className="wizard-header">
                    <h4 className="card-subtitle font-gold">CSV Import Preview Wizard</h4>
                    <span className="info-badge">{csvPreviewEvents.filter(e => e.selected).length} of {csvPreviewEvents.length} Selected</span>
                  </div>
                  <p className="wizard-instructions">
                    We parsed the events and estimated their dates & categories. Review, customize, and edit the events below before importing.
                  </p>
                  
                  <div className="table-responsive wizard-table-container">
                    <table className="wizard-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={csvPreviewEvents.length > 0 && csvPreviewEvents.every(e => e.selected)}
                              onChange={(e) => handleToggleSelectAllPreview(e.target.checked)}
                            />
                          </th>
                          <th>Event Name / Title</th>
                          <th>Category</th>
                          <th>Start Date</th>
                          <th>End Date</th>
                          <th style={{ width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewEvents.map(ev => (
                          <tr key={ev.id} className={ev.selected ? 'row-selected' : 'row-deselected'}>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox" 
                                checked={ev.selected}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'selected', e.target.checked)}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                value={ev.name} 
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'name', e.target.value)}
                                className="text-input preview-row-input"
                              />
                            </td>
                            <td>
                              <select 
                                value={ev.category}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'category', e.target.value)}
                                className="text-input preview-row-input category-select"
                              >
                                <option value="Career">Career & Success</option>
                                <option value="Finance">Finance & Losses</option>
                                <option value="Relationship">Marriage & Relationships</option>
                                <option value="Health">Health & Struggles</option>
                                <option value="Travel">Travel & Relocation</option>
                                <option value="Spiritual">Spiritual & Self-realization</option>
                              </select>
                            </td>
                            <td>
                              <input 
                                type="date" 
                                value={ev.startDate}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'startDate', e.target.value)}
                                className="text-input preview-row-input date-select"
                              />
                            </td>
                            <td>
                              <input 
                                type="date" 
                                value={ev.endDate}
                                onChange={(e) => handleUpdatePreviewEvent(ev.id, 'endDate', e.target.value)}
                                className="text-input preview-row-input date-select"
                              />
                            </td>
                            <td>
                              <button 
                                onClick={() => setCsvPreviewEvents(prev => prev.filter(p => p.id !== ev.id))}
                                className="delete-btn"
                                title="Remove item from import"
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="action-bar-row">
                    <button 
                      onClick={() => setCsvPreviewEvents([])} 
                      className="btn"
                      style={{ background: 'transparent', border: '1px solid var(--border-cosmic)', color: 'var(--text-primary)' }}
                    >
                      Cancel / Clear
                    </button>
                    <button onClick={handleBulkImport} className="btn btn-primary">
                      Bulk Import Selected Events ({csvPreviewEvents.filter(e => e.selected).length})
                    </button>
                  </div>
                </div>
              )}

              {/* Event Logging Form — collapsible */}
              <div className="event-creation-container glass-subcard collapsible-section">
                <div className="collapsible-header" onClick={() => setAddEventFormOpen(o => !o)}>
                  <h4 className="card-subtitle" style={{ margin: 0 }}>Log New Life Event</h4>
                  <span className="collapsible-chevron">{addEventFormOpen ? '▲' : '▼'}</span>
                </div>
                {!addEventFormOpen && <div className="collapsible-hint">Click to expand and add a new event</div>}
              </div>
              {addEventFormOpen && (
              <div className="event-creation-container glass-subcard" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', marginTop: '-8px' }}>
                <div style={{ height: 0 }} />
                <form onSubmit={handleAddEvent} className="event-form">
                  <div className="input-group">
                    <label htmlFor="eventName" className="input-label">Event Name / Description</label>
                    <input
                      type="text"
                      id="eventName"
                      value={newEvent.name}
                      onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                      placeholder="e.g. Bought First Home, Started Master's degree"
                      className="text-input"
                    />
                  </div>
                  
                  <div className="date-row">
                    <div className="input-group flex-1">
                      <label htmlFor="eventStart" className="input-label">Start Date</label>
                      <input
                        type="date"
                        id="eventStart"
                        value={newEvent.startDate}
                        onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                        className="text-input"
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label htmlFor="eventEnd" className="input-label">End Date</label>
                      <input
                        type="date"
                        id="eventEnd"
                        value={newEvent.endDate}
                        onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                        className="text-input"
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label htmlFor="eventCat" className="input-label">Category</label>
                      <select
                        id="eventCat"
                        value={newEvent.category}
                        onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                        className="text-input"
                      >
                        <option value="Career">Career & Success</option>
                        <option value="Finance">Finance & Losses</option>
                        <option value="Relationship">Marriage & Relationships</option>
                        <option value="Health">Health & Struggles</option>
                        <option value="Travel">Travel & Relocation</option>
                        <option value="Spiritual">Spiritual & Self-realization</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary spacing-top">
                    Add Event to Log
                  </button>
                </form>
              </div>
              )}

              {/* List of logged events — collapsible, default collapsed */}
              <div className="logged-events-list collapsible-section glass-subcard">
                <div className="collapsible-header" onClick={() => setEventsListOpen(o => !o)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h4 className="card-subtitle" style={{ margin: 0 }}>
                      Registered Life Events
                      <span className="events-count-badge">{lifeEvents.length}</span>
                    </h4>
                    {selectedEventId && (
                      <span className="events-active-hint">
                        ● {lifeEvents.find(e => e.id === selectedEventId)?.name?.slice(0, 30)}…
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!eventsListOpen && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        click to browse &amp; run matcher
                      </span>
                    )}
                    <span className="collapsible-chevron">{eventsListOpen ? '▲ Collapse' : '▼ Expand'}</span>
                  </div>
                </div>

                {eventsListOpen && (
                  <div className="events-grid" style={{ marginTop: '12px' }}>
                    {lifeEvents.map(ev => (
                      <div key={ev.id} className={`event-log-card ${selectedEventId === ev.id ? 'selected' : ''}`}>
                        <div className="event-card-header">
                          <span className={`event-category-badge cat-${ev.category.toLowerCase()}`}>
                            {ev.category}
                          </span>
                          <button onClick={() => handleDeleteEvent(ev.id)} className="delete-btn" title="Delete event">
                            &times;
                          </button>
                        </div>
                        <h5 className="event-log-title">{ev.name}</h5>
                        <p className="event-log-date">Range: {ev.startDate} to {ev.endDate}</p>
                        <button
                          className="btn btn-primary event-predict-btn"
                          style={{ marginTop: '8px', fontSize: '12px', padding: '5px 12px' }}
                          onClick={() => handlePredictFuture(ev)}
                          disabled={predicting}
                          title="Match this event's transit signature against 2026-2056"
                        >
                          🔮 Predict Recurrences
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Predictions Display Report */}
              {predicting && <p className="prediction-loading">Calculating future planetary conjunctions, checking Lahiri Ayanamsha precessions, and scoring patterns...</p>}

              {predictionResults && !predicting && (
                <div className="prediction-report-card tab-content-fade spacing-top">
                  <div className="report-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                    <h3 className="report-main-title" style={{ margin: 0 }}>Astrological Match & Prediction Report</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Save Name (e.g. My Graduation Match)"
                        value={predictionSaveNameInput}
                        onChange={(e) => setPredictionSaveNameInput(e.target.value)}
                        className="text-input"
                        style={{ padding: '6px 10px', fontSize: '12px', width: '220px' }}
                      />
                      <button
                        onClick={handleSaveCurrentPrediction}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        Save Match to Memory
                      </button>
                    </div>
                  </div>
                  <div className="separator"></div>

                  <div className="original-event-details glass-subcard">
                    <h4 className="font-gold font-bold">Historical Event Reference: {predictionResults.event.name}</h4>
                    <p className="original-text">
                      During this event ({predictionResults.event.startDate} to {predictionResults.event.endDate}), the planetary transits relative to your birth chart created a specific signature in your house layout:
                    </p>
                    <ul className="original-signatures-list">
                      {Object.keys(predictionResults.originalSignature.eventSignature).map(key => {
                        const info = predictionResults.originalSignature.eventSignature[key];
                        return (
                          <li key={key}>
                            <strong>{key.toUpperCase()}</strong>: Transiting your{' '}
                            <span className="text-highlight">{info.house} House</span> ({SIGNS[info.signIndex].name} - {SIGNS[info.signIndex].sanskrit})
                            {info.conjunctions.length > 0 && (
                              <span>, conjunct natal: <strong>{info.conjunctions.map(c => c.planet.toUpperCase()).join(', ')}</strong></span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <h4 className="spacing-top font-bold text-highlight">Future Transit Re-occurrences (2026 - 2056)</h4>
                  <p className="prediction-intro">
                    We scanned the next 30 years of daily transits. Below are the peak windows where Saturn, Jupiter, Rahu, and Ketu occupy highly similar house alignments and planetary conjunctions relative to your natal chart.
                  </p>

                  <div className="prediction-results-container">
                    {predictionResults.futureMatches.length === 0 ? (
                      <p className="no-matches-found">No similar transit signatures exceeding a 60% match score were found in the 2026-2056 timeframe. This indicates that this event represents a highly unique, non-repeating karmic alignment in your current lifetime.</p>
                    ) : (
                      predictionResults.futureMatches.map((match, i) => {
                        // Enhance with PDF Ashtakvarga data if available
                        const enhanced = enhanceTransitWithPDFData(match, activePDFData);
                        const peakSadesati = activePDFData ? getActiveSadesati(activePDFData, match.peakDate) : null;
                        const peakPratantar = activePDFData ? getActivePratyantar(activePDFData, match.peakDate) : null;
                        return (
                        <div key={i} className="prediction-item-card glass-subcard">
                          <div className="prediction-item-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span className="match-score-pill">
                                {match.score}% Transit Match
                              </span>
                              {enhanced.adjustedScore !== match.score && (
                                <span className="match-score-pill adjusted" title="Score adjusted by Ashtakvarga bindu weighting">
                                  {enhanced.adjustedScore}% Bindu-Adjusted
                                </span>
                              )}
                              {peakSadesati && (
                                <span className={`sadesati-chip phase-${peakSadesati.phase?.toLowerCase() || 'active'}`}>
                                  ☄ Sadesati {peakSadesati.phase}
                                </span>
                              )}
                            </div>
                            <span className="prediction-date-range">
                              Window: <strong>{match.startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</strong> to <strong>{match.endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</strong>
                            </span>
                          </div>

                          {/* Ashtakvarga Bindu Row */}
                          {activePDFData?.ashtakvarga && enhanced.binduScores && (
                            <div className="bindu-row">
                              <span className="bindu-row-label">Ashtakvarga Bindus at peak:</span>
                              {Object.entries(enhanced.binduScores).map(([planet, scores]) => {
                                const bl = binduLabel(scores.bindu);
                                if (!bl) return null;
                                return (
                                  <div key={planet} className="bindu-chip" style={{ borderColor: bl.color, color: bl.color }}>
                                    <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{planet.slice(0,3)}</span>
                                    <span className="bindu-num">{scores.bindu}/8</span>
                                    <span className="bindu-label-text" style={{ color: bl.color }}>{bl.label}</span>
                                  </div>
                                );
                              })}
                              <span className="bindu-avg">Avg: {enhanced.avgBindu}</span>
                            </div>
                          )}

                          {/* Pratyantar timing strip */}
                          {peakPratantar && (
                            <div className="pratantar-strip">
                              <span className="pratantar-label">Pratyantar at peak:</span>
                              <strong style={{ textTransform: 'capitalize' }}>
                                {peakPratantar.maha} Maha › {peakPratantar.antar} Antar › {peakPratantar.pratantar} Pratyantar
                              </strong>
                              <span className="pratantar-dates">
                                {peakPratantar.startDate instanceof Date ? peakPratantar.startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                                {' → '}
                                {peakPratantar.endDate instanceof Date ? peakPratantar.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                              </span>
                            </div>
                          )}

                          {/* Shadbala dasha-lord strength when PDF loaded */}
                          {activePDFData?.shadbala && (() => {
                            const { currentMahadasha } = dashaData ? getCurrentDasha(dashaData, match.peakDate) : {};
                            if (!currentMahadasha) return null;
                            const sl = shadbalLabel(activePDFData, currentMahadasha.lord);
                            if (!sl) return null;
                            return (
                              <div className="shadbala-strip" style={{ borderColor: sl.color }}>
                                <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{currentMahadasha.lord} Mahadasha lord strength:</span>
                                <span style={{ color: sl.color, fontWeight: 700 }}>{sl.label} ({sl.val.toFixed(2)} Rupas)</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{sl.val >= (activePDFData.shadbala._minimum?.[currentMahadasha.lord] || 5) ? 'Above minimum — dasha delivers results' : 'Below minimum — delayed/weakened results'}</span>
                              </div>
                            );
                          })()}

                          {(() => {
                            const peakAlignments = analyzePeakDateAlignments(match.peakDate, natalChart.planets, natalChart.lagnaSign);
                            return (
                          <div className="prediction-body-grid">

                            {/* SECTION 1: Analytical Transit Data */}
                            <div className="prediction-section border-right">
                              <h5 className="prediction-sec-title">Section 1: Analytical Transit Data</h5>
                              <p className="details-intro">Planetary positions at match peak ({match.peakDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}):</p>
                              <ul className="details-list">
                                {Object.keys(match.transits).map(key => {
                                  const tInfo = match.transits[key];
                                  const origInfo = predictionResults.originalSignature.eventSignature[key];
                                  return (
                                    <li key={key} className={tInfo.house === origInfo.house ? 'exact-match' : ''}>
                                      <strong>{key.toUpperCase()}</strong>: House {tInfo.house} ({SIGNS[tInfo.signIndex].name})
                                      <br />
                                      <small className="text-muted">
                                        (Original: House {origInfo.house} in {SIGNS[origInfo.signIndex].name})
                                      </small>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>

                            {/* SECTION 2: Birth-Chart & Karmic Possibility Analysis */}
                            <div className="prediction-section">
                              <h5 className="prediction-sec-title font-purple">Section 2: Natal Potentials & Trik Bhava Activation</h5>
                              <div className="commentary-scroll">
                                {match.trikCommentaries.map((com, index) => (
                                  <div key={index} className="trik-commentary-item">
                                    <h6 className="commentary-item-title font-gold">{com.title}</h6>
                                    <p className="commentary-item-text">{com.text}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* SECTION 3: 9-Planet Conjunctions & Degree Activations */}
                            <div className="prediction-full-width spacing-top" style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(139, 92, 246, 0.15)', paddingTop: '14px' }}>
                              <h5 className="prediction-sec-title font-gold" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Section 3: Simultaneous Birth Chart Coordinate Triggers (All 9 Planets)</span>
                                {peakAlignments.length >= 2 ? (
                                  <span className="info-badge font-gold" style={{ background: 'rgba(234, 179, 8, 0.15)', borderColor: 'var(--accent-gold)', textShadow: '0 0 4px var(--accent-gold)' }}>
                                    ★ Critical Alignment Day ({peakAlignments.length} Planets Match)
                                  </span>
                                ) : peakAlignments.length === 1 ? (
                                  <span className="info-badge" style={{ fontSize: '10px' }}>Active Trigger (1 Planet Match)</span>
                                ) : null}
                              </h5>
                              <p className="details-intro" style={{ marginBottom: '10px' }}>
                                Transits of all 9 planets on <strong>{match.peakDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong> — exact degree (±1°) or Nakshatra matches against your birth chart:
                              </p>

                              {peakAlignments.length === 0 ? (
                                <p className="no-matches-found" style={{ padding: '6px 0', fontSize: '12px' }}>No exact degree or Nakshatra conjunctions on this peak date.</p>
                              ) : (
                                <div className="alignment-badges-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {peakAlignments.map((al, idx) => {
                                      const isHigh = al.severity === 'high';
                                      return (
                                        <div 
                                          key={idx} 
                                          className="alignment-badge-row" 
                                          style={{ 
                                            background: isHigh ? 'rgba(234, 179, 8, 0.05)' : 'rgba(139, 92, 246, 0.03)',
                                            border: isHigh ? '1px solid rgba(234, 179, 8, 0.25)' : '1px solid rgba(139, 92, 246, 0.1)',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '8px'
                                          }}
                                        >
                                          <div>
                                            Transiting <strong className="font-purple">{al.transitPlanet}</strong> transits your <strong className="font-gold">{al.transitHouse} House</strong> ({al.transitSign}) at {al.transitDegree.toFixed(1)}° ({al.transitNakshatra} Nakshatra).
                                            <br />
                                            <span style={{ color: 'var(--text-muted)' }}>
                                              Matches Natal <strong className="font-gold">{al.natalPlanet}</strong> in your <strong className="font-gold">{al.natalHouse} House</strong> ({al.natalSign}) at {al.natalDegree.toFixed(1)}° ({al.natalNakshatra} Nakshatra).
                                            </span>
                                          </div>
                                          <div style={{ textAlign: 'right' }}>
                                            <span className={`event-category-badge ${isHigh ? 'cat-finance' : 'cat-travel'}`} style={{ padding: '2px 8px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                              {al.matchType}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>

                          </div>
                          ); })()}
                        </div>
                      );}
                    )
                    )}
                  </div>
                </div>
              )}
            </div>
  );
}
