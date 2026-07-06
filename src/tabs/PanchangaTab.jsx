import { useMemo, useState } from 'react';
import { computePanchanga } from '../panchanga';
import { formatDegrees } from '../constants';

// ── Panchanga tab ──────────────────────────────────────────────────────────
// The five limbs of the Vedic day (tithi, vara, nakshatra, yoga, karana) for
// any chosen date/time, computed from the engine's sidereal Sun/Moon.
export default function PanchangaTab({ birthDetails }) {
  const now = new Date();
  const [dateInput, setDateInput] = useState(now.toISOString().split('T')[0]);
  const [timeInput, setTimeInput] = useState('12:00');
  // Default to the birth timezone so "local noon" means local to the chart.
  const [tzOffset, setTzOffset] = useState(birthDetails?.timezone ?? 0);

  const panchanga = useMemo(() => {
    try {
      const local = new Date(`${dateInput}T${timeInput}:00Z`);
      if (Number.isNaN(local.getTime())) return null;
      const utc = new Date(local.getTime() - (Number(tzOffset) || 0) * 3600000);
      // Pass the LOCAL wall-clock date for weekday display, panchanga angles use UTC.
      const p = computePanchanga(utc);
      // Recompute vara from the local calendar day (weekday is a local concept).
      const localDay = new Date(`${dateInput}T12:00:00Z`).getUTCDay();
      return { ...p, vara: { ...p.vara, ...varaByIndex(localDay) } };
    } catch {
      return null;
    }
  }, [dateInput, timeInput, tzOffset]);

  return (
    <div className="tab-content-fade">
      <h3 className="tab-section-title">Panchanga — Five Limbs of the Vedic Day</h3>
      <p className="tab-instructions">
        The panchanga describes the quality of a day: <strong>Tithi</strong> (lunar day),{' '}
        <strong>Vara</strong> (weekday), <strong>Nakshatra</strong> (Moon&apos;s star),{' '}
        <strong>Yoga</strong> (Sun–Moon combination) and <strong>Karana</strong> (half-tithi).
        Traditionally consulted for muhurta — choosing auspicious timings.
      </p>

      <div className="transit-selector-row glass-subcard" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="input-group">
          <label htmlFor="panchangaDate" className="input-label">Date</label>
          <input type="date" id="panchangaDate" className="text-input"
            value={dateInput} onChange={e => setDateInput(e.target.value)} />
        </div>
        <div className="input-group">
          <label htmlFor="panchangaTime" className="input-label">Local Time</label>
          <input type="time" id="panchangaTime" className="text-input"
            value={timeInput} onChange={e => setTimeInput(e.target.value)} />
        </div>
        <div className="input-group">
          <label htmlFor="panchangaTz" className="input-label">Timezone (GMT Offset)</label>
          <input type="number" step="0.5" id="panchangaTz" className="text-input"
            value={tzOffset} onChange={e => setTzOffset(parseFloat(e.target.value))} />
        </div>
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-end' }}
          onClick={() => {
            const d = new Date();
            setDateInput(d.toISOString().split('T')[0]);
            setTimeInput(d.toISOString().substring(11, 16));
            setTzOffset(0);
          }}>Now (UTC)</button>
      </div>

      {panchanga && (
        <>
          <div className="glance-strip spacing-top">
            <div className="glance-chip">
              <span className="glance-icon">☽</span>
              <div className="glance-body">
                <div className="glance-label">Tithi</div>
                <div className="glance-value">{panchanga.tithi.name}</div>
                <div className="glance-sub">
                  {panchanga.tithi.paksha} · #{panchanga.tithi.number} · {(panchanga.tithi.progress * 100).toFixed(0)}% elapsed
                </div>
              </div>
            </div>
            <div className="glance-chip">
              <span className="glance-icon">☀</span>
              <div className="glance-body">
                <div className="glance-label">Vara (Weekday)</div>
                <div className="glance-value">{panchanga.vara.name}</div>
                <div className="glance-sub">{panchanga.vara.english} · Lord: {panchanga.vara.lord}</div>
              </div>
            </div>
            <div className="glance-chip">
              <span className="glance-icon">✶</span>
              <div className="glance-body">
                <div className="glance-label">Nakshatra</div>
                <div className="glance-value">{panchanga.nakshatra.name}</div>
                <div className="glance-sub">Pada {panchanga.nakshatra.pada} · Lord: {panchanga.nakshatra.lord}</div>
              </div>
            </div>
            <div className="glance-chip">
              <span className="glance-icon">◐</span>
              <div className="glance-body">
                <div className="glance-label">Yoga</div>
                <div className="glance-value">{panchanga.yoga.name}{panchanga.yoga.caution ? ' ⚠' : ''}</div>
                <div className="glance-sub">{panchanga.yoga.caution ? 'Traditionally inauspicious for new ventures' : 'Generally favourable'}</div>
              </div>
            </div>
            <div className="glance-chip">
              <span className="glance-icon">◑</span>
              <div className="glance-body">
                <div className="glance-label">Karana</div>
                <div className="glance-value">{panchanga.karana.name}{panchanga.karana.caution ? ' ⚠' : ''}</div>
                <div className="glance-sub">{panchanga.karana.caution ? 'Vishti (Bhadra) — avoid important beginnings' : 'Half-tithi division'}</div>
              </div>
            </div>
          </div>

          <div className="glass-subcard spacing-top" style={{ padding: '16px 18px' }}>
            <h4 className="card-subtitle">Luminary Positions (Sidereal)</h4>
            <div className="table-responsive">
              <table className="planetary-table">
                <thead>
                  <tr><th>Body</th><th>Sign</th><th>Longitude</th><th>Nakshatra</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Sun (Surya)</strong></td>
                    <td>{panchanga.sun.signName}</td>
                    <td>{formatDegrees(panchanga.sun.longitude % 30)}</td>
                    <td>{panchanga.sun.nakshatraName}</td>
                  </tr>
                  <tr>
                    <td><strong>Moon (Chandra)</strong></td>
                    <td>{panchanga.moon.signName}</td>
                    <td>{formatDegrees(panchanga.moon.longitude % 30)}</td>
                    <td>{panchanga.moon.nakshatraName} · Pada {panchanga.moon.pada}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Sun–Moon elongation: <strong>{panchanga.tithi.elongation.toFixed(2)}°</strong> ·
              Tithi changes every 12°, karana every 6°, yoga every 13°20&apos;.
            </p>
          </div>
        </>
      )}
      {!panchanga && <p className="error-message">Enter a valid date and time.</p>}
    </div>
  );
}

function varaByIndex(i) {
  const NAMES = [
    { name: 'Ravivara', english: 'Sunday', lord: 'Sun' },
    { name: 'Somavara', english: 'Monday', lord: 'Moon' },
    { name: 'Mangalavara', english: 'Tuesday', lord: 'Mars' },
    { name: 'Budhavara', english: 'Wednesday', lord: 'Mercury' },
    { name: 'Guruvara', english: 'Thursday', lord: 'Jupiter' },
    { name: 'Shukravara', english: 'Friday', lord: 'Venus' },
    { name: 'Shanivara', english: 'Saturday', lord: 'Saturn' },
  ];
  return NAMES[i];
}
