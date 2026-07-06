// ── Divisional (Varga) charts — Parashari method ──────────────────────────
// Maps a sidereal longitude (0–360) to a divisional sign (0–11) and a
// proportional degree (0–30) within that sign, for the supported vargas.
// Signs are 0-indexed: 0=Aries … 11=Pisces.

export const VARGAS = [
  { id: 'D1',  num: 1,  name: 'Rasi',         label: 'D1 · Rasi (Birth)' },
  { id: 'D2',  num: 2,  name: 'Hora',         label: 'D2 · Hora (Wealth)' },
  { id: 'D3',  num: 3,  name: 'Drekkana',     label: 'D3 · Drekkana (Siblings)' },
  { id: 'D4',  num: 4,  name: 'Chaturthamsa', label: 'D4 · Chaturthamsa (Home/Fortune)' },
  { id: 'D9',  num: 9,  name: 'Navamsa',      label: 'D9 · Navamsa (Spouse/Dharma)' },
  { id: 'D10', num: 10, name: 'Dasamsa',      label: 'D10 · Dasamsa (Career)' },
  { id: 'D30', num: 30, name: 'Trimsamsa',    label: 'D30 · Trimsamsa (Strengths/Adversity)' },
];

function norm360(l) { return ((l % 360) + 360) % 360; }
function pctDeg(offset, size) { return (offset / size) * 30; }

// Trimsamsa unequal divisions (cumulative limits + resulting sign)
const TRIMSAMSA_ODD = [
  { lim: 5,  sign: 0 },   // Mars  → Aries
  { lim: 10, sign: 10 },  // Saturn → Aquarius
  { lim: 18, sign: 8 },   // Jupiter → Sagittarius
  { lim: 25, sign: 2 },   // Mercury → Gemini
  { lim: 30, sign: 6 },   // Venus → Libra
];
const TRIMSAMSA_EVEN = [
  { lim: 5,  sign: 1 },   // Venus → Taurus
  { lim: 12, sign: 5 },   // Mercury → Virgo
  { lim: 20, sign: 11 },  // Jupiter → Pisces
  { lim: 25, sign: 9 },   // Saturn → Capricorn
  { lim: 30, sign: 7 },   // Mars → Scorpio
];

/**
 * @param {number} longitude sidereal longitude 0–360
 * @param {number} dn division number (1,2,3,4,9,10,30)
 * @returns {{sign:number, degree:number}}
 */
export function divisionalPosition(longitude, dn) {
  const L = norm360(longitude);
  const s = Math.floor(L / 30);   // sign 0–11
  const d = L - s * 30;           // 0–30 within sign
  const oddSign = s % 2 === 0;    // 0-indexed even ⇒ odd-numbered sign (Aries…)

  switch (dn) {
    case 1:
      return { sign: s, degree: d };

    case 2: { // Hora — Sun's (Leo=4) / Moon's (Cancer=3)
      const firstHalf = d < 15;
      const sign = oddSign ? (firstHalf ? 4 : 3) : (firstHalf ? 3 : 4);
      return { sign, degree: pctDeg(d % 15, 15) };
    }

    case 3: { // Drekkana — self, 5th, 9th
      const p = Math.floor(d / 10);              // 0,1,2
      return { sign: (s + 4 * p) % 12, degree: pctDeg(d % 10, 10) };
    }

    case 4: { // Chaturthamsa — kendras from the sign
      const p = Math.floor(d / 7.5);             // 0..3
      return { sign: (s + 3 * p) % 12, degree: pctDeg(d % 7.5, 7.5) };
    }

    case 9: { // Navamsa — continuous (handles movable/fixed/dual automatically)
      const size = 30 / 9;
      const p = Math.floor(d / size);            // 0..8
      return { sign: (s * 9 + p) % 12, degree: pctDeg(d - p * size, size) };
    }

    case 10: { // Dasamsa — odd: from sign; even: from 9th
      const p = Math.floor(d / 3);               // 0..9
      const start = oddSign ? s : (s + 8) % 12;
      return { sign: (start + p) % 12, degree: pctDeg(d % 3, 3) };
    }

    case 30: { // Trimsamsa — unequal parts
      const parts = oddSign ? TRIMSAMSA_ODD : TRIMSAMSA_EVEN;
      let prev = 0;
      for (const part of parts) {
        if (d < part.lim) return { sign: part.sign, degree: pctDeg(d - prev, part.lim - prev) };
        prev = part.lim;
      }
      const last = parts[parts.length - 1];
      return { sign: last.sign, degree: 0 };
    }

    default:
      return { sign: s, degree: d };
  }
}

/**
 * Build a divisional chart from natal planets (each with .longitude sidereal)
 * and the ascendant's sidereal longitude.
 * @returns {{planets: object, lagnaSign: number}}
 */
export function buildVargaChart(natalPlanets, ascendantLongitude, dn) {
  const planets = {};
  Object.keys(natalPlanets).forEach(key => {
    const p = natalPlanets[key];
    const pos = divisionalPosition(p.longitude, dn);
    planets[key] = { ...p, signIndex: pos.sign, degree: pos.degree };
  });
  const lagna = divisionalPosition(ascendantLongitude, dn);
  return { planets, lagnaSign: lagna.sign };
}
