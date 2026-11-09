import { useCallback, useEffect, useRef } from 'react';
import ZodiacWheel from './ZodiacWheel';
import {
  IconShare, IconSun, IconMoon, IconHelp, IconChevronDown, IconCheck, IconPlus,
  IconUsers, IconEdit, IconMore, IconCloud, IconShield, IconSparkle, IconTrash,
  IconLogout, IconMail,
} from './Icons';

// ── Sticky app bar ────────────────────────────────────────────────────────
// Replaces the old 200px centred banner + separate "profile bar" row: on a
// phone those two used ~300px before any chart content appeared. Everything
// they offered is still here, but compact:
//
//   [mark] Astro-Transit  [profile switcher ▾]      [Share] [☾] [?] [⋯] [user]
//
// Which menu is open lives in App.jsx (`openMenu`) so the Android hardware
// Back button can close it like any other overlay.

const SYNC_LABEL = {
  off: 'Cloud sync is off',
  loading: 'Loading your data from the cloud…',
  saving: 'Saving changes to the cloud…',
  synced: 'All changes saved to the cloud',
  error: 'Cloud sync error',
};

/** Close the open menu on outside pointer-down or Escape. */
function useDismiss(ref, open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, onClose]);
}

function Avatar({ name, color, size = 28 }) {
  const letter = (name || '').trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" aria-hidden="true"
      style={{ '--avatar-bg': color || 'var(--gold-mid)', width: size, height: size, fontSize: size * (letter ? 0.44 : 0.5) }}>
      {letter || '☉'}
    </span>
  );
}

export default function TopBar({
  openMenu, setOpenMenu,
  theme, onToggleTheme, onShare, onHelp, onEditBirth,
  // profiles
  savedProfiles, activeProfileId, birthDetails, onLoadProfile, onSaveCurrent, onManageProfiles,
  // admin
  isAdmin, onOpenAdmin, onOpenChat, onOpenSync, syncStatus, syncError,
  // account
  user, alertsEnabled, setAlertsEnabled, onSignOut, onDeleteData, deletingAccount,
  onResetDevice,
}) {
  const profilesRef = useRef(null);
  const moreRef = useRef(null);
  const userRef = useRef(null);
  const close = useCallback(() => setOpenMenu(null), [setOpenMenu]);
  useDismiss(profilesRef, openMenu === 'profiles', close);
  useDismiss(moreRef, openMenu === 'more', close);
  useDismiss(userRef, openMenu === 'user', close);
  const toggle = (id) => setOpenMenu(openMenu === id ? null : id);

  const active = savedProfiles.find(p => p.id === activeProfileId) || null;
  const currentName = active?.profileName || birthDetails.name?.trim() || '';
  const switcherLabel = currentName || 'Unsaved chart';

  const run = (fn) => () => { close(); fn?.(); };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Brand */}
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="Astro-Transit Chart — back to top">
          <ZodiacWheel size={34} variant="mark" className="brand-mark" />
          <span className="brand-text">
            <span className="brand-name">Astro-Transit</span>
            <span className="brand-tag">Vedic Jyotish · Trik Bhava</span>
          </span>
        </a>

        {/* Profile switcher */}
        <div className="menu-anchor ps-anchor" ref={profilesRef}>
          <button
            type="button"
            className={`profile-switcher${openMenu === 'profiles' ? ' open' : ''}`}
            onClick={() => toggle('profiles')}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'profiles'}
            data-testid="profile-switcher"
            title="Switch between saved charts"
          >
            <Avatar name={currentName} color={active?.color} size={28} />
            <span className="ps-text">
              <span className="ps-caption">{active ? 'Profile' : 'Chart'}</span>
              <span className="ps-name">{switcherLabel}</span>
            </span>
            <IconChevronDown size={16} className="ps-chevron" />
          </button>

          {openMenu === 'profiles' && (
            <div className="menu menu-profiles" role="menu" aria-label="Saved charts">
              <div className="menu-heading">
                Saved charts {savedProfiles.length > 0 && <span className="menu-count">{savedProfiles.length}</span>}
              </div>
              {savedProfiles.length === 0 ? (
                <p className="menu-empty">
                  No saved charts yet. Save this one to switch back to it any time — handy for family members too.
                </p>
              ) : (
                <div className="menu-scroll">
                  {savedProfiles.map(p => {
                    const isActive = p.id === activeProfileId;
                    return (
                      <button key={p.id} type="button" role="menuitemradio" aria-checked={isActive}
                        className={`menu-item profile-item${isActive ? ' active' : ''}`}
                        onClick={run(() => onLoadProfile(p))}>
                        <Avatar name={p.profileName} color={p.color} size={30} />
                        <span className="menu-item-text">
                          <span className="menu-item-label">{p.profileName}</span>
                          <span className="menu-item-meta">
                            {p.birthDetails?.date ? new Date(`${p.birthDetails.date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'}
                            {p.birthDetails?.placeName ? ` · ${p.birthDetails.placeName.split(',')[0]}` : ''}
                            {p.pdfData ? ' · PDF' : ''}
                          </span>
                        </span>
                        {isActive && <IconCheck size={16} className="menu-item-check" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="menu-sep" role="separator" />
              <button type="button" role="menuitem" className="menu-item" onClick={run(onSaveCurrent)}>
                <IconPlus size={17} /> <span className="menu-item-label">Save current chart as profile</span>
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={run(onEditBirth)}>
                <IconEdit size={17} /> <span className="menu-item-label">Edit birth details</span>
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={run(onManageProfiles)}>
                <IconUsers size={17} /> <span className="menu-item-label">Manage profiles &amp; PDFs</span>
              </button>
            </div>
          )}
        </div>

        <div className="topbar-spacer" />

        {/* Actions */}
        <div className="topbar-actions">
          <button type="button" className="tb-btn tb-btn-labelled" onClick={onShare} title="Copy a read-only link to this chart">
            <IconShare size={17} /><span className="tb-label">Share</span>
          </button>
          <button
            type="button"
            className="tb-btn theme-switch"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to Day theme' : 'Switch to Night theme'}
            title={theme === 'dark' ? 'Day theme (Celestial Gold)' : 'Night theme (Midnight Sky)'}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <button type="button" className="tb-btn tb-hide-sm" onClick={onHelp} aria-label="Help and guided tour" title="Guided tour">
            <IconHelp size={18} />
          </button>

          {/* Overflow */}
          <div className="menu-anchor" ref={moreRef}>
            <button type="button" className={`tb-btn${openMenu === 'more' ? ' open' : ''}`}
              onClick={() => toggle('more')} aria-haspopup="menu" aria-expanded={openMenu === 'more'}
              aria-label="More options" title="More options">
              <IconMore size={18} />
            </button>
            {openMenu === 'more' && (
              <div className="menu menu-right" role="menu" aria-label="More options">
                <button type="button" role="menuitem" className="menu-item" onClick={run(onHelp)}>
                  <IconHelp size={17} /> <span className="menu-item-label">Guided tour</span>
                </button>
                <button type="button" role="menuitem" className="menu-item" onClick={run(onShare)}>
                  <IconShare size={17} /> <span className="menu-item-label">Copy share link</span>
                </button>
                <button type="button" role="menuitem" className="menu-item" onClick={run(onManageProfiles)}>
                  <IconUsers size={17} /> <span className="menu-item-label">Manage profiles &amp; PDFs</span>
                </button>
                {isAdmin && (
                  <>
                    <div className="menu-sep" role="separator" />
                    <div className="menu-heading">Admin</div>
                    <button type="button" role="menuitem" className="menu-item" onClick={run(onOpenAdmin)}>
                      <IconShield size={17} /> <span className="menu-item-label">Users &amp; profiles dashboard</span>
                    </button>
                    <button type="button" role="menuitem" className="menu-item" onClick={run(onOpenChat)}>
                      <IconSparkle size={17} /> <span className="menu-item-label">Ask AI about profiles</span>
                    </button>
                    <button type="button" role="menuitem" className="menu-item" onClick={run(onOpenSync)}
                      title={syncStatus === 'error' ? syncError : undefined}>
                      <IconCloud size={17} />
                      <span className="menu-item-text">
                        <span className="menu-item-label">Cloud sync settings</span>
                        <span className="menu-item-meta"><span className={`sync-dot sync-${syncStatus}`} /> {SYNC_LABEL[syncStatus] || syncStatus}</span>
                      </span>
                    </button>
                  </>
                )}
                <div className="menu-sep" role="separator" />
                <button type="button" role="menuitem" className="menu-item danger" onClick={run(onResetDevice)}>
                  <IconTrash size={17} /> <span className="menu-item-label">Reset data on this device</span>
                </button>
              </div>
            )}
          </div>

          {/* Account */}
          {user && (
            <div className="menu-anchor" ref={userRef}>
              <button type="button" className={`user-chip${openMenu === 'user' ? ' open' : ''}`}
                onClick={() => toggle('user')} aria-haspopup="menu" aria-expanded={openMenu === 'user'}
                title={`${user.email} — ${SYNC_LABEL[syncStatus] || ''}`} aria-label="Account menu">
                <span className="user-avatar">{(user.email || '?').charAt(0).toUpperCase()}</span>
                <span className={`user-sync-dot sync-${syncStatus}`} aria-hidden="true" />
              </button>
              {openMenu === 'user' && (
                <div className="menu menu-right" role="menu" aria-label="Account">
                  <div className="menu-account">
                    <span className="menu-item-meta">Signed in as</span>
                    {user.user_metadata?.full_name && <strong>{user.user_metadata.full_name}</strong>}
                    <span className={user.user_metadata?.full_name ? 'menu-item-meta' : undefined}>
                      {user.user_metadata?.full_name ? user.email : <strong>{user.email}</strong>}
                    </span>
                    {user.app_metadata?.provider === 'google' && (
                      <span className="menu-item-meta">via Google</span>
                    )}
                    <span className="menu-item-meta"><span className={`sync-dot sync-${syncStatus}`} /> {SYNC_LABEL[syncStatus] || ''}</span>
                  </div>
                  <div className="menu-sep" role="separator" />
                  <label className="menu-item menu-toggle"
                    title="Get a weekly email when a significant transit window is approaching (requires server email setup)">
                    <IconMail size={17} />
                    <span className="menu-item-label">Email transit alerts <span className="menu-beta">beta</span></span>
                    <input type="checkbox" className="switch" checked={alertsEnabled} onChange={e => setAlertsEnabled(e.target.checked)} />
                  </label>
                  <button type="button" role="menuitem" className="menu-item" onClick={run(onSignOut)}>
                    <IconLogout size={17} /> <span className="menu-item-label">Sign out</span>
                  </button>
                  <div className="menu-sep" role="separator" />
                  <button type="button" role="menuitem" className="menu-item danger" onClick={run(onDeleteData)} disabled={deletingAccount}
                    title="Permanently erase all your data from this app">
                    <IconTrash size={17} /> <span className="menu-item-label">{deletingAccount ? 'Deleting…' : 'Delete my data'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
