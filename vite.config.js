import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Source map upload is opt-in: it only runs when SENTRY_AUTH_TOKEN is present
// in .env.local. Without the token, builds are completely unchanged (no maps
// generated, no upload) — so local dev and CI without the secret still work.
export default defineConfig(({ mode }) => {
  // `vite --mode e2e` is the dev server Playwright starts (playwright.config.js).
  // Blank the Supabase + Sentry vars so the sign-in gate and error reporting
  // are off and the dashboard specs exercise the real UI. Vite reads env files
  // AFTER this config runs and lets process.env win over .env.local, so this
  // overrides the developer's real keys for that one server only.
  if (mode === 'e2e') {
    process.env.VITE_SUPABASE_URL = ''
    process.env.VITE_SUPABASE_ANON_KEY = ''
    process.env.VITE_SENTRY_DSN = ''
  }

  const env = loadEnv(mode, process.cwd(), '') // '' → load ALL vars, not just VITE_*
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN
  const uploadSourceMaps = Boolean(sentryAuthToken)

  return {
    plugins: [
      react(),
      uploadSourceMaps &&
        sentryVitePlugin({
          org: 'aditya-verma-z9',
          project: 'astrology',
          authToken: sentryAuthToken,
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        }),
    ].filter(Boolean),
    test: {
      // Playwright specs live in e2e/ and are run by `npm run test:e2e`.
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
    build: {
      // Clean dist on every build: avoids shipping stale hashed bundles and
      // ensures no leftover source maps get deployed.
      emptyOutDir: true,
      sourcemap: uploadSourceMaps,
    },
  }
})
