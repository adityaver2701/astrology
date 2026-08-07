// ── Weekly transit-alert emails (cron) ─────────────────────────────────────
// For every user who opted in ("Email transit alerts" in the user menu), scan
// the next 45 days for exact-degree / nakshatra transit triggers over their
// natal chart and email a digest via Resend.
//
// Required configuration (all three, otherwise this is a silent no-op):
//   wrangler secret put RESEND_API_KEY              — https://resend.com (free tier)
//   wrangler secret put SUPABASE_SERVICE_ROLE_KEY   — Supabase → Settings → API
//   ALERT_FROM var in wrangler.jsonc                — e.g. "Astro Alerts <alerts@yourdomain.com>"
//
// The astrology engine is pure math, so the worker bundles it directly.

import {
  getJulianDate,
  calculatePlanets,
  calculateAscendantLongitude,
  analyzePeakDateAlignments,
} from '../src/astrologyEngine.js';

const SCAN_DAYS = 45;
const MAX_ALERTS_PER_EMAIL = 6;

export async function sendTransitAlerts(env) {
  if (!env.RESEND_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL || !env.ALERT_FROM) {
    console.log('transit-alerts: not configured, skipping');
    return;
  }

  // Service-role read of every user's bundle (bypasses RLS — server only).
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/astro_sync?select=user_id,data`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    console.error('transit-alerts: could not list rows', res.status);
    return;
  }
  const rows = await res.json();

  for (const row of rows) {
    const d = row.data;
    if (!d?.alertsEnabled || !d?.ownerEmail || !d?.birthDetails?.date) continue;
    try {
      const windows = computeUpcomingTriggers(d.birthDetails);
      if (windows.length === 0) continue;
      await sendEmail(env, d.ownerEmail, d.birthDetails.name || 'there', windows);
    } catch (e) {
      console.error(`transit-alerts: user ${row.user_id} failed`, e && e.message);
    }
  }
}

function computeUpcomingTriggers(bd) {
  const birthLocal = new Date(`${bd.date}T${bd.time || '12:00'}Z`);
  const birthUtc = new Date(birthLocal.getTime() - (bd.timezone || 0) * 3600000);
  const jd = getJulianDate(birthUtc);
  const { planets } = calculatePlanets(jd);
  const lagnaLon = calculateAscendantLongitude(jd, bd.longitude, bd.latitude);
  const lagnaSign = Math.floor(lagnaLon / 30);

  // Daily scan; group consecutive hit-days on the same planet pair into one window.
  const windows = [];
  const openKeys = new Map(); // key -> window index
  const today = new Date();
  for (let i = 0; i < SCAN_DAYS; i++) {
    const day = new Date(today.getTime() + i * 86400000);
    let hits = [];
    try { hits = analyzePeakDateAlignments(day, planets, lagnaSign) || []; } catch { /* skip day */ }
    const seen = new Set();
    for (const h of hits) {
      const key = `${h.transitPlanet}|${h.natalPlanet}|${h.matchType}`;
      seen.add(key);
      if (openKeys.has(key)) {
        windows[openKeys.get(key)].end = day;
      } else {
        openKeys.set(key, windows.length);
        windows.push({ ...h, start: day, end: day });
      }
    }
    // close windows that didn't recur today
    for (const [key, idx] of [...openKeys]) {
      if (!seen.has(key) && windows[idx].end < day) openKeys.delete(key);
    }
  }

  return windows
    .sort((a, b) => (b.severity === 'high') - (a.severity === 'high') || a.start - b.start)
    .slice(0, MAX_ALERTS_PER_EMAIL);
}

async function sendEmail(env, to, name, windows) {
  const fmt = (dt) => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const items = windows.map(w => `
    <li style="margin-bottom:10px">
      <strong>${w.transitPlanet}</strong> crosses your natal <strong>${w.natalPlanet}</strong>
      (${w.matchType}${w.severity === 'high' ? ' — <em>life-changing conjunction</em>' : ''})<br/>
      <span style="color:#666">${fmt(w.start)}${w.end > w.start ? ` – ${fmt(w.end)}` : ''} ·
      transit ${w.transitHouse}H ${w.transitSign} at ${w.transitDegree?.toFixed?.(1)}°</span>
    </li>`).join('');

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
      <h2 style="color:#92400e">✦ Upcoming Transit Windows</h2>
      <p>Hi ${escapeHtml(name)}, these exact-degree transit triggers over your birth chart
      open in the next ${SCAN_DAYS} days:</p>
      <ul>${items}</ul>
      <p style="color:#666;font-size:12px">You get this weekly digest because transit alerts are
      enabled on your Astro-Transit account. Turn them off any time from the user menu.
      Astrology is offered for reflection, not as advice.</p>
    </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.ALERT_FROM,
      to: [to],
      subject: `✦ ${windows.length} transit window${windows.length > 1 ? 's' : ''} approaching`,
      html,
    }),
  });
  // Log the status only. Resend's error body echoes the recipient address, so
  // dumping it would spill a user email into the Worker logs.
  if (!r.ok) console.error('transit-alerts: resend failed', r.status);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
