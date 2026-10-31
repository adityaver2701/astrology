// Property tests for the daily push alerts: rather than hard-coding dates,
// each test finds a qualifying day with the engine itself and checks that the
// alert fires on the day BEFORE (and not on other days).
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeDailyAlerts, localDayInfo, natalFrom, transitHits, sendPushToUser, ORB_DEG,
} from './pushAlerts.js';
import { calculateVimshottariDasha, matchLifeEventTransits, scoreTransitMatch } from '../src/astrologyEngine.js';

const BIRTH = {
  name: 'Test Native', date: '1990-05-15', time: '10:30',
  latitude: 28.6139, longitude: 77.209, timezone: 5.5,
};
const DAY = 86400000;
// 19:00 IST on a given local date — when the cron runs.
const eveningIST = (ymd) => new Date(`${ymd}T13:30:00Z`);
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

describe('localDayInfo', () => {
  it('uses the user timezone for today/tomorrow', () => {
    // 20:00 UTC on 31 Oct is already 1 Nov 01:30 in IST
    const d = localDayInfo(new Date('2026-10-31T20:00:00Z'), 5.5);
    expect(d.todayKey).toBe('2026-11-01');
    expect(d.tomorrowKey).toBe('2026-11-02');
    expect(d.todayNoonUtc.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });
});

describe('dasha alerts', () => {
  const natal = natalFrom(BIRTH);
  const dashas = calculateVimshottariDasha(natal.jd, natal.planets.moon.longitude);
  const istDay = (d) => new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
  const nowMs = Date.now();

  it('fires the evening before an Antardasha starts', () => {
    const ad = dashas.flatMap((m) => m.antardashas.filter((a) => a.startDate.getTime() !== m.startDate.getTime()))
      .find((a) => a.startDate.getTime() > nowMs);
    const startDay = istDay(ad.startDate);
    const alerts = computeDailyAlerts(BIRTH, [], eveningIST(addDays(startDay, -1)));
    expect(alerts.some((a) => a.type === 'dasha' && a.title.toLowerCase().includes(ad.lord))).toBe(true);
    // ...and not two days before
    const early = computeDailyAlerts(BIRTH, [], eveningIST(addDays(startDay, -2)));
    expect(early.some((a) => a.type === 'dasha')).toBe(false);
  });

  it('sends a single Mahadasha alert (not also an Antardasha one) when a Mahadasha starts', () => {
    const md = dashas.find((m) => !m.isPartial && m.startDate.getTime() > nowMs);
    const alerts = computeDailyAlerts(BIRTH, [], eveningIST(addDays(istDay(md.startDate), -1)));
    const dashaAlerts = alerts.filter((a) => a.type === 'dasha');
    expect(dashaAlerts).toHaveLength(1);
    expect(dashaAlerts[0].title).toMatch(/Mahadasha begins tomorrow/);
  });
});

describe('transit alerts', () => {
  it('fires once, the evening before a slow planet enters 1° of a natal planet', () => {
    const natal = natalFrom(BIRTH);
    // Find the first day (from a fixed date) where a new pair enters the orb.
    let found = null;
    for (let i = 0; i < 400 && !found; i++) {
      const ymd = addDays('2026-11-01', i);
      const a = transitHits(localDayInfo(eveningIST(ymd), 5.5).todayNoonUtc, natal.planets);
      const b = transitHits(localDayInfo(eveningIST(ymd), 5.5).tomorrowNoonUtc, natal.planets);
      for (const [k, h] of b) if (!a.has(k)) { found = { ymd, k, h }; break; }
    }
    expect(found).not.toBeNull();
    expect(found.h.diff).toBeLessThanOrEqual(ORB_DEG);

    const alerts = computeDailyAlerts(BIRTH, [], eveningIST(found.ymd));
    const t = alerts.find((x) => x.type === 'transit' && x.key.startsWith(`tr:${found.k}:`));
    expect(t).toBeTruthy();
    // The next evening the pair is already inside the orb, so no repeat alert.
    const next = computeDailyAlerts(BIRTH, [], eveningIST(addDays(found.ymd, 1)));
    expect(next.some((x) => x.key.startsWith(`tr:${found.k}:`))).toBe(false);
  });
});

describe('life-event alerts', () => {
  it('fires when the event pattern score crosses the threshold tomorrow', () => {
    const event = { id: 7, name: 'Career change', startDate: '2017-06-01', endDate: '2017-07-31' };
    const sig = matchLifeEventTransits(BIRTH, event.startDate, event.endDate);
    const score = (ymd) => {
      const d = localDayInfo(eveningIST(ymd), 5.5);
      return [d.todayNoonUtc, d.tomorrowNoonUtc].map((t) =>
        scoreTransitMatch(t, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets).score);
    };
    let ymd = null;
    for (let i = 0; i < 365 * 20 && !ymd; i++) { // this sample pattern next returns in 2043
      const day = addDays('2026-11-01', i);
      const [s0, s1] = score(day);
      if (s0 < 60 && s1 >= 60) ymd = day;
    }
    expect(ymd).not.toBeNull();
    const alerts = computeDailyAlerts(BIRTH, [event], eveningIST(ymd));
    const le = alerts.find((a) => a.type === 'lifeEvent');
    expect(le?.body).toContain('Career change');
  });

  it('ignores events without dates', () => {
    expect(() => computeDailyAlerts(BIRTH, [{ name: 'x' }, null], new Date())).not.toThrow();
  });
});

describe('sendPushToUser', () => {
  afterEach(() => vi.restoreAllMocks());
  it('posts an FCM v1 payload tagged with the user id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 201 }));
    const env = {
      NH_HUB_NAME: 'hub-x',
      NH_SEND_CONNECTION_STRING: 'Endpoint=sb://astro-test.servicebus.windows.net/;SharedAccessKeyName=WorkerSend;SharedAccessKey=dummy=',
    };
    await sendPushToUser(env, 'abc-123', { type: 'dasha', key: 'k', title: 'T', body: 'B' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/astro-test\.servicebus\.windows\.net\/hub-x\/messages\/\?api-version=/);
    expect(init.headers['ServiceBusNotification-Format']).toBe('fcmv1');
    expect(init.headers['ServiceBusNotification-Tags']).toBe('user:abc-123');
    expect(JSON.parse(init.body).message.notification).toEqual({ title: 'T', body: 'B' });
  });
});
