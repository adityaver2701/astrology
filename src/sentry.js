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
    // Never let the SDK attach IP address, cookies, or request headers/bodies.
    sendDefaultPii: false,
    // Belt-and-suspenders scrub: an error string or breadcrumb URL could still
    // carry an email the user typed, or a Supabase query embedding it. Redact
    // emails and strip query strings before anything leaves the browser.
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    // Default integrations already capture unhandled errors and promise
    // rejections — no extra wiring needed.
  });
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const redact = (s) =>
  typeof s === 'string' ? s.replace(EMAIL_RE, '[REDACTED_EMAIL]').replace(/([?&](access_token|token|apikey|email)=)[^&\s]*/gi, '$1[REDACTED]') : s;

function scrubEvent(event) {
  if (event.message) event.message = redact(event.message);
  for (const ex of event.exception?.values || []) ex.value = redact(ex.value);
  if (event.request) {
    // Drop anything that could carry PII wholesale; keep only a scrubbed URL.
    event.request = event.request.url ? { url: redact(event.request.url.split('?')[0]) } : undefined;
  }
  return event;
}

function scrubBreadcrumb(crumb) {
  if (crumb.message) crumb.message = redact(crumb.message);
  if (crumb.data?.url) crumb.data.url = redact(String(crumb.data.url).split('?')[0]);
  return crumb;
}
