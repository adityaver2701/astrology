// ── Playwright E2E configuration ───────────────────────────────────────────
// Run once after `npm install`:  npx playwright install chromium
// Then:                          npm run test:e2e
// The dev server is started automatically (vite on :5173) unless BASE_URL is
// set, e.g. to test the live site:
//   BASE_URL=https://astrology.penetacle.workers.dev npx playwright test
import { defineConfig, devices } from '@playwright/test';

const remote = !!process.env.BASE_URL;
const baseURL = process.env.BASE_URL || 'http://localhost:5173';

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
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
