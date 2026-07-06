// ── Tests for the predictive scanners (previously untested) ────────────────
// predictFutureReoccurrences + scanDegreeAlignments + matchLifeEventTransits,
// plus the new panchanga and ashtakoota modules.
import { describe, it, expect } from 'vitest';
import {
  matchLifeEventTransits,
  predictFutureReoccurrences,
  scanDegreeAlignments,
  analyzePeakDateAlignments,
  calculatePlanets,
  calculateAscendantLongitude,
  getJulianDate,
} from './astrologyEngine';
import { computePanchanga, TITHI_NAMES, YOGA_NAMES } from './panchanga';
import { computeKootas, computeMoonProfile } from './compatibility';

const BIRTH = {
  name: 'Test Native',
  date: '1990-05-15',
  time: '10:30',
  placeName: 'New Delhi, India',
  latitude: 28.6139,
  longitude: 77.209,
  timezone: 5.5,
};

function natalFor(bd) {
  const birthUtc = new Date(new Date(`${bd.date}T${bd.time}Z`).getTime() - bd.timezone * 3600000);
  const jd = getJulianDate(birthUtc);
  const { planets } = calculatePlanets(jd);
  const lagnaSign = Math.floor(calculateAscendantLongitude(jd, bd.longitude, bd.latitude) / 30);
  return { planets, lagnaSign };
}

describe('matchLifeEventTransits', () => {
  it('produces a signature for the slow movers with valid houses', () => {
    const sig = matchLifeEventTransits(BIRTH, '2017-06-01', '2017-07-31');
    expect(sig.eventSignature).toBeTruthy();
    for (const key of ['saturn', 'jupiter', 'rahu', 'ketu']) {
      const info = sig.eventSignature[key];
      expect(info, key).toBeTruthy();
      expect(info.house).toBeGreaterThanOrEqual(1);
      expect(info.house).toBeLessThanOrEqual(12);
      expect(info.signIndex).toBeGreaterThanOrEqual(0);
      expect(info.signIndex).toBeLessThanOrEqual(11);
    }
    expect(sig.natalLagnaSign).toBeGreaterThanOrEqual(0);
    expect(sig.natalLagnaSign).toBeLessThanOrEqual(11);
  });
});

describe('predictFutureReoccurrences', () => {
  const sig = matchLifeEventTransits(BIRTH, '2017-06-01', '2017-07-31');
  const matches = predictFutureReoccurrences(
    BIRTH, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets, 2026, 2032
  );

  it('returns windows sorted with valid dates and scores', () => {
    expect(Array.isArray(matches)).toBe(true);
    for (const m of matches) {
      expect(m.startDate).toBeInstanceOf(Date);
      expect(m.endDate).toBeInstanceOf(Date);
      expect(m.peakDate).toBeInstanceOf(Date);
      expect(m.startDate.getTime()).toBeLessThanOrEqual(m.endDate.getTime());
      expect(m.peakDate.getTime()).toBeGreaterThanOrEqual(m.startDate.getTime());
      expect(m.peakDate.getTime()).toBeLessThanOrEqual(m.endDate.getTime());
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
  });

  it('keeps every window inside the requested year range', () => {
    for (const m of matches) {
      expect(m.peakDate.getFullYear()).toBeGreaterThanOrEqual(2026);
      expect(m.peakDate.getFullYear()).toBeLessThanOrEqual(2032);
    }
  });

  it('window transits reference all four slow movers', () => {
    for (const m of matches.slice(0, 3)) {
      for (const key of ['saturn', 'jupiter', 'rahu', 'ketu']) {
        expect(m.transits[key], key).toBeTruthy();
        expect(m.transits[key].house).toBeGreaterThanOrEqual(1);
        expect(m.transits[key].house).toBeLessThanOrEqual(12);
      }
    }
  });

  it('is deterministic for identical inputs', () => {
    const again = predictFutureReoccurrences(
      BIRTH, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets, 2026, 2032
    );
    expect(again.length).toBe(matches.length);
    if (matches.length) {
      expect(again[0].peakDate.getTime()).toBe(matches[0].peakDate.getTime());
      expect(again[0].score).toBe(matches[0].score);
    }
  });
});

describe('scanDegreeAlignments', () => {
  const { planets, lagnaSign } = natalFor(BIRTH);
  const alignments = scanDegreeAlignments(BIRTH, planets, lagnaSign, 2026, 2029);

  it('finds alignments with valid structure over a 3-year window', () => {
    expect(Array.isArray(alignments)).toBe(true);
    expect(alignments.length).toBeGreaterThan(0); // slow movers WILL hit natal degrees in 3 years
    for (const al of alignments) {
      expect(al.date).toBeInstanceOf(Date);
      expect(['high', 'medium', 'low']).toContain(al.severity);
      expect(al.transitDegree).toBeGreaterThanOrEqual(0);
      expect(al.transitDegree).toBeLessThan(30);
      expect(al.natalDegree).toBeGreaterThanOrEqual(0);
      expect(al.natalDegree).toBeLessThan(30);
      // Same-degree match types must be within 1.0° of in-sign degree,
      // measured circularly (29.8° and 0.2° are 0.4° apart across a sign
      // boundary). Pure nakshatra matches may sit at different degrees.
      if (/Degree/i.test(al.matchType)) {
        const d = Math.abs(al.transitDegree - al.natalDegree);
        expect(Math.min(d, 30 - d)).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('returns chronologically ordered results', () => {
    for (let i = 1; i < alignments.length; i++) {
      expect(alignments[i].date.getTime()).toBeGreaterThanOrEqual(alignments[i - 1].date.getTime());
    }
  });
});

describe('analyzePeakDateAlignments', () => {
  it('handles an arbitrary date without throwing and bounds fields', () => {
    const { planets, lagnaSign } = natalFor(BIRTH);
    const hits = analyzePeakDateAlignments(new Date('2027-03-15T12:00:00Z'), planets, lagnaSign);
    expect(Array.isArray(hits)).toBe(true);
    for (const h of hits) {
      expect(h.transitHouse).toBeGreaterThanOrEqual(1);
      expect(h.transitHouse).toBeLessThanOrEqual(12);
    }
  });
});

describe('panchanga', () => {
  it('computes a full panchanga with all five limbs', () => {
    const p = computePanchanga(new Date('2026-07-06T12:00:00Z'));
    expect(p.tithi.index).toBeGreaterThanOrEqual(0);
    expect(p.tithi.index).toBeLessThanOrEqual(29);
    expect(p.tithi.name).toBeTruthy();
    expect(p.vara.english).toBe('Monday'); // 2026-07-06 is a Monday
    expect(p.nakshatra.name).toBeTruthy();
    expect(YOGA_NAMES).toContain(p.yoga.name);
    expect(p.karana.name).toBeTruthy();
  });

  it('tithi and elongation are consistent', () => {
    const p = computePanchanga(new Date('2030-01-01T00:00:00Z'));
    expect(Math.floor(p.tithi.elongation / 12)).toBe(p.tithi.index);
  });

  it('full/new moon naming', () => {
    // Scan a lunar month for the full-moon tithi to sanity-check naming.
    let sawPurnima = false, sawAmavasya = false;
    for (let i = 0; i < 30; i++) {
      const p = computePanchanga(new Date(Date.UTC(2026, 0, 1 + i)));
      if (p.tithi.index === 14) sawPurnima = p.tithi.name.includes('Purnima');
      if (p.tithi.index === 29) sawAmavasya = p.tithi.name.includes('Amavasya');
    }
    expect(sawPurnima || sawAmavasya).toBe(true);
    expect(TITHI_NAMES.length).toBe(14);
  });
});

describe('ashtakoota compatibility', () => {
  const A = computeMoonProfile(BIRTH);
  const B = computeMoonProfile({ ...BIRTH, date: '1992-11-02', time: '18:45' });

  it('computeMoonProfile returns valid indexes', () => {
    for (const m of [A, B]) {
      expect(m.rasiIndex).toBeGreaterThanOrEqual(0);
      expect(m.rasiIndex).toBeLessThanOrEqual(11);
      expect(m.nakIndex).toBeGreaterThanOrEqual(0);
      expect(m.nakIndex).toBeLessThanOrEqual(26);
    }
  });

  it('total is the sum of kootas and within 0..36', () => {
    const r = computeKootas(A, B);
    const sum = r.kootas.reduce((s, k) => s + k.score, 0);
    expect(r.total).toBe(sum);
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(36);
    expect(r.kootas.map(k => k.max)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('identical moons score the self-match pattern (nadi dosha, full bhakoot)', () => {
    const r = computeKootas(A, A);
    const byName = Object.fromEntries(r.kootas.map(k => [k.name, k]));
    expect(byName.Nadi.score).toBe(0);       // same nadi = dosha
    expect(byName.Bhakoot.score).toBe(7);    // 1/1 position is fine
    expect(byName.Yoni.score).toBe(4);       // same animal
    expect(byName.Gana.score).toBe(6);       // same gana
    expect(byName['Graha Maitri'].score).toBe(5); // same lord
  });

  it('every koota score never exceeds its maximum', () => {
    const r = computeKootas(A, B);
    for (const k of r.kootas) {
      expect(k.score).toBeGreaterThanOrEqual(0);
      expect(k.score).toBeLessThanOrEqual(k.max);
    }
  });
});
