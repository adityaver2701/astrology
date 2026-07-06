# Astro-Transit Chart

A Vedic Jyotish (sidereal astrology) web app with its own client-side ephemeris. It computes birth charts, scans decades of transits, matches logged life events to transit signatures, and projects when similar windows recur — with optional AI readings, cloud sync, and multi-profile support.

**Stack:** React 19 + Vite SPA · Cloudflare Worker (static hosting + AI API + crons) · Supabase (auth, per-user data, private PDF storage) · Sentry.

## Features

| Tab | What it does |
| --- | --- |
| Birth Details & Trik Bhava | Natal positions, dignities, nakshatras, Vipareeta Raja Yogas, 6-8-12 house analysis, AI reading |
| Interactive Kundali | North-Indian chart with live transit overlay — drag planets to scrub time; divisional (varga) charts |
| Historical Transits | 50 years of Saturn/Jupiter/Rahu/Ketu sign ingresses |
| Life Events Matcher | Match logged events (manual or CSV import) to transit signatures; auto-scan upcoming windows |
| Degree & Nakshatra Transits | Exact-degree (±1°) and nakshatra alignment windows over natal points, 30 years ahead |
| Vimshottari Dasha | Mahadasha → Antardasha → Pratyantar timeline from the Moon nakshatra |
| Panchanga | Tithi, vara, nakshatra, yoga, karana for any date |
| Compatibility | Ashtakoota (36-guna) matching between two saved profiles |

Plus: AstroSage PDF parsing (Ashtakvarga, Shadbala, KP, Sadesati boost prediction accuracy), shareable chart links (`?chart=`), per-user cloud sync with conflict detection, weekly transit-alert emails (opt-in), admin dashboard, guided tour, light/dark themes.

## Project layout

```
src/
  astrologyEngine.js     Pure astronomy/astrology math (Keplerian planets, Meeus Moon,
                         Lahiri ayanamsha, dashas, transit scanners). No UI, fully tested.
  panchanga.js           Tithi/yoga/karana engine
  compatibility.js       Ashtakoota guna-milan engine
  vargas.js              Divisional chart math
  pdfParser.js           AstroSage PDF extraction (lazy-loaded)
  cloudSync.js           Supabase auth + per-user data row + storage (conflict-aware saves)
  App.jsx                State container & layout; tabs are lazy-loaded
  tabs/                  One component per tab (code-split chunks)
  components/            KundaliChart SVG, modals
  utils/                 csv, timezone (IANA→offset), share links
worker/
  index.js               SPA serving, /api/interpret (auth + rate limit + cache + streaming),
                         /api/health, crons
  alerts.js              Weekly transit-alert email digest (Resend)
e2e/                     Playwright smoke tests
```

## Development

```bash
npm install
npm run dev          # vite dev server (AI endpoint needs the deployed worker)
npm test             # vitest — engine + panchanga + compatibility + predictive scanners
npm run lint
npm run build
npm run test:e2e     # Playwright (first time: npx playwright install chromium)
```

**Windows note:** always run `npm install` on Windows, never inside a Linux container — platform-specific binaries end up in `node_modules` otherwise.

## Deployment

Cloudflare Pages/Workers — see `HOSTING.md`. One-time Supabase setup: `SUPABASE_AUTH_SETUP.md` (auth, RLS, storage bucket), `CLOUD_SYNC_SETUP.md`.

Optional worker extras (see comments in `wrangler.jsonc`):

- **Durable rate limiting** — create a `RATE_LIMIT_KV` namespace (otherwise a per-isolate fallback is used).
- **Transit-alert emails** — set `RESEND_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` secrets and an `ALERT_FROM` var; users opt in from the account menu.

## Disclaimer

Astrology is offered for reflection and entertainment; nothing here is medical, legal, or financial advice.
