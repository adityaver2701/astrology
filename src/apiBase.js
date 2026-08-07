// ── API origin resolution (web vs. native Android) ────────────────────────
// On the web the app is served by the same Cloudflare Worker that hosts the
// `/api/*` routes, so relative URLs just work.
//
// Inside the Capacitor Android WebView the bundled `dist/` is served from a
// LOCAL asset server at `https://localhost`. A relative fetch('/api/interpret')
// would therefore hit that local server and 404 — the real Worker is never
// contacted. So on native we must call the deployed Worker by absolute URL.
//
// Override at build time with VITE_API_ORIGIN (useful for pointing a debug APK
// at a `wrangler dev` tunnel).

const PROD_ORIGIN = 'https://astrology.penetacle.workers.dev';

/** True when running inside the Capacitor native shell (Android). */
export function isNative() {
  try {
    return Boolean(globalThis.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/**
 * Origin that serves the `/api/*` routes.
 * '' on web (relative, same-origin) and an absolute URL on native.
 * @returns {string}
 */
export function apiOrigin() {
  if (!isNative()) return '';
  const override = import.meta.env.VITE_API_ORIGIN;
  return (override || PROD_ORIGIN).replace(/\/+$/, '');
}

/**
 * Build a URL for an API path.
 * @param {string} path e.g. '/api/interpret'
 * @returns {string}
 */
export function apiUrl(path) {
  return `${apiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Origin to use when generating links meant for OTHER people (share URLs).
 *
 * On the web this is wherever the app happens to be served from, so preview
 * deploys share their own URL. On native, `window.location.origin` is the
 * WebView's private `https://localhost` — a link nobody else could open — so
 * shared charts must be stamped with the public site instead.
 * @returns {string}
 */
export function shareOrigin() {
  if (isNative()) return (import.meta.env.VITE_API_ORIGIN || PROD_ORIGIN).replace(/\/+$/, '');
  return window.location.origin;
}
