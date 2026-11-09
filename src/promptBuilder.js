// ── Generic AI prompt builder ─────────────────────────────────────────────
// Builds a self-contained, copy-paste-ready prompt describing one chart so the
// user can append their own question and use it in any AI chat application.
// Pure functions only (no React) so it is unit-testable.

import { SIGNS, getCurrentDasha } from './astrologyEngine.js';

const PLANET_ORDER = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
const LABEL = {
  sun: 'Sun', moon: 'Moon', mars: 'Mars', mercury: 'Mercury', jupiter: 'Jupiter',
  venus: 'Venus', saturn: 'Saturn', rahu: 'Rahu', ketu: 'Ketu',
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const houseFrom = (signIndex, lagnaSign) => ((signIndex - lagnaSign + 12) % 12) + 1;

/** 14.4167 → 14°25' */
export function fmtDeg(deg) {
  let d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return `${d}°${String(m).padStart(2, '0')}'`;
}

const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function fmtRemaining(from, to) {
  const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
  const y = Math.floor(days / 365.25);
  const m = Math.floor((days - y * 365.25) / 30.44);
  const parts = [];
  if (y) parts.push(`${y}y`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${days}d`);
  return parts.join(' ');
}

function dashaSection(dashaData, now) {
  if (!dashaData) return '(Dasha data unavailable)';
  const cur = getCurrentDasha(dashaData, now);
  const md = cur.currentMahadasha;
  if (!md) return '(Current dasha could not be determined)';
  const ad = cur.currentAntardasha;
  const lines = [
    `- Mahadasha: ${cap(md.lord)} — ${fmtDate(md.startDate)} to ${fmtDate(md.endDate)} (ends in ${fmtRemaining(now, md.endDate)})`,
  ];
  if (ad) {
    lines.push(`- Antardasha: ${cap(ad.lord)} — ${fmtDate(ad.startDate)} to ${fmtDate(ad.endDate)} (ends in ${fmtRemaining(now, ad.endDate)})`);
  }
  return lines.join('\n');
}

function d1Section(natalChart) {
  const lagna = natalChart.lagnaSign;
  const lines = [`Ascendant (Lagna): ${SIGNS[lagna].name} ${fmtDeg(natalChart.lagnaDegree)} (House 1)`];
  PLANET_ORDER.forEach((k) => {
    const p = natalChart.planets[k];
    if (!p) return;
    lines.push(
      `- ${LABEL[k]}: ${p.signName} ${fmtDeg(p.degree)}, House ${houseFrom(p.signIndex, lagna)}, ` +
      `${p.nakshatraName} pada ${p.pada}, ${p.retrograde ? 'Retrograde' : 'Direct'}`
    );
  });
  return lines.join('\n');
}

function vargaSection(varga) {
  if (!varga) return '(unavailable)';
  const lines = [`Ascendant: ${SIGNS[varga.lagnaSign].name} (House 1)`];
  PLANET_ORDER.forEach((k) => {
    const p = varga.planets[k];
    if (!p) return;
    lines.push(`- ${LABEL[k]}: ${SIGNS[p.signIndex].name}, House ${houseFrom(p.signIndex, varga.lagnaSign)}`);
  });
  return lines.join('\n');
}

function transitSection(transitPlanets, natalLagnaSign) {
  const lines = [];
  PLANET_ORDER.forEach((k) => {
    const p = transitPlanets[k];
    if (!p) return;
    lines.push(
      `- ${LABEL[k]}: ${p.signName} ${fmtDeg(p.degree)}, House ${houseFrom(p.signIndex, natalLagnaSign)} ` +
      `from natal Lagna, ${p.retrograde ? 'Retrograde' : 'Direct'}`
    );
  });
  return lines.join('\n');
}

/**
 * @param {object} args
 * @param {object} args.birthDetails  {name,date,time,placeName,...}
 * @param {object} args.natalChart    {lagnaSign, lagnaDegree, planets}
 * @param {Array}  args.dashaData     from calculateVimshottariDasha
 * @param {Array}  args.vargaCharts   [{id:'D9'|'D10'|..., planets, lagnaSign}]
 * @param {object} args.transitPlanets planets map from calculatePlanets(now)
 * @param {Date}   [args.now]
 */
export function buildChartPrompt({ birthDetails, natalChart, dashaData, vargaCharts, transitPlanets, now = new Date() }) {
  const who = birthDetails?.name || 'the native';
  const d9 = (vargaCharts || []).find((v) => v.id === 'D9');
  const d10 = (vargaCharts || []).find((v) => v.id === 'D10');

  return [
    `You are an expert Vedic (Jyotish) astrologer. Use the sidereal (Lahiri ayanamsha) chart data below for ${who} to answer my question at the end. Use whole-sign houses counted from the Lagna. Base your answer on the data given, explain your reasoning, and be honest about uncertainty.`,
    '',
    '## BIRTH DETAILS',
    `Name: ${birthDetails?.name || '—'}`,
    `Born: ${birthDetails?.date || '—'} ${birthDetails?.time || ''} at ${birthDetails?.placeName || '—'}`,
    `Today's date: ${fmtDate(now)}`,
    '',
    '## CURRENT VIMSHOTTARI DASHA',
    dashaSection(dashaData, now),
    '',
    '## D1 — RASI (BIRTH CHART)',
    d1Section(natalChart),
    '',
    '## D9 — NAVAMSA',
    vargaSection(d9),
    '',
    '## D10 — DASAMSA',
    vargaSection(d10),
    '',
    `## CURRENT TRANSITS (as of ${fmtDate(now)})`,
    transitSection(transitPlanets, natalChart.lagnaSign),
    '',
    '## MY QUESTION',
    '',
  ].join('\n');
}
