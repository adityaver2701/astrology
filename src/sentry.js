// ── Sentry error monitoring ───────────────────────────────────────────────
// No-op unless VITE_SENTRY_DSN is set, so local dev and unconfigured builds
// stay silent. Free "Developer" tier: 5,000 errors/month, 30-day retention.
//
// Setup:
//   1. https://sentry.io → sign up (free) → create a project, platform "React".
//   2. Project Settings → Client Keys (DSN) → copy the DSN.
//   3. Add to .env.local (same file as your Supabase keys):
//        VITE_SENTRY_DSN="https://<key>@<org>.ingest.sentry.io/<project>"
//   4. Rebuild & deploy. Errors (including the "Failed to fetch" class of
//      network failures surfaced as unhandled rejections) now report to Sentry.
import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // disabled until a DSN is provided

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Sample 10% of transactions for performance tracing; raise if you want more.
    tracesSampleRate: 0.1,
    // Default integrations already capture unhandled errors and promise
    // rejections — no extra wiring needed.
  });
}
