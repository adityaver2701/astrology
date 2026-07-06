import { describe, it, expect } from 'vitest';
import { divisionalPosition, buildVargaChart, VARGAS } from './vargas';

const sign = (lon, dn) => divisionalPosition(lon, dn).sign;

describe('divisionalPosition', () => {
  it('D1 is identity sign', () => {
    expect(sign(0, 1)).toBe(0);
    expect(sign(95, 1)).toBe(3); // 95° = Cancer
  });

  it('D9 Navamsa (continuous)', () => {
    expect(sign(0, 9)).toBe(0);    // Aries 1st navamsa = Aries
    expect(sign(28, 9)).toBe(8);   // Aries 9th navamsa = Sagittarius
    expect(sign(30, 9)).toBe(9);   // Taurus 1st navamsa = Capricorn (fixed → 9th)
  });

  it('D2 Hora only yields Cancer(3) or Leo(4)', () => {
    expect(sign(5, 2)).toBe(4);    // Aries (odd) first half → Leo
    expect(sign(20, 2)).toBe(3);   // Aries second half → Cancer
    expect(sign(35, 2)).toBe(3);   // Taurus (even) first half → Cancer
    expect(sign(50, 2)).toBe(4);   // Taurus second half → Leo
    for (let l = 0; l < 360; l += 7) expect([3, 4]).toContain(sign(l, 2));
  });

  it('D3 Drekkana — self, 5th, 9th', () => {
    expect(sign(5, 3)).toBe(0);    // Aries 0-10 → Aries
    expect(sign(15, 3)).toBe(4);   // Aries 10-20 → Leo
    expect(sign(25, 3)).toBe(8);   // Aries 20-30 → Sagittarius
  });

  it('D10 Dasamsa — odd from sign, even from 9th', () => {
    expect(sign(0, 10)).toBe(0);   // Aries part0 → Aries
    expect(sign(31, 10)).toBe(9);  // Taurus(even) part0 → 9th = Capricorn
  });

  it('D30 Trimsamsa unequal parts', () => {
    expect(sign(3, 30)).toBe(0);   // Aries(odd) <5 → Mars/Aries
    expect(sign(7, 30)).toBe(10);  // 5-10 → Saturn/Aquarius
    expect(sign(33, 30)).toBe(1);  // Taurus(even) <5 → Venus/Taurus
  });
});

describe('buildVargaChart', () => {
  it('returns planets keyed like natal + a lagna sign', () => {
    const natal = { sun: { id: 'sun', longitude: 250, signIndex: 8, degree: 10, retrograde: false } };
    const c = buildVargaChart(natal, 95 /* Cancer asc */, 9);
    expect(c.planets.sun).toBeDefined();
    expect(c.planets.sun.signIndex).toBeGreaterThanOrEqual(0);
    expect(c.planets.sun.signIndex).toBeLessThan(12);
    expect(c.lagnaSign).toBeGreaterThanOrEqual(0);
  });
  it('exposes the six requested vargas plus D1', () => {
    expect(VARGAS.map(v => v.id)).toEqual(['D1','D2','D3','D4','D9','D10','D30']);
  });
});
