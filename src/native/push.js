// ── Push notifications (Android, FCM via Azure Notification Hubs) ─────────
// Flow: ask permission → PushNotifications.register() → FCM hands us a token
// in the 'registration' event → POST it to the Worker (/api/push/register),
// which upserts an installation on the `astrology-alerts` hub tagged
// `user:<id>`. Requires a signed-in Supabase session; if the user isn't
// signed in yet we retry when they sign in (see initPush's onAuthChange).
// Native-only: initNative() never calls this on the web.

import { apiUrl } from '../apiBase.js';
import { getSession, onAuthChange } from '../cloudSync.js';

const INSTALLATION_KEY = 'astro_push_installation_id';
let latestToken = null;
let started = false;

/** Stable per-install ID (survives restarts; reset only on app data clear). */
export function getInstallationId(storage = globalThis.localStorage) {
  let id = null;
  try { id = storage.getItem(INSTALLATION_KEY); } catch { /* storage blocked */ }
  if (!id) {
    id = crypto.randomUUID();
    try { storage.setItem(INSTALLATION_KEY, id); } catch { /* ignore */ }
  }
  return id;
}

async function sendTokenToServer() {
  if (!latestToken) return;
  const session = await getSession();
  if (!session?.access_token) return; // not signed in yet — onAuthChange retries
  const res = await fetch(apiUrl('/api/push/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ installationId: getInstallationId(), token: latestToken }),
  });
  if (!res.ok) console.warn('push: register failed', res.status, await res.text().catch(() => ''));
}

/** Initialise push. Safe to call more than once. */
export async function initPush() {
  if (started) return;
  started = true;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  await PushNotifications.addListener('registration', ({ value }) => {
    latestToken = value;
    sendTokenToServer().catch((err) => console.warn('push: register error', err));
  });
  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('push: FCM registration error', err);
  });
  // Foreground notifications: Android doesn't show a tray banner while the
  // app is open, so surface it to React and let the UI decide.
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    window.dispatchEvent(new CustomEvent('astro:push', { detail: n }));
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    window.dispatchEvent(new CustomEvent('astro:push-open', { detail: a.notification }));
  });

  // Re-send the token whenever the user signs in (or the session refreshes
  // after being signed out), so the installation gets their user tag.
  onAuthChange((event) => {
    if (event === 'SIGNED_IN') sendTokenToServer().catch(() => {});
  });

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return; // user declined — respect it
  await PushNotifications.register();
}
