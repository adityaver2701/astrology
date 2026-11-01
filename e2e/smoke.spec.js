// ── E2E smoke test: app boots, auth gate or dashboard renders ──────────────
// Kept auth-independent: when Supabase auth is configured the app shows the
// sign-in screen; without it, the dashboard renders directly. Both are valid
// boots — a blank page or console crash is the failure we're guarding against.
import { test, expect } from '@playwright/test';
import { AppShell } from './pages/AppShell.js';

test.describe('app boot', () => {
  test('loads without console errors and renders a known screen', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // Cloudflare's injected analytics beacon fails CORS on its own — not our code.
      if (/cloudflareinsights\.com/.test(msg.text() + msg.location().url)) return;
      errors.push(msg.text());
    });

    const app = new AppShell(page);
    await app.goto('/');

    // No uncaught runtime errors during boot.
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('dashboard flow: sections render and switch (when auth is not enforced)', async ({ page }) => {
    const app = new AppShell(page);
    await app.goto('/');
    // Skip gracefully when the deployment enforces sign-in.
    test.skip(await app.isAuthGated(), 'Auth gate active — dashboard flow needs a session');

    // All 8 sections exist in the side navigation.
    await expect(page.locator('.tab-btn')).toHaveCount(8);

    // Birth chart section shows the planetary table by default (chart auto-computes).
    await expect(page.locator('.planetary-table').first()).toBeVisible();

    // Switch to Panchanga — self-sufficient section, needs no chart.
    await app.section(/Panchanga/).click();
    await expect(page.getByRole('heading', { name: /Five Limbs of the Vedic Day/ })).toBeVisible();

    // Switch to Compatibility — renders its empty state without profiles.
    await app.section(/Compatibility/).click();
    await expect(page.getByText(/Ashtakoota Compatibility/).first()).toBeVisible();
  });

  test('shared chart link applies birth details', async ({ page }) => {
    // ?chart= param built by src/utils/share.js for a 1990-05-15 Delhi chart.
    const payload = btoa(JSON.stringify({
      name: 'Shared Person', date: '1990-05-15', time: '10:30',
      placeName: 'New Delhi, India', latitude: 28.6139, longitude: 77.209, timezone: 5.5,
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const app = new AppShell(page);
    await app.goto(`/?chart=${payload}`);
    test.skip(await app.isAuthGated(), 'Auth gate active — shared chart renders after sign-in');

    await expect(page.getByText('shared chart')).toBeVisible();
    await expect(app.chartCard.getByRole('heading', { name: 'Shared Person' })).toBeVisible();
  });
});
