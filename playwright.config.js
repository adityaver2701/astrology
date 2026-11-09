// ── Playwright E2E configuration ───────────────────────────────────────────
// Run once after `npm install`:  npx playwright install chromium
// Then:                          npm run test:e2e
// A dedicated dev server is started automatically on :5175 in Vite's `e2e`
// mode (see vite.config.js — sign-in gate and Sentry off, so the dashboard
// specs run instead of skipping at the login screen). It uses its own port so it
// never reuses the auth-enabled `npm run dev` server on :5173.
// Set BASE_URL to test a deployed site instead, e.g. the live one:
//   BASE_URL=https://astrology.penetacle.workers.dev npx playwright test
//   (PowerShell: $env:BASE_URL="https://astrology.penetacle.workers.dev"; npx playwright test)
import { defineConfig, devices } from '@playwright/test';

const remote = !!process.env.BASE_URL;
const E2E_PORT = 5175;
const baseURL = process.env.BASE_URL || `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // One worker on CI / remote runs — the VM has ~1 GiB RAM.
  workers: process.env.CI || remote ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Only spin up the local dev server when not targeting a remote URL.
  webServer: remote ? undefined : {
    command: `npx vite --mode e2e --port ${E2E_PORT} --strictPort`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
