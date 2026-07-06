import { useMemo, useState } from 'react';
import { computeKootas, computeMoonProfile } from '../compatibility';

// ── Ashtakoota (36-guna) compatibility tab ─────────────────────────────────
// Classical guna-milan between any two saved profiles' Moon positions.
export default function CompatibilityTab({ savedProfiles }) {
  const [idA, setIdA] = useState(savedProfiles[0]?.id ?? '');
  const [idB, setIdB] = useState(savedProfiles[1]?.id ?? '');

  const profA = savedProfiles.find(p => p.id === Number(idA) || p.id === idA);
  const profB = savedProfiles.find(p => p.id === Number(idB) || p.id === idB);

  const result = useMemo(() => {
    if (!profA?.birthDetails || !profB?.birthDetails || profA.id === profB.id) return null;
    try {
      const moonA = computeMoonProfile(profA.birthDetails);
      const moonB = computeMoonProfile(profB.birthDetails);
      return { moonA, moonB, match: computeKootas(moonA, moonB) };
    } catch (e) {
      console.error('compatibility', e);
      return null;
    }
  }, [profA, profB]);

  if (savedProfiles.length < 2) {
    return (
      <div className="tab-content-fade">
        <h3 className="tab-section-title">Ashtakoota Compatibility (Guna Milan)</h3>
        <div className="empty-state">
          <span className="empty-state-icon">♡</span>
          <h3>Two Profiles Needed</h3>
          <p>
            Save at least two profiles (yours and a partner&apos;s / family member&apos;s) using the
            <strong> ⊙ Profiles</strong> manager, then compare their charts here using the
            classical 36-point ashtakoota system.
          </p>
        </div>
      </div>
    );
  }

  const pctColor = (score, max) => {
    const r = score / max;
    return r >= 0.75 ? '#16a34a' : r >= 0.4 ? '#ca8a04' : '#dc2626';
  };

  return (
    <div className="tab-content-fade">
      <h3 className="tab-section-title">Ashtakoota Compatibility (Guna Milan)</h3>
      <p className="tab-instructions">
        Classical Vedic matching compares the two Moon positions across eight kootas totalling
        36 gunas. 18+ is traditionally considered acceptable, 25+ good, 33+ excellent. Vashya uses
        a sign-level approximation of the classical half-sign divisions.
      </p>

      <div className="transit-selector-row glass-subcard" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
          <label className="input-label" htmlFor="compatA">Person A</label>
          <select id="compatA" className="text-input" value={idA} onChange={e => setIdA(e.target.value)}>
            <option value="">— select profile —</option>
            {savedProfiles.map(p => <option key={p.id} value={p.id}>{p.profileName} ({p.birthDetails?.date})</option>)}
          </select>
        </div>
        <span style={{ alignSelf: 'flex-end', padding: '8px 4px', fontSize: '18px', color: 'var(--accent-gold)' }}>♡</span>
        <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
          <label className="input-label" htmlFor="compatB">Person B</label>
          <select id="compatB" className="text-input" value={idB} onChange={e => setIdB(e.target.value)}>
            <option value="">— select profile —</option>
            {savedProfiles.map(p => <option key={p.id} value={p.id}>{p.profileName} ({p.birthDetails?.date})</option>)}
          </select>
        </div>
      </div>

      {profA && profB && profA.id === profB.id && (
        <p className="error-message spacing-top">Select two different profiles.</p>
      )}

      {result && (
        <>
          {/* Score banner */}
          <div className="glass-subcard spacing-top" style={{ padding: '18px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px', borderLeft: '3px solid var(--accent-gold)' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Total Gunas</div>
              <div style={{ fontSize: '34px', fontWeight: 800, color: pctColor(result.match.total, 36) }}>
                {result.match.total}<span style={{ fontSize: '16px', color: 'var(--text-muted)' }}> / 36</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{result.match.verdict}</div>
            </div>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                <strong>{profA.profileName}</strong>: Moon in {result.moonA.rasiName} · {result.moonA.nakName} (Pada {result.moonA.pada})<br />
                <strong>{profB.profileName}</strong>: Moon in {result.moonB.rasiName} · {result.moonB.nakName} (Pada {result.moonB.pada})
              </div>
              <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(result.match.total / 36) * 100}%`, background: pctColor(result.match.total, 36) }} />
              </div>
            </div>
          </div>

          {/* Dosha flags */}
          {result.match.flags.length > 0 && (
            <div className="spacing-top" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {result.match.flags.map((f, i) => (
                <div key={i} className="alert-card" style={{ padding: '10px 14px', fontSize: '12.5px', border: '1px solid rgba(220,38,38,0.35)', borderRadius: '8px' }}>
                  ⚠ {f}
                </div>
              ))}
            </div>
          )}

          {/* Koota breakdown */}
          <div className="table-responsive spacing-top">
            <table className="planetary-table">
              <thead>
                <tr><th>Koota</th><th>Assesses</th><th>Combination</th><th>Score</th><th></th></tr>
              </thead>
              <tbody>
                {result.match.kootas.map(k => (
                  <tr key={k.name}>
                    <td><strong>{k.name}</strong></td>
                    <td>{k.meaning}</td>
                    <td style={{ textTransform: 'capitalize' }}>{k.detail}</td>
                    <td style={{ fontWeight: 700, color: pctColor(k.score, k.max) }}>{k.score} / {k.max}</td>
                    <td style={{ minWidth: '90px' }}>
                      <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(k.score / k.max) * 100}%`, background: pctColor(k.score, k.max) }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>
            Guna milan is one traditional lens among many (full analysis also weighs Mangal dosha,
            navamsa strength and dasha timing). Offered for reflection — not a verdict on any relationship.
          </p>
        </>
      )}
    </div>
  );
}
