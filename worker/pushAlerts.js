// ── Daily push alerts (cron, 13:30 UTC = 19:00 IST) ───────────────────────
// For every user with birth details, work out what happens TOMORROW (in the
// user's own timezone) and push a heads-up through Azure Notification Hubs to
// the devices tagged `user:<id>` (see ./push.js for registration):
//
//   1. transit   Rahu, Ketu, Saturn or Jupiter comes within ORB_DEG (1°) of
//                any natal D1 planet — alert on the day it ENTERS the orb.
//   2. dasha     a Vimshottari Mahadasha or Antardasha starts tomorrow.
//   3. lifeEvent the slow-planet pattern of one of the user's logged life
//                events starts repeating tomorrow (score crosses
//                LIFE_EVENT_MATCH_THRESHOLD, the same scorer the Predictions
//                tab uses).
//
// "Enters tomorrow" = true at tomorrow's local noon and false at today's, so
// each event alerts once without storing any state. A missed cron run means a
// missed alert, which is acceptable for heads-ups.
//
// Config: secret NH_SEND_CONNECTION_STRING (hub policy with Send right only),
// var NH_HUB_NAME, secret SUPABASE_SERVICE_ROLE_KEY, var SUPABASE_URL.

import {
  getJulianDate,
  calculatePlanets,
  calculateAscendantLongitude,
  calculateVimshottariDasha,
  matchLifeEventTransits,
  scoreTransitMatch,
  LIFE_EVENT_MATCH_THRESHOLD,
} from '../src/astrologyEngine.js';
import { parseConnectionString, createSasToken, supabaseUser } from './push.js';

export const ORB_DEG = 1;
export const TRANSIT_PLANETS = ['rahu', 'ketu', 'saturn', 'jupiter'];
const NATAL_PLANETS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
const MAX_ALERTS_PER_USER = 5;
const MAX_LIFE_EVENTS = 10;
const SEND_API_VERSION = '2023-10-01-preview';
const DAY_MS = 86400000;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtPos = (p) => `${p.degree.toFixed(1)}° ${p.signName}`;

/** Local calendar day helpers for a timezone given in hours (e.g. 5.5). */
export function localDayInfo(now, tzHours = 0) {
  const tzMs = (Number(tzHours) || 0) * 3600000;
  const local = new Date(now.getTime() + tzMs);
  const todayKey = local.toISOString().slice(0, 10);
  const todayNoonUtc = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12) - tzMs);
  const tomorrowNoonUtc = new Date(todayNoonUtc.getTime() + DAY_MS);
  const tomorrowKey = new Date(tomorrowNoonUtc.getTime() + tzMs).toISOString().slice(0, 10);
  return { todayKey, tomorrowKey, todayNoonUtc, tomorrowNoonUtc, tzMs };
}

export function natalFrom(bd) {
  const birthLocal = new Date(`${bd.date}T${bd.time || '12:00'}Z`);
  const birthUtc = new Date(birthLocal.getTime() - (Number(bd.timezone) || 0) * 3600000);
  const jd = getJulianDate(birthUtc);
  const { planets } = calculatePlanets(jd);
  const lagnaSign = Math.floor(calculateAscendantLongitude(jd, bd.longitude, bd.latitude) / 30);
  return { jd, planets, lagnaSign };
}

function sep(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Map "transit|natal" -> {transit, natal, diff} for pairs within the orb on `date`. */
export function transitHits(date, natalPlanets, orb = ORB_DEG) {
  const tp = calculatePlanets(getJulianDate(date)).planets;
  const hits = new Map();
  for (const t of TRANSIT_PLANETS) {
    for (const n of NATAL_PLANETS) {
      const diff = sep(tp[t].longitude, natalPlanets[n].longitude);
      if (diff <= orb) hits.set(`${t}|${n}`, { transit: tp[t], natal: natalPlanets[n], diff });
    }
  }
  return hits;
}

/**
 * Everything that begins tomorrow for this user.
 * @param {object} bd birthDetails {date,time,timezone,latitude,longitude,name}
 * @param {Array} lifeEvents [{id,name,startDate,endDate}]
 * @param {Date} now
 * @returns {Array<{type:string,key:string,title:string,body:string}>}
 */
export function computeDailyAlerts(bd, lifeEvents = [], now = new Date()) {
  if (!bd?.date) return [];
  const natal = natalFrom(bd);
  const day = localDayInfo(now, bd.timezone);
  const alerts = [];

  // 1. Dasha / Antardasha starts tomorrow
  const dashas = calculateVimshottariDasha(natal.jd, natal.planets.moon.longitude);
  const dayKey = (d) => new Date(d.getTime() + day.tzMs).toISOString().slice(0, 10);
  for (const md of dashas) {
    if (!md.isPartial && dayKey(md.startDate) === day.tomorrowKey) {
      alerts.push({
        type: 'dasha', key: `md:${md.lord}:${day.tomorrowKey}`,
        title: `${cap(md.lord)} Mahadasha begins tomorrow`,
        body: `Your ${md.years.toFixed(0)}-year ${cap(md.lord)} Mahadasha (with ${cap(md.lord)} Antardasha) starts ${day.tomorrowKey}.`,
      });
      continue; // its first Antardasha starts the same day — one alert is enough
    }
    for (const ad of md.antardashas) {
      if (dayKey(ad.startDate) === day.tomorrowKey && ad.startDate.getTime() !== md.startDate.getTime()) {
        alerts.push({
          type: 'dasha', key: `ad:${md.lord}-${ad.lord}:${day.tomorrowKey}`,
          title: `${cap(ad.lord)} Antardasha begins tomorrow`,
          body: `${cap(md.lord)}–${cap(ad.lord)} period starts ${day.tomorrowKey} and runs until ${dayKey(ad.endDate)}.`,
        });
      }
    }
  }

  // 2. Slow-planet transit enters 1° of a natal planet tomorrow
  const today = transitHits(day.todayNoonUtc, natal.planets);
  const tomorrow = transitHits(day.tomorrowNoonUtc, natal.planets);
  for (const [key, h] of tomorrow) {
    if (today.has(key)) continue;
    alerts.push({
      type: 'transit', key: `tr:${key}:${day.tomorrowKey}`,
      title: `${cap(h.transit.id)} meets your natal ${cap(h.natal.id)} tomorrow`,
      body: `Transiting ${cap(h.transit.id)} comes within ${ORB_DEG}° of your natal ${cap(h.natal.id)} (${fmtPos(h.natal)}) on ${day.tomorrowKey}.`,
    });
  }

  // 3. A past life event's transit pattern starts repeating tomorrow
  for (const ev of (Array.isArray(lifeEvents) ? lifeEvents : []).slice(0, MAX_LIFE_EVENTS)) {
    if (!ev?.startDate) continue;
    try {
      const sig = matchLifeEventTransits(bd, ev.startDate, ev.endDate || ev.startDate);
      const s0 = scoreTransitMatch(day.todayNoonUtc, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets).score;
      const s1 = scoreTransitMatch(day.tomorrowNoonUtc, sig.eventSignature, sig.natalLagnaSign, sig.natalPlanets).score;
      if (s1 >= LIFE_EVENT_MATCH_THRESHOLD && s0 < LIFE_EVENT_MATCH_THRESHOLD) {
        const name = String(ev.name || 'a past life event').slice(0, 60);
        alerts.push({
          type: 'lifeEvent', key: `le:${ev.id ?? name}:${day.tomorrowKey}`,
          title: 'A familiar pattern returns tomorrow',
          body: `From ${day.tomorrowKey}, Saturn/Jupiter/Rahu/Ketu start repeating the pattern of “${name}” (${Math.round(s1)}% match).`,
        });
      }
    } catch { /* bad event dates — skip */ }
  }

  const order = { dasha: 0, transit: 1, lifeEvent: 2 };
  return alerts.sort((a, b) => order[a.type] - order[b.type]).slice(0, MAX_ALERTS_PER_USER);
}

/** Send one FCM v1 notification to every device tagged user:<id>. */
export async function sendPushToUser(env, userId, alert) {
  const nh = parseConnectionString(env.NH_SEND_CONNECTION_STRING);
  if (!nh || !env.NH_HUB_NAME) throw new Error('NH_SEND_CONNECTION_STRING / NH_HUB_NAME not configured');
  const hubUri = `${nh.endpoint}/${env.NH_HUB_NAME}`;
  const res = await fetch(`${hubUri}/messages/?api-version=${SEND_API_VERSION}`, {
    method: 'POST',
    headers: {
      Authorization: await createSasToken(hubUri, nh.keyName, nh.key),
      'Content-Type': 'application/json;charset=utf-8',
      'ServiceBusNotification-Format': 'fcmv1',
      'ServiceBusNotification-Tags': `user:${userId}`,
    },
    body: JSON.stringify({
      message: {
        notification: { title: alert.title, body: alert.body },
        data: { type: alert.type, key: alert.key },
      },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`hub send ${res.status} ${detail}`);
  }
  return res.status;
}

/** Cron entry point. */
export async function runPushAlerts(env, now = new Date()) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL || !env.NH_SEND_CONNECTION_STRING || !env.NH_HUB_NAME) {
    console.log('push-alerts: not configured, skipping');
    return { users: 0, sent: 0 };
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/astro_sync?select=user_id,data`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) { console.error('push-alerts: could not list rows', res.status); return { users: 0, sent: 0 }; }
  const rows = await res.json();
  let users = 0, sent = 0;
  for (const row of rows) {
    const d = row.data;
    if (!d?.birthDetails?.date || d.pushAlertsEnabled === false) continue;
    users++;
    try {
      for (const alert of computeDailyAlerts(d.birthDetails, d.lifeEvents, now)) {
        await sendPushToUser(env, row.user_id, alert);
        sent++;
      }
    } catch (e) {
      console.error(`push-alerts: user ${row.user_id} failed`, e && e.message);
    }
  }
  console.log(`push-alerts: ${users} users checked, ${sent} pushes sent`);
  return { users, sent };
}

/**
 * POST /api/push/preview  { date?: "YYYY-MM-DD", send?: boolean }
 * Signed-in users see the alerts the cron would send them on the evening of
 * `date` (default: today). `send: true` actually pushes them to the caller's
 * own devices — admins (ADMIN_EMAILS) only. Handy for manual and E2E testing.
 */
export async function handlePushPreview(request, env, json) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let user = null;
  try { user = await supabaseUser(request, env); } catch { /* fallthrough */ }
  if (!user) return json({ error: 'Please sign in.' }, 401);
  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  let now = new Date();
  if (body.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) return json({ error: 'date must be YYYY-MM-DD' }, 400);
    now = new Date(`${body.date}T13:30:00Z`); // cron time
  }

  // Read the caller's own bundle with their token (RLS limits it to them).
  const token = (request.headers.get('Authorization') || '').slice(7);
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/astro_sync?select=data&user_id=eq.${encodeURIComponent(user.id)}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return json({ error: 'Could not load your saved data.' }, 502);
  const d = (await r.json())?.[0]?.data;
  if (!d?.birthDetails?.date) return json({ alerts: [], note: 'No birth details saved yet.' });

  const alerts = computeDailyAlerts(d.birthDetails, d.lifeEvents, now);
  if (!body.send) return json({ date: localDayInfo(now, d.birthDetails.timezone).todayKey, alerts });

  const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  if (!admins.includes(user.email.toLowerCase())) return json({ error: 'Only admins can send test alerts.' }, 403);
  const results = [];
  for (const a of alerts) {
    try { results.push({ key: a.key, status: await sendPushToUser(env, user.id, a) }); }
    catch (e) { results.push({ key: a.key, error: String(e.message).slice(0, 200) }); }
  }
  return json({ alerts, results });
}
