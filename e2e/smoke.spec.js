// ── E2E smoke test: app boots, auth gate or dashboard renders ──────────────
// Kept auth-independent: when Supabase auth is configured the app shows the
// sign-in screen; without it, the dashboard renders directly. Both are valid
// boots — a blank page or console crash is the failure we're guarding against.
import { test, expect } from '@playwright/test';

test.describe('app boot', () => {
  test('loads without console errors and renders a known screen', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');

    // Either the auth screen or the main dashboard must appear.
    const authScreen = page.locator('.auth-screen');
    const dashboard = page.locator('.app-container');
    await expect(authScreen.or(dashboard).first()).toBeVisible({ timeout: 15_000 });

    // No uncaught runtime errors during boot.
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('dashboard flow: tabs render and switch (when auth is not enforced)', async ({ page }) => {
    await page.goto('/');
    const dashboard = page.locator('.app-container');
    // Skip gracefully when the deployment enforces sign-in.
    if (!(await dashboard.isVisible().catch(() => false))) {
      test.skip(true, 'Auth gate active — dashboard flow needs a session');
    }

    // All 8 tabs exist.
    await expect(page.locator('.tab-btn')).toHaveCount(8);

    // Birth chart tab shows the planetary table by default (chart auto-computes).
    await expect(page.locator('.planetary-table').first()).toBeVisible();

    // Switch to Panchanga — self-sufficient tab, needs no chart.
    await page.getByRole('button', { name: /Panchanga/ }).click();
    await expect(page.getByText('Five Limbs of the Vedic Day')).toBeVisible();

    // Switch to Compatibility — renders its empty state without profiles.
    await page.getByRole('button', { name: /Compatibility/ }).click();
    await expect(page.getByText(/Ashtakoota Compatibility/).first()).toBeVisible();
  });

  test('shared chart link applies birth details', async ({ page }) => {
    // ?chart= param built by src/utils/share.js for a 1990-05-15 Delhi chart.
    const payload = btoa(JSON.stringify({
      name: 'Shared Person', date: '1990-05-15', time: '10:30',
      placeName: 'New Delhi, India', latitude: 28.6139, longitude: 77.209, timezone: 5.5,
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await page.goto(`/?chart=${payload}`);
    const dashboard = page.locator('.app-container');
    if (!(await dashboard.isVisible().catch(() => false))) {
      test.skip(true, 'Auth gate active — shared chart renders after sign-in');
    }
    await expect(page.getByText('shared chart')).toBeVisible();
  });
});
