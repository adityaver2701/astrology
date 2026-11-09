import { describe, it, expect } from 'vitest';
import { calculatePlanets, calculateVimshottariDasha, calculateAscendantLongitude, getJulianDate } from './astrologyEngine.js';
import { buildVargaChart } from './vargas.js';
import { buildChartPrompt } from './promptBuilder.js';

describe('buildChartPrompt', () => {
  it('includes dasha, D1, D9, D10 and transits', () => {
    const jd = getJulianDate(new Date('1990-05-15T06:30:00Z'));
    const r = calculatePlanets(jd);
    const lon = calculateAscendantLongitude(jd, 77.2, 28.6);
    const natalChart = { lagnaSign: Math.floor(lon / 30), lagnaDegree: lon % 30, planets: r.planets };
    const dashaData = calculateVimshottariDasha(jd, r.planets.moon.longitude);
    const vargaCharts = [9, 10].map((n) => ({ id: `D${n}`, ...buildVargaChart(r.planets, lon, n) }));
    const now = new Date('2026-11-09T12:00:00Z');
    const transit = calculatePlanets(getJulianDate(now));
    const out = buildChartPrompt({
      birthDetails: { name: 'T', date: '1990-05-15', time: '12:00', placeName: 'Delhi' },
      natalChart, dashaData, vargaCharts, transitPlanets: transit.planets, now,
    });
    expect(out).toMatch(/Mahadasha: \w+ — .* to .*\(ends in/);
    expect(out).toMatch(/Antardasha: \w+/);
    expect(out).toContain('## D1');
    expect(out).toContain('## D9');
    expect(out).toContain('## D10');
    expect(out).toContain('## CURRENT TRANSITS');
    expect(out.match(/- Saturn:/g)).toHaveLength(4); // D1, D9, D10, transit
    expect(out).toMatch(/- Rahu: .*°\d\d', House \d+, .*pada \d, (Retrograde|Direct)/);
  });
});
