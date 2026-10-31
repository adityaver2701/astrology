// ── Native (Capacitor / Android) bootstrap ────────────────────────────────
// Everything in here is a NO-OP on the web build. The plugins are imported
// dynamically so the browser bundle never pays for them: `initNative()` bails
// out before the first import() when `window.Capacitor.isNativePlatform()` is
// false, so Rollup keeps them in separate chunks that the web app never loads.
//
// Responsibilities:
//   1. Status bar + splash screen chrome to match the app's dark theme.
//   2. Safe-area CSS variables (notch / gesture bar) exposed to index.css.
//   3. Android hardware back button → close modals, then exit.
//   4. Resume hooks → re-pull cloud data and check for a live update, so the
//      app matches whatever the website is showing.
//   5. Push notifications (FCM → Azure Notification Hubs), see ./push.js.
//
// The app dispatches/consumes two custom events on `window`:
//   'astro:resume'  → fired when the app returns to the foreground (or the web
//                     tab becomes visible). App.jsx listens and re-pulls the
//                     Supabase bundle.
//   'astro:online'  → fired when connectivity is restored.

import { isNative } from '../apiBase.js';

let started = false;

/**
 * Initialise all native integrations. Safe to call on web (returns immediately)
 * and safe to call more than once.
 * @returns {Promise<void>}
 */
export async function initNative() {
  if (started) return;
  started = true;

  // The web build still wants resume/visibility events for two-way sync, so
  // those are wired for every platform before the native-only branch.
  wireVisibility();

  if (!isNative()) return;

  document.documentElement.classList.add('is-native', 'is-android');

  await Promise.allSettled([
    setupStatusBar(),
    setupSafeArea(),
    setupBackButton(),
    setupAppLifecycle(),
    setupNetwork(),
    hideSplash(),
  ]);

  // Push: permission prompt + FCM token → /api/push/register. Never blocks boot.
  import('./push.js')
    .then(({ initPush }) => initPush())
    .catch((err) => console.warn('native: push init skipped', err));

  // Live updates run last. markAppReady() is the important part — without it
  // the updater plugin assumes this bundle failed to boot and rolls it back.
  try {
    const { markAppReady, checkForUpdate } = await import('./liveUpdate.js');
    await markAppReady();
    await checkForUpdate();
  } catch (err) {
    console.warn('native: live-update check skipped', err);
  }
}

// ── Resume / visibility ───────────────────────────────────────────────────
// On web, `visibilitychange` covers tab switching. On native, the App plugin's
// appStateChange is the reliable signal (added in setupAppLifecycle).
function wireVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emitResume();
  });
  window.addEventListener('online', () => {
    window.dispatchEvent(new CustomEvent('astro:online'));
    emitResume();
  });
}

// Coalesce resume events: switching apps rapidly can fire several in a row and
// each one triggers a Supabase read.
let lastResume = 0;
function emitResume() {
  const now = Date.now();
  if (now - lastResume < 3000) return;
  lastResume = now;
  window.dispatchEvent(new CustomEvent('astro:resume'));
}

// ── Status bar ────────────────────────────────────────────────────────────
async function setupStatusBar() {
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: '#0b0b14' });
  await StatusBar.setOverlaysWebView({ overlay: false });
}

// ── Splash ────────────────────────────────────────────────────────────────
async function hideSplash() {
  const { SplashScreen } = await import('@capacitor/splash-screen');
  await SplashScreen.hide();
}

// ── Safe areas ────────────────────────────────────────────────────────────
// Android 15+ enforces edge-to-edge, so the WebView can sit under the status
// bar and the gesture pill. `env(safe-area-inset-*)` is the CSS source of
// truth; these custom properties give index.css a single place to read them
// with a sane fallback on older devices.
async function setupSafeArea() {
  const root = document.documentElement;
  const apply = () => {
    root.style.setProperty('--safe-top', 'env(safe-area-inset-top, 0px)');
    root.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');
    root.style.setProperty('--safe-left', 'env(safe-area-inset-left, 0px)');
    root.style.setProperty('--safe-right', 'env(safe-area-inset-right, 0px)');
  };
  apply();
  window.addEventListener('resize', apply);

  // Keyboard: shrink the layout instead of letting it cover the focused input.
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    Keyboard.addListener('keyboardWillShow', (info) => {
      root.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      root.classList.add('keyboard-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      root.style.setProperty('--keyboard-height', '0px');
      root.classList.remove('keyboard-open');
    });
  } catch {
    // Keyboard plugin is optional — layout just won't reflow.
  }
}

// ── Android hardware back button ──────────────────────────────────────────
// Without this the back button closes the whole app from any screen, which
// feels broken when a modal is open. Priority order:
//   1. Let the app close an open modal (any element with [data-native-back]).
//   2. Otherwise, if we're not on the first tab, go back to it.
//   3. Otherwise exit.
async function setupBackButton() {
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', ({ canGoBack }) => {
    // 1. Dispatch a cancelable event so React can intercept it.
    const ev = new CustomEvent('astro:backbutton', { cancelable: true });
    const notHandled = window.dispatchEvent(ev);
    if (!notHandled) return; // preventDefault() called → React handled it

    // 2. Fall back to WebView history if there is any.
    if (canGoBack && window.history.length > 1) {
      window.history.back();
      return;
    }

    // 3. Nothing left to go back to.
    App.exitApp();
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────
async function setupAppLifecycle() {
  const { App } = await import('@capacitor/app');
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    emitResume();
    // Check for a newer web build each time the app is foregrounded.
    import('./liveUpdate.js')
      .then(({ checkForUpdate }) => checkForUpdate())
      .catch(() => {});
  });
}

// ── Network ───────────────────────────────────────────────────────────────
async function setupNetwork() {
  const { Network } = await import('@capacitor/network');
  Network.addListener('networkStatusChange', (status) => {
    document.documentElement.classList.toggle('is-offline', !status.connected);
    if (status.connected) {
      window.dispatchEvent(new CustomEvent('astro:online'));
      emitResume();
    }
  });
  const status = await Network.getStatus();
  document.documentElement.classList.toggle('is-offline', !status.connected);
}
