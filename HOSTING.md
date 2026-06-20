# Hosting (free, accessible from anywhere)

This app is a static Vite site plus a Supabase backend. The build output
(`dist/`) can be served free by Cloudflare Pages and used from any device.
Your saved profiles / predictions / life events follow you across devices via
Cloud Sync (Supabase).

## Deploy on Cloudflare Pages (recommended, free)

There are two ways. The Git way is best because every future change
auto-deploys.

### Option A — Connect to GitHub (auto-deploy on every push)

> Requires the repo to be on GitHub first (see project step 6).

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
2. Pick this repository.
3. Build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** (so Cloud Sync works automatically on every
   device — the anon key is a public client key, safe to expose):
   - `VITE_SUPABASE_URL` = `https://chpexdmbwbtdyqzfvmow.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = *(your anon public key from `.env.local`)*
5. **Save and Deploy.** You get a public URL like
   `https://astrology-xxx.pages.dev` — open it on any phone or computer.

### Option B — Direct upload via Wrangler CLI (no GitHub needed)

```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name astrology
```

Wrangler opens a browser to log in to your Cloudflare account the first time.
With this method, set the same two environment variables in
**Pages → Settings → Environment variables**, or just enter the Supabase URL +
anon key once per device in the app's **☁ Cloud Sync** settings.

## Notes

- **Base path:** the app builds at root (`/`), which is what Cloudflare Pages
  serves, so no extra config is needed. `public/_redirects` routes all paths to
  `index.html` (standard single-page-app fallback).
- **Credentials are not committed.** `.env.local` is git-ignored, so the keys
  live only on your machine and in the host's environment-variable settings.
- **Keep-alive:** free Supabase projects auto-pause after ~7 days idle (this is
  what caused the original "Failed to fetch"). `.github/workflows/keepalive.yml`
  pings Supabase twice a week to keep it awake. After the repo is on GitHub, add
  these repository secrets (Settings → Secrets and variables → Actions):
  - `SUPABASE_URL` = `https://chpexdmbwbtdyqzfvmow.supabase.co`
  - `SUPABASE_ANON_KEY` = *(your anon public key)*

## Other free hosts

The same `dist/` works on Vercel, Netlify, or GitHub Pages. Only GitHub Pages
needs a base-path change (`base: '/<repo-name>/'` in `vite.config.js`) because
it serves from a sub-path.
