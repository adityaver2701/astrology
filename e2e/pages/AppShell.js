// ── Page object for the app shell (top bar, section nav, chart card, drawer) ──
// Locators are role/label/test-id based so the specs read like the UI and
// survive styling changes. data-testid is used only where no accessible name
// is unique (the chart card and the profile switcher).
import { expect } from '@playwright/test';

export class AppShell {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.dashboard = page.locator('.app-container');
    this.authScreen = page.locator('.auth-screen');

    // Top bar
    this.profileSwitcher = page.getByTestId('profile-switcher');
    this.themeToggle = page.getByTestId('theme-toggle');
    this.moreMenuButton = page.getByRole('button', { name: 'More options' });

    // Section navigation (desktop/tablet) and phone bottom bar
    this.sectionNav = page.getByRole('navigation', { name: 'Sections' });
    this.mobileNav = page.getByRole('navigation', { name: 'Main' });

    // Chart card + birth details drawer
    this.chartCard = page.getByTestId('chart-hero');
    this.editBirthButton = page.getByTestId('edit-birth-details');
    this.drawer = page.getByRole('dialog', { name: 'Birth details' });
    this.nameInput = this.drawer.getByLabel('Name');
    this.dateInput = this.drawer.getByLabel('Birth date');
    this.timeInput = this.drawer.getByLabel('Birth time (local)');
    this.saveProfileButton = this.drawer.getByRole('button', { name: 'Save as profile' });

  }

  async goto(path = '/') {
    await this.page.goto(path);
    await expect(this.authScreen.or(this.dashboard).first()).toBeVisible({ timeout: 15_000 });
  }

  /** True when the deployment shows the sign-in gate instead of the dashboard. */
  async isAuthGated() {
    return !(await this.dashboard.isVisible().catch(() => false));
  }

  section(name) {
    return this.sectionNav.getByRole('button', { name });
  }

  async openBirthDetails() {
    await this.editBirthButton.click();
    await expect(this.drawer).toBeVisible();
  }
}
