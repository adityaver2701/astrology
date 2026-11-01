// ── E2E: app shell interactions (top bar, chart card, drawer, nav) ─────────
// Each test gets a fresh browser context, so localStorage starts empty and the
// app shows its sample chart. Skips itself when the target enforces sign-in
// (e.g. BASE_URL pointing at the live site).
import { test, expect } from '@playwright/test';
import { AppShell } from './pages/AppShell.js';

test.describe('app shell', () => {
  /** @type {AppShell} */
  let app;

  test.beforeEach(async ({ page }) => {
    app = new AppShell(page);
    await app.goto('/');
    test.skip(await app.isAuthGated(), 'Auth gate active — shell tests need the open dashboard');
  });

  test('fresh visit is labelled as a sample chart with a clear call to action', async () => {
    await expect(app.chartCard.getByText('Sample chart', { exact: true })).toBeVisible();
    await expect(app.editBirthButton).toHaveText(/Enter my birth details/);
  });

  test('birth details drawer edits the chart live and closes with Escape', async ({ page }) => {
    await app.openBirthDetails();
    await app.nameInput.fill('Test Native');
    await app.dateInput.fill('1990-05-15');

    // The chart card behind the drawer reflects the edit immediately.
    await expect(app.chartCard.getByRole('heading', { name: 'Test Native' })).toBeVisible();
    await expect(app.chartCard).toContainText('1990');

    await page.keyboard.press('Escape');
    await expect(app.drawer).toBeHidden();
  });

  test('saving without a name points at the name field', async () => {
    await app.openBirthDetails();
    await app.saveProfileButton.click();
    await expect(app.nameInput).toHaveAttribute('aria-invalid', 'true');
    await expect(app.nameInput).toBeFocused();
  });

  test('save as profile shows a toast and appears in the profile switcher', async ({ page }) => {
    await app.openBirthDetails();
    await app.nameInput.fill('Meera');
    await app.saveProfileButton.click();

    await expect(page.locator('.toast')).toContainText('Saved “Meera” as a profile');
    await expect(app.profileSwitcher).toContainText('Meera');

    await page.keyboard.press('Escape');
    await app.profileSwitcher.click();
    await expect(page.getByRole('menuitemradio', { name: /Meera/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('theme toggle switches and persists across reloads', async ({ page }) => {
    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    await app.themeToggle.click();
    const after = before === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveAttribute('data-theme', after);

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', after);
  });

  test('number keys jump between sections', async ({ page }) => {
    await page.keyboard.press('6');
    await expect(app.section(/Vimshottari Dasha/)).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('1');
    await expect(app.section(/Birth Details/)).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('app shell on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('bottom bar replaces the side nav and the More sheet lists every section', async ({ page }) => {
    const app = new AppShell(page);
    await app.goto('/');
    test.skip(await app.isAuthGated(), 'Auth gate active');

    await expect(app.sectionNav).toBeHidden();
    await expect(app.mobileNav).toBeVisible();

    await app.mobileNav.getByRole('button', { name: /More/ }).click();
    const sheet = page.getByRole('menu', { name: 'All sections' });
    await expect(sheet.getByRole('menuitem')).toHaveCount(8);

    await sheet.getByRole('menuitem', { name: /Panchanga/ }).click();
    await expect(page.getByRole('heading', { name: /Five Limbs of the Vedic Day/ })).toBeVisible();
  });
});
