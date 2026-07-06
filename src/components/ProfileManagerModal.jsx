import { getAccuracyProfile, getPDFDataSummary } from '../astrologyEngine';
import { deleteReport } from '../cloudSync';
import { PROFILE_COLORS } from '../constants';

// ── Profile Manager Modal ─────────────────────────────────────────────────
export default function ProfileManagerModal({
  showProfileManager, setShowProfileManager,
  editingProfileId, setEditingProfileId,
  profileForm, setProfileForm,
  savedProfiles, setSavedProfiles,
  activeProfileId, setActiveProfileId,
  birthDetails, lifeEvents,
  handleExportProfiles, handleImportProfiles, handleLoadProfile,
  handleUpdateActiveProfileData, handleDuplicateProfile, handleDeleteProfile,
  handleProfilePDFUpload, parsingPDFForProfile, pdfParseError,
  downloadingReport, handleDownloadReport,
}) {
    if (!showProfileManager) return null;
    return (
      <div className="pm-overlay" onClick={() => { setShowProfileManager(false); setEditingProfileId(null); }}>
        <div className="pm-panel" onClick={e => e.stopPropagation()}>
          <div className="pm-header">
            <h2 className="pm-title">⊙ Profile Manager</h2>
            <button className="pm-close" onClick={() => { setShowProfileManager(false); setEditingProfileId(null); }}>✕</button>
          </div>

          {/* Create / Edit Form */}
          <div className="pm-form-section">
            <div className="pm-section-label">{editingProfileId ? 'Edit Profile' : 'Save Current as New Profile'}</div>
            <div className="pm-form-row">
              <input
                className="text-input"
                placeholder="Profile name (e.g. Mom, Me, Client)"
                value={profileForm.name}
                onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                style={{ flex: 1 }}
              />
            </div>
            <div className="pm-color-row">
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '6px' }}>Color:</span>
              {PROFILE_COLORS.map(c => (
                <button
                  key={c}
                  className={`pm-color-dot${profileForm.color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setProfileForm(f => ({ ...f, color: c }))}
                  title={c}
                />
              ))}
            </div>
            <textarea
              className="text-input"
              placeholder="Notes (optional — relationship, purpose, etc.)"
              value={profileForm.notes}
              onChange={e => setProfileForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ resize: 'none', fontSize: '12px', marginTop: '6px', width: '100%' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              {editingProfileId ? (
                <>
                  <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={() => {
                    setSavedProfiles(prev => prev.map(p => p.id === editingProfileId
                      ? { ...p, profileName: profileForm.name || p.profileName, color: profileForm.color, notes: profileForm.notes }
                      : p
                    ));
                    setEditingProfileId(null);
                    setProfileForm({ name: '', color: PROFILE_COLORS[0], notes: '' });
                  }}>Update Profile</button>
                  <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={() => {
                    setEditingProfileId(null);
                    setProfileForm({ name: '', color: PROFILE_COLORS[0], notes: '' });
                  }}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={() => {
                  const nameToSave = profileForm.name.trim() || birthDetails.name || 'Unnamed';
                  const newProfile = {
                    id: Date.now(),
                    profileName: nameToSave,
                    color: profileForm.color,
                    birthDetails: { ...birthDetails },
                    lifeEvents: [...lifeEvents],
                    createdAt: new Date().toISOString(),
                    notes: profileForm.notes
                  };
                  const updated = [...savedProfiles, newProfile];
                  setSavedProfiles(updated);
                  setActiveProfileId(newProfile.id);
                  localStorage.setItem('astro_active_profile_id', String(newProfile.id));
                  setProfileForm({ name: '', color: PROFILE_COLORS[updated.length % PROFILE_COLORS.length], notes: '' });
                }}>💾 Save as New Profile</button>
              )}
            </div>
          </div>

          {/* Profiles List */}
          <div className="pm-list-section">
            <div className="pm-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>All Saved Profiles ({savedProfiles.length})</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="pm-btn"
                  style={{ fontSize: '11px', padding: '3px 8px', opacity: savedProfiles.length === 0 ? 0.4 : 1 }}
                  onClick={handleExportProfiles}
                  disabled={savedProfiles.length === 0}
                  title="Export all profiles to a JSON backup file"
                >⬇ Export</button>
                <label
                  className="pm-btn"
                  style={{ fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}
                  title="Import profiles from a previously exported JSON file"
                >
                  ⬆ Import
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportProfiles} />
                </label>
              </div>
            </div>
            {savedProfiles.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No profiles saved yet. Fill in birth details above and save.
              </p>
            )}
            <div className="pm-list">
              {savedProfiles.map(prof => {
                const isActive = activeProfileId === prof.id;
                const isEditing = editingProfileId === prof.id;
                return (
                  <div key={prof.id} className="pm-entry">
                    {/* ── Top row: avatar · info · action buttons ── */}
                    <div className={`pm-item${isActive ? ' active' : ''}${isEditing ? ' editing' : ''}`}>
                      <div className="pm-item-avatar" style={{ background: prof.color || '#ca8a04' }}>
                        {(prof.profileName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="pm-item-info">
                        <div className="pm-item-name">
                          {prof.profileName}
                          {isActive && <span className="pm-active-badge">● Active</span>}
                          {prof.pdfData && <span className="pm-pdf-badge-small">📄 PDF</span>}
                        </div>
                        <div className="pm-item-meta">
                          Born {prof.birthDetails?.date} · {prof.birthDetails?.placeName?.split(',')[0]}
                          {prof.lifeEvents?.length ? ` · ${prof.lifeEvents.length} events` : ''}
                          {prof.pdfData && ` · +${getAccuracyProfile(prof.pdfData).earned}% acc`}
                        </div>
                        {prof.notes && <div className="pm-item-notes">{prof.notes}</div>}
                      </div>
                      <div className="pm-item-btns">
                        {!isActive && (
                          <button className="pm-btn load" onClick={() => { handleLoadProfile(prof); setShowProfileManager(false); }}>Load</button>
                        )}
                        <button className="pm-btn edit" onClick={() => {
                          setEditingProfileId(prof.id);
                          setProfileForm({ name: prof.profileName, color: prof.color || PROFILE_COLORS[0], notes: prof.notes || '' });
                        }}>Edit</button>
                        {isActive && (
                          <button className="pm-btn sync" title="Sync current birth details & life events into this profile" onClick={handleUpdateActiveProfileData}>Sync ↑</button>
                        )}
                        <button className="pm-btn dup" title="Duplicate this profile" onClick={() => handleDuplicateProfile(prof)}>Dup</button>
                        <button className="pm-btn del" onClick={() => handleDeleteProfile(prof.id)}>✕</button>
                      </div>
                    </div>

                    {/* ── PDF Upload / Data Section ── */}
                    <div className="pm-pdf-section">
                      {prof.pdfData ? (
                        <div className="pm-pdf-loaded">
                          <span className="pm-pdf-icon">📄</span>
                          <div className="pm-pdf-loaded-info">
                            <div className="pm-pdf-loaded-name">{prof.pdfFileName || 'AstroSage PDF'} · {prof.pdfData.pageCount}pp · {Math.round((prof.pdfData.confidence?.overall || 0) * 100)}% confidence</div>
                            <div className="pm-pdf-loaded-meta">
                              {getPDFDataSummary(prof.pdfData).map(d => (
                                <span key={d.key} className={`pm-pdf-tag${d.available ? ' available' : ' missing'}`}>
                                  {d.available ? '✓' : '–'} {d.label}
                                </span>
                              ))}
                            </div>
                            <div className="pm-pdf-accuracy-bar">
                              <span className="pm-pdf-acc-label">Accuracy unlocked:</span>
                              <div className="pm-pdf-acc-track">
                                <div className="pm-pdf-acc-fill" style={{ width: `${getAccuracyProfile(prof.pdfData).total}%` }} />
                              </div>
                              <span className="pm-pdf-acc-num">+{getAccuracyProfile(prof.pdfData).earned}%</span>
                            </div>
                          </div>
                          {prof.pdfStoragePath && (
                            <button className="pm-pdf-download" title="Download the original PDF report"
                              disabled={downloadingReport === prof.id}
                              onClick={() => handleDownloadReport(prof)}>
                              {downloadingReport === prof.id ? '…' : '⬇ PDF'}
                            </button>
                          )}
                          <button className="pm-btn del" style={{ flexShrink: 0, alignSelf: 'flex-start' }} title="Remove PDF data & stored file"
                            onClick={async () => {
                              const path = prof.pdfStoragePath;
                              setSavedProfiles(prev => prev.map(p => p.id === prof.id ? { ...p, pdfData: null, pdfFileName: null, pdfStoragePath: null } : p));
                              if (path) { try { await deleteReport(path); } catch (e) { console.error('delete report', e); } }
                            }}>✕</button>
                        </div>
                      ) : (
                        <label className={`pm-pdf-upload${parsingPDFForProfile === prof.id ? ' parsing' : ''}`}
                          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                          onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                          onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('drag-over');
                            const f = e.dataTransfer.files[0];
                            if (f) handleProfilePDFUpload(prof.id, f);
                          }}
                        >
                          <input type="file" accept=".pdf" style={{ display: 'none' }}
                            onChange={e => {
                              const f = e.target.files[0];
                              if (f) handleProfilePDFUpload(prof.id, f);
                              e.target.value = '';
                            }}
                          />
                          {parsingPDFForProfile === prof.id ? (
                            <span className="pm-pdf-parsing">
                              <span className="pm-pdf-spin">⟳</span> Parsing PDF — extracting Ashtakvarga, Dasha, KP data…
                            </span>
                          ) : (
                            <>
                              <span className="pm-pdf-upload-icon">📤</span>
                              <span className="pm-pdf-upload-text">
                                Drop AstroSage Kundli PDF here or <u>click to upload</u>
                                <br />
                                <small>Unlocks Ashtakvarga scoring · Pratyantar timing · KP Lords · Shadbala · Sadesati</small>
                              </span>
                            </>
                          )}
                        </label>
                      )}
                      {pdfParseError && parsingPDFForProfile === null && (
                        <div className="pm-pdf-error">{pdfParseError}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
}
