// ── Cloud Sync + Auth (Supabase) ─────────────────────────────────────────
// Backed by @supabase/supabase-js (see ./supabaseClient.js).
//
// Three responsibilities:
//   1. Auth  — email/password register, login, logout, session/state.
//   2. Data  — each signed-in user owns ONE row in `astro_sync`, keyed by
//              user_id = auth.uid(). Row Level Security guarantees a user can
//              only ever read/write their own row, so no user can see another
//              user's profiles.
//   3. Files — raw PDF reports are uploaded to a PRIVATE Storage bucket
//              (`vedic-reports`) under a per-user folder `<user_id>/...`.
//              RLS on storage.objects restricts access to the owner.
//
// One-time database setup (run once in the Supabase SQL editor):
//   see SUPABASE_AUTH_SETUP.md in the project root.

import {
  getSupabase,
  getSupabaseConfig,
  setSupabaseConfig,
  clearSupabaseConfig,
  isSupabaseConfigured,
} from './supabaseClient';

const TABLE = 'astro_sync';
const BUCKET = 'vedic-reports'; // private per-user storage bucket

// Re-export config helpers so existing imports keep working.
export {
  getSupabaseConfig as getSyncConfig,
  setSupabaseConfig as setSyncConfig,
  clearSupabaseConfig as clearSyncConfig,
  isSupabaseConfigured,
};

// ── Auth ──────────────────────────────────────────────────────────────────

/** Register a new account. Resolves with { user, session, needsConfirmation }. */
export async function signUp(email, password) {
  const sb = requireClient();
  // Point the confirmation email back at wherever the app is actually served
  // (prod or localhost) instead of Supabase's default Site URL. The origin must
  // also be listed under Auth → URL Configuration → Redirect URLs in Supabase.
  const emailRedirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  });
  if (error) throw friendlyAuthError(error);
  // When email confirmation is ON, session is null until the link is clicked.
  return {
    user: data.user,
    session: data.session,
    needsConfirmation: !!data.user && !data.session,
  };
}

/** Sign in with email + password. Resolves with { user, session }. */
export async function signIn(email, password) {
  const sb = requireClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw friendlyAuthError(error);
  return { user: data.user, session: data.session };
}

/** Sign the current user out. */
export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

/** Resend the confirmation email for an unconfirmed signup. */
export async function resendConfirmation(email) {
  const sb = requireClient();
  const { error } = await sb.auth.resend({ type: 'signup', email: email.trim() });
  if (error) throw friendlyAuthError(error);
}

/** Get the current session (or null), reading from persisted storage. */
export async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

/** Get the current user (or null). */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Subscribe to auth state changes (login/logout/token refresh).
 * @param {(event: string, session: object|null) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onAuthChange(cb) {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data.subscription.unsubscribe();
}

// ── Per-user data row ───────────────────────────────────────────────────────

/**
 * Load the signed-in user's data bundle.
 * @returns {Promise<{data: object, updatedAt: string} | null>} null if none yet
 */
export async function cloudLoad() {
  const sb = requireClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await wrapTimeout(
    sb.from(TABLE)
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
  );
  if (error) throw friendlyDataError(error);
  if (!data) return null;
  return { data: data.data, updatedAt: data.updated_at };
}

/**
 * Upsert the signed-in user's data bundle (last-write-wins on their own row).
 * @param {object} bundle full app data bundle
 */
export async function cloudSave(bundle) {
  const sb = requireClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await wrapTimeout(
    sb.from(TABLE).upsert(
      { user_id: user.id, data: bundle, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  );
  if (error) throw friendlyDataError(error);
}

/** Quick connectivity/credentials check for the settings modal. */
export async function testConnection() {
  const sb = requireClient();
  // A HEAD count against the table verifies URL + key + table existence.
  const { error } = await sb.from(TABLE).select('user_id', { count: 'exact', head: true });
  if (error) {
    if (error.code === '42P01') throw new Error('Table astro_sync not found — run the setup SQL first.');
    if (/JWT|key|apikey|Invalid/i.test(error.message)) throw new Error('Invalid anon key (unauthorized).');
    throw friendlyDataError(error);
  }
  return true;
}

// ── PDF report files (private Storage bucket) ──────────────────────────────

/** Storage object path for a user's report. */
function reportPath(userId, profileId, fileName) {
  const safe = fileName.replace(/[^\w.-]+/g, '_');
  return `${userId}/${profileId}-${Date.now()}-${safe}`;
}

/**
 * Upload a raw PDF to the user's private folder.
 * @returns {Promise<{path: string, name: string, size: number}>}
 */
export async function uploadReport(profileId, file) {
  const sb = requireClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const path = reportPath(user.id, profileId, file.name);
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/pdf',
  });
  if (error) throw friendlyStorageError(error);
  return { path, name: file.name, size: file.size };
}

/**
 * Create a short-lived signed URL to download/view a stored report.
 * @param {string} path storage object path returned by uploadReport
 * @param {number} expiresIn seconds (default 5 min)
 */
export async function getReportUrl(path, expiresIn = 300) {
  const sb = requireClient();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw friendlyStorageError(error);
  return data.signedUrl;
}

/** Delete a stored report (best-effort; ignores "not found"). */
export async function deleteReport(path) {
  if (!path) return;
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error && !/not.*found/i.test(error.message)) throw friendlyStorageError(error);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function requireClient() {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured (missing Supabase URL / anon key).');
  return sb;
}

// Adds a timeout so a paused free-tier project surfaces an actionable message
// instead of hanging. PostgREST builders are thenable, so we race them.
async function wrapTimeout(builder, timeoutMs = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('__timeout__')), timeoutMs);
  });
  try {
    return await Promise.race([builder, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function friendlyDataError(error) {
  const msg = error?.message || String(error);
  if (msg === '__timeout__' || /timeout/i.test(msg)) {
    return new Error('Cloud sync timed out. The Supabase project may be paused — open your Supabase dashboard and make sure it is active.');
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return new Error('Could not reach Supabase. The free project may have auto-paused after inactivity — open https://supabase.com/dashboard and resume it, then retry.');
  }
  return new Error(msg);
}

function friendlyStorageError(error) {
  const msg = error?.message || String(error);
  if (/Bucket not found/i.test(msg)) {
    return new Error('Storage bucket vedic-reports not found — run the setup SQL (Storage section) first.');
  }
  if (/exceeded|too large|413/i.test(msg)) {
    return new Error('That PDF is too large for the storage bucket limit. Try a smaller file or raise the bucket limit in Supabase.');
  }
  return new Error(msg);
}

function friendlyAuthError(error) {
  const msg = error?.message || String(error);
  if (/already registered|already been registered|User already/i.test(msg)) {
    return new Error('An account with this email already exists. Try signing in instead.');
  }
  if (/Invalid login credentials/i.test(msg)) {
    return new Error('Incorrect email or password.');
  }
  if (/Email not confirmed/i.test(msg)) {
    return new Error('Please confirm your email first — check your inbox for the confirmation link.');
  }
  if (/Password should be at least/i.test(msg)) {
    return new Error('Password is too short (minimum 6 characters).');
  }
  if (/rate limit|too many/i.test(msg)) {
    return new Error('Too many attempts — please wait a minute and try again.');
  }
  return new Error(msg);
}
