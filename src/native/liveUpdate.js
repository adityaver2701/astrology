// ── Over-the-air (live) updates ───────────────────────────────────────────
// Keeps the Android app in step with the website WITHOUT a Play Store release.
//
// How it works:
//   1. `npm run build:ota` builds the site, then zips `dist/` into
//      `dist/ota/bundle-<version>.zip` and writes `dist/ota/manifest.json`.
//   2. Both files deploy with the site, so they're served by the same
//      Cloudflare Worker at https://astrology.penetacle.workers.dev/ota/…
//   3. On every app foreground the app fetches the manifest. If the published
//      version differs from the bundle it's running, it downloads the zip and
//      schedules it for the NEXT app start (via `next()`, not `set()`), so the
//      swap never yanks the UI out from under someone mid-reading.
//
// Native code changes (new plugins, permissions, Android SDK bumps) still need
// a real APK/AAB release — OTA only ships HTML/CSS/JS.
//
// Everything here fails soft: any error leaves the app on its current bundle.

import { apiOrigin, isNative } from '../apiBase.js';

const MANIFEST_PATH = '/ota/manifest.json';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // don't re-check more than 4×/hour
const FETCH_TIMEOUT_MS = 10000;

let lastCheck = 0;
let notified = false;
let inFlight = null;

/**
 * Tell the updater plugin the current bundle booted successfully.
 *
 * This is mandatory: if a freshly-installed bundle never calls this, the plugin
 * assumes it crashed on launch and automatically rolls back to the previous
 * one. Called from `initNative()` before any update check.
 * @returns {Promise<void>}
 */
export async function markAppReady() {
  if (!isNative() || notified) return;
  notified = true;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    console.warn('liveUpdate: notifyAppReady failed', err);
  }
}

/**
 * Check the deployed manifest and stage a newer web bundle if there is one.
 * Throttled to once every 15 minutes; concurrent calls share one promise.
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{status: string, version?: string}>}
 */
export function checkForUpdate({ force = false } = {}) {
  if (!isNative()) return Promise.resolve({ status: 'skipped-web' });
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastCheck < CHECK_INTERVAL_MS) {
    return Promise.resolve({ status: 'throttled' });
  }
  lastCheck = Date.now();
  inFlight = run().finally(() => { inFlight = null; });
  return inFlight;
}

async function run() {
  await markAppReady();

  let CapacitorUpdater;
  try {
    ({ CapacitorUpdater } = await import('@capgo/capacitor-updater'));
  } catch (err) {
    console.warn('liveUpdate: updater plugin unavailable', err);
    return { status: 'no-plugin' };
  }

  // 1. What are we running now?
  let currentVersion = '';
  try {
    const current = await CapacitorUpdater.current();
    currentVersion = current?.bundle?.version || '';
  } catch (err) {
    console.warn('liveUpdate: could not read current bundle', err);
  }

  // 2. What has the website published?
  let manifest;
  try {
    manifest = await fetchManifest();
  } catch (err) {
    console.warn('liveUpdate: manifest fetch failed', err);
    return { status: 'manifest-unreachable' };
  }
  if (!manifest?.version || !manifest?.url) return { status: 'manifest-invalid' };

  // `builtin` is what a fresh install reports before any OTA has been applied.
  const isBuiltin = !currentVersion || currentVersion === 'builtin';
  if (!isBuiltin && currentVersion === manifest.version) {
    return { status: 'up-to-date', version: currentVersion };
  }

  // 3. Already downloaded but waiting for a restart? Don't re-download.
  try {
    const bundles = await CapacitorUpdater.list();
    const existing = bundles?.bundles?.find((b) => b.version === manifest.version);
    if (existing) {
      await CapacitorUpdater.next({ id: existing.id });
      return { status: 'pending-restart', version: manifest.version };
    }
  } catch {
    // list() is best-effort; fall through to a fresh download.
  }

  // 4. Download and stage for next launch.
  try {
    const bundle = await CapacitorUpdater.download({
      url: absoluteUrl(manifest.url),
      version: manifest.version,
      ...(manifest.checksum ? { checksum: manifest.checksum } : {}),
    });
    await CapacitorUpdater.next({ id: bundle.id });
    await pruneOldBundles(CapacitorUpdater, bundle.id);
    window.dispatchEvent(
      new CustomEvent('astro:update-ready', { detail: { version: manifest.version } })
    );
    return { status: 'pending-restart', version: manifest.version };
  } catch (err) {
    console.warn('liveUpdate: download failed', err);
    return { status: 'download-failed' };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function fetchManifest() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiOrigin()}${MANIFEST_PATH}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Manifest URLs are site-relative; resolve against the deployed origin. */
function absoluteUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${apiOrigin()}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Keep storage bounded: drop every downloaded bundle except the newest. */
async function pruneOldBundles(CapacitorUpdater, keepId) {
  try {
    const { bundles = [] } = await CapacitorUpdater.list();
    const current = await CapacitorUpdater.current();
    const currentId = current?.bundle?.id;
    for (const b of bundles) {
      if (b.id === keepId || b.id === currentId || b.version === 'builtin') continue;
      await CapacitorUpdater.delete({ id: b.id }).catch(() => {});
    }
  } catch {
    // Non-fatal — worst case we hold on to one extra bundle.
  }
}
