import { useEffect, useRef } from 'react';
import { IconClose, IconSearch, IconPin, IconSave, IconSync, IconChevronRight } from './Icons';

// ── Birth details editor ──────────────────────────────────────────────────
// The birth form used to live in a 380px left column that started collapsed
// to a 48px vertical strip — most people never discovered it, and those who
// did lost a third of the screen while it was open. It is now a slide-over
// panel (right side on desktop, full-height sheet on phones) opened from the
// chart card, the profile menu, the guided tour or the empty state.
//
// Every edit is applied live: App.jsx recomputes the natal chart whenever
// birthDetails changes, so the chart behind the panel updates as you type.
// Input ids (birthName, birthDate, …) are unchanged from the old panel.

export default function BirthDetailsDrawer({
  open, onClose,
  birthDetails, setBirthDetails,
  searchQuery, setSearchQuery, handleSearchLocation,
  geocodingLoading, geocodingError, geocodingResults, applyPlace,
  activeProfile, onSyncProfile, onPrepareAndSave, prepareFlash,
  lifeEventsCount, profilesCount,
}) {
  const panelRef = useRef(null);
  const nameRef = useRef(null);
  const searchRef = useRef(null);

  // Focus the first useful field on open; lock page scroll behind the panel.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      (nameRef.current && !nameRef.current.value ? nameRef.current : panelRef.current)?.focus();
    }, 60);
    return () => { clearTimeout(t); document.body.style.overflow = previous; };
  }, [open]);

  // Escape closes (Android Back is handled centrally in App.jsx).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // "Name required" — put the cursor where the fix is.
  useEffect(() => {
    if (open && prepareFlash === 'name-required') nameRef.current?.focus();
  }, [open, prepareFlash]);

  if (!open) return null;

  const set = (field, parse = (v) => v) => (e) =>
    setBirthDetails(prev => ({ ...prev, [field]: parse(e.target.value) }));
  const num = (v) => parseFloat(v); // same parsing the old panel used

  const lat = Number(birthDetails.latitude);
  const lon = Number(birthDetails.longitude);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="birth-drawer-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        data-testid="birth-drawer"
      >
        <header className="drawer-head">
          <div>
            <h2 id="birth-drawer-title" className="drawer-title">Birth details</h2>
            <p className="drawer-sub">The chart updates live as you edit.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close birth details">
            <IconClose size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {activeProfile && (
            <div className="drawer-profile">
              <span className="avatar" style={{ '--avatar-bg': activeProfile.color || 'var(--gold-mid)', width: 30, height: 30, fontSize: 13 }}>
                {activeProfile.profileName.charAt(0).toUpperCase()}
              </span>
              <span className="drawer-profile-text">
                Editing <strong>{activeProfile.profileName}</strong>
                <small>Changes show instantly; press Update to store them in the profile.</small>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onSyncProfile} title="Copy the current birth details & life events into this saved profile">
                <IconSync size={14} /> Update
              </button>
            </div>
          )}

          {/* ── Who ── */}
          <fieldset className="form-section">
            <legend className="form-legend"><span className="form-step">1</span> Who</legend>
            <div className="input-group">
              <label htmlFor="birthName" className="input-label">Name</label>
              <input
                ref={nameRef}
                type="text"
                id="birthName"
                value={birthDetails.name}
                onChange={set('name')}
                className={`text-input${prepareFlash === 'name-required' ? ' has-error' : ''}`}
                placeholder="e.g. Aditya"
                autoComplete="off"
                aria-invalid={prepareFlash === 'name-required' || undefined}
                aria-describedby={prepareFlash === 'name-required' ? 'birthName-err' : undefined}
              />
              {prepareFlash === 'name-required' && (
                <p id="birthName-err" className="field-error">Add a name so this chart can be saved as a profile.</p>
              )}
            </div>
          </fieldset>

          {/* ── When ── */}
          <fieldset className="form-section">
            <legend className="form-legend"><span className="form-step">2</span> When</legend>
            <div className="form-row-2">
              <div className="input-group">
                <label htmlFor="birthDate" className="input-label">Birth date</label>
                <input type="date" id="birthDate" value={birthDetails.date} onChange={set('date')} className="text-input" />
              </div>
              <div className="input-group">
                <label htmlFor="birthTime" className="input-label">Birth time (local)</label>
                <input type="time" id="birthTime" value={birthDetails.time} onChange={set('time')} className="text-input" />
              </div>
            </div>
            <p className="form-hint">The exact minute matters — it decides the ascendant and every house.</p>
          </fieldset>

          {/* ── Where ── */}
          <fieldset className="form-section">
            <legend className="form-legend"><span className="form-step">3</span> Where</legend>

            <div className="place-current">
              <IconPin size={16} />
              <div>
                <div className="place-current-name">{birthDetails.placeName || 'No place set'}</div>
                <div className="place-current-meta">
                  {Number.isFinite(lat) ? `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}` : '—'},{' '}
                  {Number.isFinite(lon) ? `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}` : '—'}
                  {' · '}GMT {birthDetails.timezone >= 0 ? '+' : ''}{birthDetails.timezone}
                  {birthDetails.tzId ? ` · ${birthDetails.tzId}` : ''}
                </div>
              </div>
            </div>

            <form onSubmit={handleSearchLocation} className="search-form" role="search">
              <label htmlFor="searchQuery" className="input-label">Change birth place</label>
              <div className="search-bar-row">
                <span className="search-input-wrap">
                  <IconSearch size={16} className="search-input-icon" />
                  <input
                    ref={searchRef}
                    type="text"
                    id="searchQuery"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search a city, e.g. Hyderabad"
                    className="text-input search-input"
                    autoComplete="off"
                  />
                </span>
                <button type="submit" className="btn btn-secondary" disabled={geocodingLoading || !searchQuery.trim()}>
                  {geocodingLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
            </form>

            {geocodingError && <p className="error-message">{geocodingError}</p>}

            {geocodingResults.length > 0 && (
              <ul className="geocode-results" role="listbox" aria-label="Matching places">
                {geocodingResults.map((place, i) => (
                  <li key={`${place.lat},${place.lon},${i}`}>
                    <button type="button" className="geocode-result-btn" onClick={() => applyPlace(place)}>
                      <span className="geocode-result-name">{place.name}</span>
                      <span className="geocode-result-meta">
                        {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°{place.tzId ? ` · ${place.tzId}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <details className="form-advanced">
              <summary><IconChevronRight size={14} className="form-advanced-chev" /> Fine-tune coordinates &amp; timezone</summary>
              <div className="form-row-3">
                <div className="input-group">
                  <label htmlFor="birthLat" className="input-label">Latitude (°N)</label>
                  <input type="number" step="0.0001" id="birthLat" value={birthDetails.latitude} onChange={set('latitude', num)} className="text-input" />
                </div>
                <div className="input-group">
                  <label htmlFor="birthLon" className="input-label">Longitude (°E)</label>
                  <input type="number" step="0.0001" id="birthLon" value={birthDetails.longitude} onChange={set('longitude', num)} className="text-input" />
                </div>
                <div className="input-group">
                  <label htmlFor="birthTz" className="input-label">GMT offset</label>
                  <input type="number" step="0.5" id="birthTz" value={birthDetails.timezone} onChange={set('timezone', num)} className="text-input" />
                </div>
              </div>
              <p className="form-hint">Searching a place fills these automatically, including historical daylight-saving offsets.</p>
            </details>
          </fieldset>

          <p className="drawer-note">
            Auto-saved on this device · {lifeEventsCount} life event{lifeEventsCount !== 1 ? 's' : ''} · {profilesCount} saved profile{profilesCount !== 1 ? 's' : ''}
          </p>
        </div>

        <footer className="drawer-foot">
          {(prepareFlash === 'saved' || prepareFlash === 'updated') && (
            <p className="prepare-flash ok" role="status">
              ✓ {prepareFlash === 'saved' ? 'Profile created — switch to it any time from the top bar.' : 'Profile updated.'}
            </p>
          )}
          <div className="drawer-foot-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Done</button>
            <button type="button" className="btn btn-primary prepare-save-btn" onClick={onPrepareAndSave}>
              <IconSave size={15} /> Save as profile
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
