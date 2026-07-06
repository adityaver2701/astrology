import { getSyncConfig } from '../cloudSync';

// ── Cloud Sync Settings Modal ─────────────────────────────────────────────
export default function SyncSettingsModal({
  showSyncSettings, setShowSyncSettings,
  syncForm, setSyncForm, syncError, syncStatus, syncConnecting,
  handleSyncConnect, handleSyncDisconnect,
}) {
    if (!showSyncSettings) return null;
    const configured = !!getSyncConfig();
    return (
      <div className="pm-overlay" onClick={() => setShowSyncSettings(false)}>
        <div className="pm-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
          <div className="pm-header">
            <h2 className="pm-title">☁ Cloud Sync</h2>
            <button className="pm-close" onClick={() => setShowSyncSettings(false)}>✕</button>
          </div>
          <div className="pm-form-section">
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px' }}>
              The app is pre-configured — just <strong>Create Account / Sign In</strong>. Your profiles,
              predictions, reports and charts are private to your account and sync across devices.
              These fields are only for <strong>advanced</strong> use (pointing the app at a different
              Supabase project). Saving reloads the app. One-time database setup is in
              <strong> SUPABASE_AUTH_SETUP.md</strong>.
            </p>
            <div className="pm-section-label">Supabase Project URL</div>
            <input
              className="text-input"
              placeholder="https://xxxxx.supabase.co"
              value={syncForm.url}
              onChange={e => setSyncForm(f => ({ ...f, url: e.target.value }))}
              style={{ width: '100%', marginBottom: '8px' }}
            />
            <div className="pm-section-label">Anon (public) API Key</div>
            <input
              className="text-input"
              type="password"
              placeholder="eyJhbGciOi..."
              value={syncForm.anonKey}
              onChange={e => setSyncForm(f => ({ ...f, anonKey: e.target.value }))}
              style={{ width: '100%', marginBottom: '8px' }}
            />
            {syncError && (
              <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 8px' }}>⚠ {syncError}</p>
            )}
            {configured && syncStatus === 'synced' && !syncError && (
              <p style={{ fontSize: '12px', color: '#16a34a', margin: '4px 0 8px' }}>✓ Connected — data is syncing automatically.</p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: '12px' }}
                disabled={syncConnecting}
                onClick={handleSyncConnect}
              >{syncConnecting ? 'Connecting…' : configured ? 'Reconnect / Update' : 'Connect & Sync'}</button>
              {configured && (
                <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={handleSyncDisconnect}>
                  Disconnect
                </button>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
              Connecting loads any existing cloud data (cloud wins). If the cloud is empty,
              your current local data is uploaded as the starting point.
            </p>
          </div>
        </div>
      </div>
    );
}
