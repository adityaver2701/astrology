// ── Shareable chart links ──────────────────────────────────────────────────
// Serializes birth details into a compact base64url `?chart=` URL parameter so
// a chart can be shared read-only. No server round-trip; the recipient's
// browser recomputes everything from the encoded birth data.

import { shareOrigin } from '../apiBase.js';

const FIELDS = ['name', 'date', 'time', 'placeName', 'latitude', 'longitude', 'timezone', 'tzId'];

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64) {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Build a shareable URL for the given birth details.
 * Defaults to the PUBLIC site origin — inside the Android app
 * `window.location.origin` is the WebView's private `https://localhost`, which
 * would produce a link nobody else could open.
 */
export function buildShareUrl(birthDetails, origin = shareOrigin()) {
  const compact = {};
  for (const f of FIELDS) {
    if (birthDetails[f] !== undefined && birthDetails[f] !== null && birthDetails[f] !== '') {
      compact[f] = birthDetails[f];
    }
  }
  return `${origin}/?chart=${toBase64Url(JSON.stringify(compact))}`;
}

/**
 * Parse a shared chart out of the current URL, if present.
 * @returns {object|null} birthDetails or null
 */
export function parseSharedChart(search = window.location.search) {
  try {
    const param = new URLSearchParams(search).get('chart');
    if (!param) return null;
    const d = JSON.parse(fromBase64Url(param));
    // Minimal validation — must look like birth details.
    if (!d || typeof d !== 'object') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return null;
    const lat = Number(d.latitude), lon = Number(d.longitude), tz = Number(d.timezone);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      name: String(d.name || 'Shared Chart').slice(0, 80),
      date: d.date,
      time: /^\d{2}:\d{2}$/.test(d.time || '') ? d.time : '12:00',
      placeName: String(d.placeName || '').slice(0, 160),
      latitude: lat,
      longitude: lon,
      timezone: Number.isFinite(tz) ? tz : 0,
      ...(d.tzId ? { tzId: String(d.tzId).slice(0, 60) } : {}),
    };
  } catch {
    return null;
  }
}

/** Remove the ?chart= param from the address bar without reloading. */
export function clearSharedChartParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete('chart');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}
