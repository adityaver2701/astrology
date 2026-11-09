// ── E2E: enlarged (maximized) transit chart keeps its time controls ────────
// The magnifier on the Transit Chart opens a modal; there the chart must stay
// draggable and the timeline scrubber must work, and whatever moment you
// scrub to must carry back to the Interactive Kundali tab when it closes.
import { test, expect } from '@playwright/test';
import { AppShell } from './pages/AppShell.js';

test.describe('enlarged transit chart', () => {
  /** @type {import('@playwright/test').Locator} */
  let modal;

  test.beforeEach(async ({ page }) => {
    const app = new AppShell(page);
    await app.goto('/');
    test.skip(await app.isAuthGated(), 'Auth gate active — needs the open dashboard');

    await app.section(/Interactive Kundali/).click();
    const transitColumn = page.locator('.chart-column').filter({ hasText: 'Transit Chart' });
    await transitColumn.getByRole('button', { name: 'Enlarge chart' }).click();
    modal = page.getByRole('dialog', { name: 'Transit Chart' });
    await expect(modal).toBeVisible();
  });

  test('step buttons move time and the tab follows after closing', async ({ page }) => {
    const date = modal.getByLabel('Transit Date');
    const before = await date.inputValue();

    await modal.getByRole('button', { name: '1 mo »' }).click();
    await expect(date).not.toHaveValue(before);
    const after = await date.inputValue();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.locator('#transitDate')).toHaveValue(after);
  });

  test('timeline slider scrubs the enlarged chart', async () => {
    const date = modal.getByLabel('Transit Date');
    // Slider values are fractional years on a 1/12 grid: 1990.0 → Jan 1990.
    await modal.getByLabel('Timeline Scrubber').fill(String(1950 + 480 * 0.0833));
    await expect(date).toHaveValue(/^1989-12-|^1990-01-/);
  });

  test('dragging a planet scrubs time and releasing outside keeps the modal open', async ({ page }) => {
    const date = modal.getByLabel('Transit Date');
    const before = await date.inputValue();

    const chart = modal.locator('svg.kundali-svg');
    const planet = chart.locator('text', { hasText: /^Sa/ }).first();
    const p = await planet.boundingBox();
    const c = await chart.boundingBox();
    const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
    const x0 = p.x + p.width / 2, y0 = p.y + p.height / 2;
    const r = Math.hypot(x0 - cx, y0 - cy), a0 = Math.atan2(y0 - cy, x0 - cx);

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {          // sweep 60° around the chart centre
      const a = a0 - (i / 8) * (Math.PI / 3);
      await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    await expect(modal.getByText(/Moving saturn/i)).toBeVisible();
    await page.mouse.move(4, 4);             // release over the dimmed backdrop
    await page.mouse.up();

    await expect(date).not.toHaveValue(before);
    await expect(modal).toBeVisible();
  });
});
