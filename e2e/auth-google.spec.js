// ── E2E: "Continue with Google" on the sign-in screen ──────────────────────
// No real Google or Supabase traffic: the spec points the app at a fake
// Supabase project (via the same localStorage override the in-app Sync
// settings use) and answers its HTTP calls with page.route(). That keeps the
// test deterministic and lets it run anywhere — local e2e server or live site.
import { test, expect } from '@playwright/test';

const FAKE_SUPABASE = 'https://e2e-project.supabase.co';

/** Point the app at the fake project and stub its auth settings endpoint. */
async function useFakeSupabase(page, { google }) {
  await page.addInitScript((url) => {
    localStorage.setItem('astro_sync_config', JSON.stringify({ url, anonKey: 'e2e-anon-key' }));
  }, FAKE_SUPABASE);
  await page.route(`${FAKE_SUPABASE}/auth/v1/settings`, (route) =>
    route.fulfill({ json: { external: { google, email: true } } }));
}

test.describe('Google sign-in', () => {
  test('button is hidden until the Google provider is enabled in Supabase', async ({ page }) => {
    await useFakeSupabase(page, { google: false });
    await page.goto('/');
    await expect(page.locator('.auth-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('google-signin')).toHaveCount(0);
  });

  test('starts the OAuth redirect with the expected parameters', async ({ page, baseURL }) => {
    await useFakeSupabase(page, { google: true });
    // Catch the full-page navigation to Supabase's authorize endpoint.
    await page.route(`${FAKE_SUPABASE}/auth/v1/authorize**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>stub authorize</h1>' }));

    await page.goto('/');
    const button = page.getByTestId('google-signin');
    await expect(button).toHaveText(/Continue with Google/);

    const [request] = await Promise.all([
      page.waitForRequest(`${FAKE_SUPABASE}/auth/v1/authorize**`),
      button.click(),
    ]);
    const url = new URL(request.url());
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe(new URL(baseURL).origin);
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  test('a cancelled Google sign-in returns with a friendly message', async ({ page }) => {
    await useFakeSupabase(page, { google: true });
    await page.goto('/#error=access_denied&error_description=The+user+denied+the+request');
    await expect(page.getByText('Google sign-in was cancelled.')).toBeVisible();
    // Error params are stripped so a reload doesn't repeat the message.
    await expect(page).not.toHaveURL(/error_description/);
  });

  test('switching to Create Account relabels the Google button', async ({ page }) => {
    await useFakeSupabase(page, { google: true });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Account' }).first().click();
    await expect(page.getByTestId('google-signin')).toHaveText(/Sign up with Google/);
  });
});
