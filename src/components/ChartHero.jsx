import { useMemo, useState } from 'react';
import { SIGNS, NAKSHATRAS, calculatePlanets, getJulianDate, getCurrentDasha, normalize360 } from '../astrologyEngine';
import { computePanchanga, VARA_NAMES } from '../panchanga';
import { formatDegrees, SIGN_GLYPHS } from '../constants';
import { IconCalendar, IconClock, IconPin, IconEdit, IconSave, IconChevronRight } from './Icons';

// ── Chart identity + "Today's sky" ────────────────────────────────────────
// Sits above every tab so you always know WHOSE chart you're reading (that
// used to be a blank "Birth Analysis of" heading) and gives the app a reason
// to open daily: today's tithi, where the Moon is moving through YOUR houses,
// Sade Sati status and how far into the running dasha you are.
//
// The birth form itself lives in BirthDetailsDrawer; this card is the way in.

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function formatOffset(tz) {
  const n = Number(tz);
  if (!Number.isFinite(n)) return '';
  const sign = n >= 0 ? '+' : '−';
  const abs = Math.abs(n);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

function formatBirthDate(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date || '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatBirthTime(time) {
  const d = new Date(`1970-01-01T${time || '00:00'}:00Z`);
  if (Number.isNaN(d.getTime())) return time || '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

/**
 * Moon phase drawn from the Sun–Moon elongation (0° new → 180° full).
 * The lit limb is a half-circle; the terminator is a half-ellipse whose
 * x-radius is r·|cos e|, bulging toward the lit side for a crescent and away
 * from it for a gibbous moon.
 */
function MoonPhase({ elongation, size = 40 }) {
  const r = 18;
  const e = normalize360(elongation) * Math.PI / 180;
  const waxing = elongation % 360 < 180;
  const crescent = Math.cos(e) > 0;
  const rx = Math.abs(Math.cos(e)) * r;
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing === crescent ? 0 : 1;
  const d = `M0 ${-r} A${r} ${r} 0 0 ${limbSweep} 0 ${r} A${rx.toFixed(2)} ${r} 0 0 ${termSweep} 0 ${-r}Z`;
  const pct = Math.round(((1 - Math.cos(e)) / 2) * 100);
  return (
    <svg className="moon-phase" width={size} height={size} viewBox="-20 -20 40 40" role="img"
      aria-label={`Moon ${pct}% illuminated, ${waxing ? 'waxing' : 'waning'}`}>
      <circle r={r} className="moon-dark" />
      <path d={d} className="moon-lit" />
      <circle r={r} className="moon-rim" />
    </svg>
  );
}

export default function ChartHero({
  birthDetails, natalChart, dashaData, activeProfile, isSample,
  onEditBirth, onSaveProfile, setActiveTab,
}) {
  // "Now" is captured once per mount; the card is a daily glance, not a clock.
  const [now] = useState(() => new Date());

  const sky = useMemo(() => {
    try {
      const p = computePanchanga(now);
      const { planets } = calculatePlanets(getJulianDate(now));
      return { ...p, vara: VARA_NAMES[now.getDay()], planets };
    } catch (err) {
      console.warn('Today’s sky unavailable', err);
      return null;
    }
  }, [now]);

  const name = activeProfile?.profileName || birthDetails.name?.trim() || '';
  const lagna = natalChart ? SIGNS[natalChart.lagnaSign] : null;
  const moon = natalChart?.planets?.moon;
  const sun = natalChart?.planets?.sun;

  // Personal transit facts — need both the natal chart and today's sky.
  const personal = useMemo(() => {
    if (!sky || !natalChart || !moon) return null;
    const moonToday = sky.planets.moon;
    const saturnToday = sky.planets.saturn;
    const houseFromLagna = (signIdx) => ((signIdx - natalChart.lagnaSign + 12) % 12) + 1;
    // Sade Sati: Saturn in the 12th, 1st or 2nd sign from the natal Moon.
    const fromMoon = (saturnToday.signIndex - moon.signIndex + 12) % 12;
    const sadeSati = fromMoon === 11 ? 'rising phase' : fromMoon === 0 ? 'peak phase' : fromMoon === 1 ? 'setting phase' : null;
    return {
      moonHouse: houseFromLagna(moonToday.signIndex),
      saturnHouse: houseFromLagna(saturnToday.signIndex),
      jupiterHouse: houseFromLagna(sky.planets.jupiter.signIndex),
      sadeSati,
    };
  }, [sky, natalChart, moon]);

  const dasha = useMemo(() => {
    if (!dashaData) return null;
    const { currentMahadasha: md, currentAntardasha: ad } = getCurrentDasha(dashaData, now);
    if (!md) return null;
    const span = ad || md;
    const progress = Math.min(1, Math.max(0,
      (now.getTime() - span.startDate.getTime()) / (span.endDate.getTime() - span.startDate.getTime())));
    return { md, ad, progress, until: span.endDate };
  }, [dashaData, now]);

  const lagnaNak = natalChart
    ? NAKSHATRAS[Math.floor((natalChart.lagnaSign * 30 + natalChart.lagnaDegree) / (360 / 27))]
    : null;

  return (
    <section className={`hero glass-card${isSample ? ' is-sample' : ''}`} aria-label="Current chart" data-testid="chart-hero">
      <div className="hero-identity">
        <div className="hero-avatar" style={{ '--avatar-bg': activeProfile?.color || 'var(--gold-mid)' }} aria-hidden="true">
          <span className="hero-avatar-ring" />
          <span className="hero-avatar-letter">{name ? name.charAt(0).toUpperCase() : '☉'}</span>
        </div>

        <div className="hero-main">
          <div className="hero-eyebrow">
            {activeProfile ? 'Saved profile' : isSample ? 'Sample chart' : 'Unsaved chart'}
          </div>
          <h1 className="hero-name">{name || 'Your birth chart'}</h1>

          <ul className="hero-facts" aria-label="Birth details">
            <li><IconCalendar size={14} /> {formatBirthDate(birthDetails.date)}</li>
            <li><IconClock size={14} /> {formatBirthTime(birthDetails.time)}</li>
            <li title={`${Number(birthDetails.latitude).toFixed(4)}°, ${Number(birthDetails.longitude).toFixed(4)}°`}>
              <IconPin size={14} /> <span className="hero-place">{birthDetails.placeName || 'Unknown place'}</span>
            </li>
            <li className="hero-tz">{formatOffset(birthDetails.timezone)}</li>
          </ul>

          {natalChart && (
            <div className="big-three" aria-label="Ascendant, Moon and Sun signs">
              <span className="b3-chip" title={`Ascendant ${formatDegrees(natalChart.lagnaDegree)} · ${lagnaNak?.name || ''}`}>
                <span className="b3-glyph">{SIGN_GLYPHS[natalChart.lagnaSign]}</span>
                <span className="b3-text"><span className="b3-label">Ascendant</span><span className="b3-value">{lagna.name} <small>{formatDegrees(natalChart.lagnaDegree)}</small></span></span>
              </span>
              {moon && (
                <span className="b3-chip" title={`Moon in ${moon.nakshatraName}, pada ${moon.pada}`}>
                  <span className="b3-glyph">{SIGN_GLYPHS[moon.signIndex]}</span>
                  <span className="b3-text"><span className="b3-label">Moon</span><span className="b3-value">{moon.signName} <small>{moon.nakshatraName}</small></span></span>
                </span>
              )}
              {sun && (
                <span className="b3-chip" title={`Sun in ${sun.nakshatraName}`}>
                  <span className="b3-glyph">{SIGN_GLYPHS[sun.signIndex]}</span>
                  <span className="b3-text"><span className="b3-label">Sun</span><span className="b3-value">{sun.signName}</span></span>
                </span>
              )}
            </div>
          )}

          {isSample && (
            <p className="hero-sample-note">
              This is a <strong>sample chart</strong> (1 Jan 2000, New Delhi). Add your own birth date,
              time and place and every section becomes personal.
            </p>
          )}

          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={onEditBirth} data-testid="edit-birth-details">
              <IconEdit size={15} /> {isSample ? 'Enter my birth details' : 'Edit birth details'}
            </button>
            {!activeProfile && !isSample && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onSaveProfile}>
                <IconSave size={15} /> Save as profile
              </button>
            )}
          </div>
        </div>
      </div>

      {sky && (
        <aside className="sky-card" aria-label="Today's sky">
          <div className="sky-head">
            <MoonPhase elongation={sky.tithi.elongation} />
            <div>
              <div className="sky-title">Today’s sky</div>
              <div className="sky-date">
                {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                {' · '}{sky.vara?.name}
              </div>
            </div>
          </div>

          <dl className="sky-list">
            <div className="sky-row">
              <dt>Tithi</dt>
              <dd>{sky.tithi.paksha.split(' ')[0]} {sky.tithi.name}</dd>
            </div>
            <div className="sky-row">
              <dt>Moon</dt>
              <dd>
                {sky.moon.signName} · {sky.moon.nakshatraName}
                {personal && <span className="sky-personal">in your {ordinal(personal.moonHouse)} house</span>}
              </dd>
            </div>
            <div className="sky-row">
              <dt>Yoga</dt>
              <dd className={sky.yoga.caution ? 'sky-caution' : ''}>{sky.yoga.name}{sky.yoga.caution ? ' · caution' : ''}</dd>
            </div>
            {personal && (
              <div className="sky-row">
                <dt>Transits</dt>
                <dd>
                  Jupiter {ordinal(personal.jupiterHouse)} · Saturn {ordinal(personal.saturnHouse)}
                  <span className="sky-personal">houses from your ascendant</span>
                </dd>
              </div>
            )}
          </dl>

          {personal?.sadeSati && (
            <div className="sky-flag" title="Saturn is transiting the 12th, 1st or 2nd sign from your natal Moon">
              ♄ Sade Sati — {personal.sadeSati}
            </div>
          )}

          {dasha && (
            <button type="button" className="sky-dasha" onClick={() => setActiveTab('dasha-system')}
              title="Open the Vimshottari Dasha timeline">
              <span className="sky-dasha-top">
                <span><span className="sky-dasha-label">Dasha</span> {cap(dasha.md.lord)}{dasha.ad ? ` › ${cap(dasha.ad.lord)}` : ''}</span>
                <span className="sky-dasha-until">until {dasha.until.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
              </span>
              <span className="progress" aria-hidden="true"><span style={{ width: `${Math.round(dasha.progress * 100)}%` }} /></span>
            </button>
          )}

          <button type="button" className="sky-link" onClick={() => setActiveTab('panchanga')}>
            Full almanac <IconChevronRight size={14} />
          </button>
        </aside>
      )}
    </section>
  );
}
