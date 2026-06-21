import { useEffect, useState, useCallback } from 'react';
import { adminListAllData } from './cloudSync';

// ── Admin dashboard ───────────────────────────────────────────────────────
// Shows every user (one astro_sync row each), their profile count, and the
// details of each profile. Relies on the "astro_sync admin read" RLS policy —
// for non-admins the same query simply returns only their own row.
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || '—'; }
}

export default function AdminDashboard({ onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListAllData();
      setRows(data);
    } catch (e) {
      setError(e.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Wrapped in an async IIFE so the loader's setState calls don't run
  // synchronously in the effect body.
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const users = (rows || []).map(r => {
    const d = r.data || {};
    const profiles = Array.isArray(d.savedProfiles) ? d.savedProfiles : [];
    return {
      id: r.user_id,
      email: d.ownerEmail || '(email not recorded yet)',
      lastActive: r.updated_at,
      profiles,
      predictions: Array.isArray(d.savedPredictions) ? d.savedPredictions.length : 0,
    };
  });
  const totalProfiles = users.reduce((n, u) => n + u.profiles.length, 0);
  const totalPDFs = users.reduce((n, u) => n + u.profiles.filter(p => p.pdfStoragePath || p.pdfFileName).length, 0);

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-panel admin-panel" onClick={e => e.stopPropagation()}>
        <div className="pm-header">
          <h2 className="pm-title">🛡 Admin Dashboard</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={load} disabled={loading}>↻ Refresh</button>
            <button className="pm-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {loading && <p className="admin-muted">Loading users…</p>}
        {error && <div className="admin-error">⚠ {error}</div>}

        {!loading && !error && (
          <>
            <div className="admin-stats">
              <div className="admin-stat"><span className="admin-stat-num">{users.length}</span><span className="admin-stat-label">Users</span></div>
              <div className="admin-stat"><span className="admin-stat-num">{totalProfiles}</span><span className="admin-stat-label">Profiles</span></div>
              <div className="admin-stat"><span className="admin-stat-num">{totalPDFs}</span><span className="admin-stat-label">PDF reports</span></div>
            </div>

            {users.length === 0 && <p className="admin-muted">No user data yet.</p>}

            <div className="admin-user-list">
              {users.map(u => {
                const open = !!expanded[u.id];
                return (
                  <div key={u.id} className="admin-user">
                    <button className="admin-user-head" onClick={() => setExpanded(e => ({ ...e, [u.id]: !e[u.id] }))}>
                      <span className="admin-user-email">{u.email}</span>
                      <span className="admin-user-meta">
                        {u.profiles.length} profile{u.profiles.length !== 1 ? 's' : ''} · last active {fmtDate(u.lastActive)}
                      </span>
                      <span className="admin-caret">{open ? '▲' : '▼'}</span>
                    </button>
                    {open && (
                      <div className="admin-profiles">
                        {u.profiles.length === 0 && <p className="admin-muted small">No profiles created.</p>}
                        {u.profiles.map((p, idx) => (
                          <div key={p.id || idx} className="admin-profile">
                            <div className="admin-profile-name">
                              {p.profileName || '(unnamed)'}
                              {(p.pdfStoragePath || p.pdfFileName) && <span className="admin-badge">PDF</span>}
                            </div>
                            <div className="admin-profile-detail">
                              {p.birthDetails?.date || '—'} {p.birthDetails?.time || ''} · {p.birthDetails?.placeName || '—'}
                            </div>
                            <div className="admin-profile-sub">
                              {(p.lifeEvents?.length || 0)} life events{p.notes ? ` · ${p.notes}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="admin-foot">
              Data shown is what each user entered. Visible to admin accounts only.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
