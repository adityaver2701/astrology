/**
 * Verification suite for the astrology/astronomy engine.
 *
 * Astronomical reference values come from:
 *  - Jean Meeus, "Astronomical Algorithms" (2nd ed.) worked examples
 *  - Well-known equinox/solstice instants
 *  - Published Lahiri sidereal ingress dates (Drik Panchang)
 */
import { describe, it, expect } from 'vitest';
import {
  SIGNS,
  NAKSHATRAS,
  NAK_SPAN,
  normalize360,
  getJulianDate,
  julianToDate,
  getObliquity,
  getLahiriAyanamsha,
  getGMST,
  getLST,
  calculateAscendantLongitude,
  calculatePlanets,
  getPlanetSignIndex,
  scanPlanetTransits,
  getHouseFromLagna,
  matchLifeEventTransits,
  predictFutureReoccurrences,
  analyzeTrikBhavaNatal,
  calculateVimshottariDasha,
  getCurrentDasha,
  DASHA_SEQUENCE,
  DASHA_YEARS,
  getPlanetDignity,
  binduLabel,
  getAccuracyProfile,
  enhanceTransitWithPDFData,
} from './astrologyEngine';

const utc = (iso) => new Date(iso);

// ────────────────────────────────────────────────────────────────
// Static data integrity
// ────────────────────────────────────────────────────────────────
describe('static tables', () => {
  it('has 12 signs and 27 nakshatras', () => {
    expect(SIGNS).toHaveLength(12);
    expect(NAKSHATRAS).toHaveLength(27);
  });

  it('nakshatra lords follow the Vimshottari sequence (3 cycles of 9)', () => {
    const seq = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
    NAKSHATRAS.forEach((n, i) => expect(n.lord).toBe(seq[i % 9]));
  });

  it('dasha years total exactly 120', () => {
    const total = DASHA_SEQUENCE.reduce((s, l) => s + DASHA_YEARS[l], 0);
    expect(total).toBe(120);
  });
});

// ────────────────────────────────────────────────────────────────
// Time scales
// ────────────────────────────────────────────────────────────────
describe('getJulianDate', () => {
  it('J2000.0 epoch: 2000-01-01 12:00 UTC = JD 2451545.0', () => {
    expect(getJulianDate(utc('2000-01-01T12:00:00Z'))).toBeCloseTo(2451545.0, 6);
  });

  it('Meeus ex 7: 1987-04-10 00:00 UTC = JD 2446895.5', () => {
    expect(getJulianDate(utc('1987-04-10T00:00:00Z'))).toBeCloseTo(2446895.5, 6);
  });

  it('round-trips through julianToDate', () => {
    const d = utc('2024-08-15T06:30:00Z');
    const jd = getJulianDate(d);
    expect(Math.abs(julianToDate(jd).getTime() - d.getTime())).toBeLessThan(1000);
  });
});

describe('normalize360', () => {
  it('wraps angles into [0, 360)', () => {
    expect(normalize360(361)).toBeCloseTo(1, 9);
    expect(normalize360(-1)).toBeCloseTo(359, 9);
    expect(normalize360(720)).toBeCloseTo(0, 9);
    expect(normalize360(0)).toBe(0);
  });
});

describe('sidereal time & obliquity', () => {
  it('Meeus ex 12.a: GMST on 1987-04-10 0h UT = 197.693195 deg', () => {
    expect(getGMST(2446895.5)).toBeCloseTo(197.693195, 3);
  });

  it('LST adds east longitude', () => {
    const jd = 2446895.5;
    expect(getLST(jd, 77.2)).toBeCloseTo(normalize360(getGMST(jd) + 77.2), 9);
  });

  it('mean obliquity at J2000 is ~23.4393 deg', () => {
    expect(getObliquity(0)).toBeCloseTo(23.4392911, 5);
  });
});

describe('getLahiriAyanamsha', () => {
  it('is 23.850606 deg at J2000', () => {
    expect(getLahiriAyanamsha(0)).toBeCloseTo(23.850606, 6);
  });

  it('is ~24.2 deg in 2025 (precession of ~50.29"/yr)', () => {
    const T = (getJulianDate(utc('2025-06-01T00:00:00Z')) - 2451545.0) / 36525.0;
    expect(getLahiriAyanamsha(T)).toBeGreaterThan(24.15);
    expect(getLahiriAyanamsha(T)).toBeLessThan(24.25);
  });
});

// ────────────────────────────────────────────────────────────────
// Planetary positions (tropical, equinox of date)
// These would fail without the precession correction.
// ────────────────────────────────────────────────────────────────
describe('Sun position (tropical of date)', () => {
  // helper: tropical longitude = sidereal + ayanamsha
  const tropical = (planets, ayanamsha, id) => normalize360(planets[id].longitude + ayanamsha);

  it('is ~199.906 deg on 1992-10-13 00:00 TD (Meeus ex 25.a)', () => {
    const jd = 2448908.5; // TD; TD-UT delta (~59s) is far below tolerance
    const { planets, ayanamsha } = calculatePlanets(jd);
    expect(tropical(planets, ayanamsha, 'sun')).toBeCloseTo(199.906, 1);
  });

  it('is ~0 deg at the March 2024 equinox (2024-03-20 03:06 UT)', () => {
    const { planets, ayanamsha } = calculatePlanets(getJulianDate(utc('2024-03-20T03:06:00Z')));
    const lon = tropical(planets, ayanamsha, 'sun');
    const dist = Math.min(lon, 360 - lon);
    expect(dist).toBeLessThan(0.05);
  });

  it('is ~90 deg at the June 2020 solstice (2020-06-20 21:43 UT)', () => {
    const { planets, ayanamsha } = calculatePlanets(getJulianDate(utc('2020-06-20T21:43:00Z')));
    expect(tropical(planets, ayanamsha, 'sun')).toBeCloseTo(90, 1);
  });

  it('enters sidereal Aries around Mesha Sankranti (2025-04-14)', () => {
    const { planets } = calculatePlanets(getJulianDate(utc('2025-04-14T12:00:00Z')));
    expect(planets.sun.signIndex).toBe(0);
    expect(planets.sun.longitude).toBeLessThan(2);
  });
});

describe('Moon position', () => {
  it('is ~133.16 deg tropical on 1992-04-12 00:00 TD (Meeus ex 47.a)', () => {
    const jd = 2448724.5;
    const { planets, ayanamsha } = calculatePlanets(jd);
    const tropical = normalize360(planets.moon.longitude + ayanamsha);
    // Truncated ELP series + no nutation: allow 0.3 deg
    expect(Math.abs(tropical - 133.162655)).toBeLessThan(0.3);
  });

  it('is opposite the Sun at a known full moon (2024-04-23 23:49 UT)', () => {
    const { planets } = calculatePlanets(getJulianDate(utc('2024-04-23T23:49:00Z')));
    let diff = Math.abs(planets.moon.longitude - planets.sun.longitude);
    if (diff > 180) diff = 360 - diff;
    expect(diff).toBeGreaterThan(179);
  });
});

describe('Rahu / Ketu (mean node)', () => {
  it('mean node is 11.2531 deg on 1987-04-10 0h (Meeus ex 22.a)', () => {
    const { planets, ayanamsha } = calculatePlanets(2446895.5);
    const tropical = normalize360(planets.rahu.longitude + ayanamsha);
    expect(tropical).toBeCloseTo(11.2531, 1);
  });

  it('Ketu is always exactly opposite Rahu', () => {
    const { planets } = calculatePlanets(getJulianDate(utc('2024-01-01T00:00:00Z')));
    expect(normalize360(planets.rahu.longitude + 180)).toBeCloseTo(planets.ketu.longitude, 6);
  });

  it('nodes are flagged retrograde, Sun/Moon are not', () => {
    const { planets } = calculatePlanets(getJulianDate(utc('2024-01-01T00:00:00Z')));
    expect(planets.rahu.retrograde).toBe(true);
    expect(planets.ketu.retrograde).toBe(true);
    expect(planets.sun.retrograde).toBe(false);
    expect(planets.moon.retrograde).toBe(false);
  });
});

describe('calculatePlanets output shape', () => {
  const { planets } = calculatePlanets(getJulianDate(utc('2025-06-15T00:00:00Z')));

  it('returns all 9 grahas with valid ranges', () => {
    const ids = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];
    ids.forEach(id => {
      const p = planets[id];
      expect(p).toBeDefined();
      expect(p.longitude).toBeGreaterThanOrEqual(0);
      expect(p.longitude).toBeLessThan(360);
      expect(p.signIndex).toBeGreaterThanOrEqual(0);
      expect(p.signIndex).toBeLessThanOrEqual(11);
      expect(p.pada).toBeGreaterThanOrEqual(1);
      expect(p.pada).toBeLessThanOrEqual(4);
      expect(NAKSHATRAS.map(n => n.name)).toContain(p.nakshatraName);
    });
  });

  it('sign/degree/nakshatra are consistent with longitude', () => {
    Object.values(planets).forEach(p => {
      expect(Math.floor(p.longitude / 30)).toBe(p.signIndex);
      expect(p.degree).toBeCloseTo(p.longitude - p.signIndex * 30, 9);
      const nakIdx = Math.min(Math.floor(p.longitude / NAK_SPAN), 26);
      expect(p.nakshatraName).toBe(NAKSHATRAS[nakIdx].name);
    });
  });

  it('Saturn is in sidereal Pisces in mid-2025 (entered 2025-03-29)', () => {
    expect(planets.saturn.signName).toBe('Pisces');
  });
});

// ────────────────────────────────────────────────────────────────
// Ascendant
// ────────────────────────────────────────────────────────────────
describe('calculateAscendantLongitude', () => {
  it('at the equator with LST=0 the tropical ascendant is 90 deg', () => {
    // find a jd where GMST ~ 0 by solving with longitude offset instead
    const jd = 2451545.0;
    const lstNow = getGMST(jd); // use west longitude to zero out LST
    const lon = normalize360(-lstNow) > 180 ? normalize360(-lstNow) - 360 : normalize360(-lstNow);
    const T = (jd - 2451545.0) / 36525.0;
    const sidAsc = calculateAscendantLongitude(jd, lon, 0);
    const tropAsc = normalize360(sidAsc + getLahiriAyanamsha(T));
    expect(tropAsc).toBeCloseTo(90, 0);
  });

  it('advances roughly 360 deg per sidereal day', () => {
    const jd = getJulianDate(utc('2024-06-01T06:00:00Z'));
    const a1 = calculateAscendantLongitude(jd, 77.2, 28.6);
    const a2 = calculateAscendantLongitude(jd + 1 / 24, 77.2, 28.6);
    const delta = normalize360(a2 - a1);
    expect(delta).toBeGreaterThan(8);   // ~15 deg/hour, varies with rising sign
    expect(delta).toBeLessThan(25);
  });
});

// ────────────────────────────────────────────────────────────────
// Houses & transits
// ────────────────────────────────────────────────────────────────
describe('getHouseFromLagna', () => {
  it('maps signs to houses 1-12 relative to lagna', () => {
    expect(getHouseFromLagna(0, 0)).toBe(1);
    expect(getHouseFromLagna(11, 0)).toBe(12);
    expect(getHouseFromLagna(0, 11)).toBe(2);  // wraparound
    expect(getHouseFromLagna(5, 3)).toBe(3);
  });
});

describe('scanPlanetTransits', () => {
  it('finds Jupiter entering sidereal Leo in mid-July 2015', () => {
    const transits = scanPlanetTransits('jupiter', 2015, 2015);
    const leo = transits.find(t => t.toSignName === 'Leo');
    expect(leo).toBeDefined();
    const days = Math.abs(leo.date.getTime() - utc('2015-07-14T00:00:00Z').getTime()) / 86400000;
    expect(days).toBeLessThan(12); // Kepler-element accuracy ~ a few days of Jupiter motion
  });

  it('produces sequential sign changes within the scanned range', () => {
    const transits = scanPlanetTransits('saturn', 2010, 2020);
    expect(transits.length).toBeGreaterThanOrEqual(3);
    transits.forEach(t => {
      expect(t.date.getFullYear()).toBeGreaterThanOrEqual(2010);
      expect(t.date.getFullYear()).toBeLessThanOrEqual(2020);
      // adjacent signs (forward, or backward when retrograde re-entry)
      const fwd = (t.fromSign + 1) % 12 === t.toSign;
      const back = (t.toSign + 1) % 12 === t.fromSign;
      expect(fwd || back).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────
// Pattern matcher / prediction engine
// ────────────────────────────────────────────────────────────────
const birthDetails = {
  date: '1990-03-15',
  time: '10:30',
  timezone: 5.5,
  latitude: 28.6139,
  longitude: 77.209,
};

describe('matchLifeEventTransits', () => {
  const sig = matchLifeEventTransits(birthDetails, '2015-06-01', '2015-08-31');

  it('returns a complete event signature for the 4 karmic planets', () => {
    ['saturn', 'jupiter', 'rahu', 'ketu'].forEach(k => {
      expect(sig.eventSignature[k]).toBeDefined();
      expect(sig.eventSignature[k].house).toBeGreaterThanOrEqual(1);
      expect(sig.eventSignature[k].house).toBeLessThanOrEqual(12);
    });
    expect(sig.natalLagnaSign).toBeGreaterThanOrEqual(0);
    expect(sig.natalLagnaSign).toBeLessThanOrEqual(11);
    expect(Object.keys(sig.natalPlanets)).toHaveLength(9);
  });

  it('uses the midpoint of the event range', () => {
    expect(sig.midPointDate.getTime()).toBe(
      (utc('2015-06-01').getTime() + utc('2015-08-31').getTime()) / 2
    );
  });
});

describe('predictFutureReoccurrences', () => {
  it('returns windows sorted by peak score, all within the scan range', () => {
    const sig = matchLifeEventTransits(birthDetails, '2015-06-01', '2015-08-31');
    const windows = predictFutureReoccurrences(
      birthDetails, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets, 2026, 2036
    );
    expect(Array.isArray(windows)).toBe(true);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i - 1].peakScore).toBeGreaterThanOrEqual(windows[i].peakScore);
    }
    windows.forEach(w => {
      expect(w.peakScore).toBeGreaterThanOrEqual(60);
      expect(w.peakScore).toBeLessThanOrEqual(100);
      expect(w.startDate.getFullYear()).toBeGreaterThanOrEqual(2026);
      expect(w.endDate.getFullYear()).toBeLessThanOrEqual(2037);
      expect(w.startDate.getTime()).toBeLessThanOrEqual(w.endDate.getTime());
    });
  });

  it('an event signature matches itself (score 100 at the original date)', () => {
    // Use an event in the scannable past, then scan the same year
    const sig = matchLifeEventTransits(birthDetails, '2030-05-01', '2030-05-31');
    const windows = predictFutureReoccurrences(
      birthDetails, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets, 2030, 2030
    );
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].peakScore).toBeGreaterThanOrEqual(90);
  });
});

describe('analyzeTrikBhavaNatal', () => {
  it('reports lords and placements for houses 6, 8, 12', () => {
    const natal = calculatePlanets(getJulianDate(utc('1990-03-15T05:00:00Z')));
    const res = analyzeTrikBhavaNatal(natal.planets, 4);
    [6, 8, 12].forEach(h => {
      expect(res.placements[h].lord).toBeTruthy();
      expect(res.placements[h].placedHouse).toBeGreaterThanOrEqual(1);
      expect(res.placements[h].placedHouse).toBeLessThanOrEqual(12);
    });
    expect(Object.keys(res.houseLords)).toHaveLength(12);
    expect(Array.isArray(res.yogas)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────
// Vimshottari Dasha
// ────────────────────────────────────────────────────────────────
describe('calculateVimshottariDasha', () => {
  const birthJd = getJulianDate(utc('1990-03-15T05:00:00Z'));

  it('Moon at 0 deg (Ashwini start) gives a full 7-year Ketu dasha first', () => {
    const dashas = calculateVimshottariDasha(birthJd, 0);
    expect(dashas[0].lord).toBe('ketu');
    expect(dashas[0].years).toBeCloseTo(7, 6);
    expect(dashas[1].lord).toBe('venus');
  });

  it('Moon halfway through a nakshatra leaves half the dasha balance', () => {
    const dashas = calculateVimshottariDasha(birthJd, NAK_SPAN / 2); // mid-Ashwini
    expect(dashas[0].lord).toBe('ketu');
    expect(dashas[0].years).toBeCloseTo(3.5, 6);
  });

  it('Moon at 100 deg (Pushya, Saturn) gives 9.5y Saturn balance', () => {
    const dashas = calculateVimshottariDasha(birthJd, 100);
    expect(dashas[0].lord).toBe('saturn');
    expect(dashas[0].years).toBeCloseTo(DASHA_YEARS.saturn * (1 - (100 - 7 * NAK_SPAN) / NAK_SPAN), 4);
  });

  it('dashas are contiguous and follow the canonical sequence', () => {
    const dashas = calculateVimshottariDasha(birthJd, 200);
    for (let i = 1; i < dashas.length; i++) {
      expect(dashas[i].startDate.getTime()).toBe(dashas[i - 1].endDate.getTime());
      const prevIdx = DASHA_SEQUENCE.indexOf(dashas[i - 1].lord);
      expect(dashas[i].lord).toBe(DASHA_SEQUENCE[(prevIdx + 1) % 9]);
    }
  });

  it('antardashas start with the maha lord and sum to the maha duration', () => {
    const dashas = calculateVimshottariDasha(birthJd, 200);
    const maha = dashas[2]; // a full dasha
    expect(maha.antardashas[0].lord).toBe(maha.lord);
    expect(maha.antardashas).toHaveLength(9);
    const sum = maha.antardashas.reduce((s, ad) => s + ad.years, 0);
    expect(sum).toBeCloseTo(maha.years, 6);
    // proportional rule: first AD of a full maha = years * years/120
    expect(maha.antardashas[0].years).toBeCloseTo(maha.years * DASHA_YEARS[maha.lord] / 120, 6);
  });

  it('getCurrentDasha finds the active maha and antar dasha', () => {
    const dashas = calculateVimshottariDasha(birthJd, 200);
    const probe = utc('2026-06-11T00:00:00Z');
    const { currentMahadasha, currentAntardasha, nextMahadasha } = getCurrentDasha(dashas, probe);
    expect(currentMahadasha).not.toBeNull();
    expect(probe.getTime()).toBeGreaterThanOrEqual(currentMahadasha.startDate.getTime());
    expect(probe.getTime()).toBeLessThan(currentMahadasha.endDate.getTime());
    expect(currentAntardasha).not.toBeNull();
    expect(nextMahadasha.lord).toBe(
      DASHA_SEQUENCE[(DASHA_SEQUENCE.indexOf(currentMahadasha.lord) + 1) % 9]
    );
  });
});

// ────────────────────────────────────────────────────────────────
// Dignity, bindu labels, PDF enhancement
// ────────────────────────────────────────────────────────────────
describe('getPlanetDignity', () => {
  it('classical exaltation/debilitation/own signs', () => {
    expect(getPlanetDignity('sun', 0)).toBe('exalted');       // Aries
    expect(getPlanetDignity('sun', 6)).toBe('debilitated');   // Libra
    expect(getPlanetDignity('sun', 4)).toBe('own');           // Leo
    expect(getPlanetDignity('saturn', 6)).toBe('exalted');    // Libra
    expect(getPlanetDignity('jupiter', 3)).toBe('exalted');   // Cancer
    expect(getPlanetDignity('venus', 11)).toBe('exalted');    // Pisces
    expect(getPlanetDignity('moon', 2)).toBe('neutral');
    expect(getPlanetDignity('unknown', 0)).toBe('neutral');
  });
});

describe('binduLabel', () => {
  it('maps bindu scores to severity labels', () => {
    expect(binduLabel(0).label).toBe('Crisis');
    expect(binduLabel(2).label).toBe('Difficult');
    expect(binduLabel(3).label).toBe('Challenging');
    expect(binduLabel(4).label).toBe('Neutral');
    expect(binduLabel(5).label).toBe('Supportive');
    expect(binduLabel(6).label).toBe('Strong');
    expect(binduLabel(8).label).toBe('Excellent');
    expect(binduLabel(null)).toBeNull();
  });
});

describe('getAccuracyProfile', () => {
  it('base accuracy without PDF data is 38', () => {
    const prof = getAccuracyProfile(null);
    expect(prof.base).toBe(38);
    expect(prof.earned).toBe(0);
    expect(prof.total).toBe(38);
  });

  it('earns points per available PDF section', () => {
    const prof = getAccuracyProfile({ ashtakvarga: { total: new Array(12).fill(28) }, shadbala: { sun: 6 } });
    expect(prof.earned).toBe(22 + 10);
    expect(prof.total).toBe(38 + 32);
  });
});

describe('enhanceTransitWithPDFData', () => {
  it('passes the match through untouched when no PDF data', () => {
    const match = { score: 80, transits: { saturn: { signIndex: 3 } } };
    expect(enhanceTransitWithPDFData(match, null)).toBe(match);
  });

  it('boosts score when average bindu >= 5 and caps at 100', () => {
    const byPlanet = { saturn: new Array(12).fill(6), jupiter: new Array(12).fill(6) };
    const pdfData = { ashtakvarga: { byPlanet, total: new Array(12).fill(30) } };
    const match = {
      score: 95,
      transits: { saturn: { signIndex: 2 }, jupiter: { signIndex: 5 } },
    };
    const out = enhanceTransitWithPDFData(match, pdfData);
    expect(parseFloat(out.avgBindu)).toBe(6);
    expect(out.adjustedScore).toBe(100); // 95 * 1.1 capped
  });
});

// ────────────────────────────────────────────────────────────────
// getPlanetSignIndex consistency with calculatePlanets
// ────────────────────────────────────────────────────────────────
describe('getPlanetSignIndex', () => {
  it('agrees with calculatePlanets for every graha', () => {
    const jd = getJulianDate(utc('2026-06-11T00:00:00Z'));
    const T = (jd - 2451545.0) / 36525.0;
    const aya = getLahiriAyanamsha(T);
    const { planets } = calculatePlanets(jd);
    Object.keys(planets).forEach(id => {
      expect(getPlanetSignIndex(id, jd, aya)).toBe(planets[id].signIndex);
    });
  });
});
