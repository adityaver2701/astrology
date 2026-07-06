// ── Supabase client singleton ────────────────────────────────────────────
// One @supabase/supabase-js client, lazily created from the same config
// resolution the app already uses (localStorage override → Vite env vars).
//
// The client persists the auth session in localStorage and auto-refreshes the
// access token, so once a user signs in their JWT is attached to every request
// — which is what makes the per-user Row Level Security policies work.

import { createClient } from '@supabase/supabase-js';

const CONFIG_KEY = 'astro_sync_config';

/**
 * Resolve the Supabase connection config.
 * Order: localStorage (set via the in-app settings modal) → Vite env vars.
 * @returns {{url: string, anonKey: string} | null}
 */
export function getSupabaseConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const cfg = JSON.parse(saved);
      if (cfg && cfg.url && cfg.anonKey) return cfg;
    }
  } catch (e) {
    console.error('supabaseClient: bad config in localStorage', e);
  }
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  return null;
}

let _client = null;
let _clientKey = null; // url|anonKey the cached client was built with

/**
 * Get (or lazily build) the singleton Supabase client for the current config.
 * Returns null when no config is available. Rebuilds automatically if the
 * stored URL/key changed (e.g. the user reconnects in the settings modal).
 */
export function getSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (_client && _clientKey === key) return _client;
  _client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'astro_auth',
    },
  });
  _clientKey = key;
  return _client;
}

/** True when a Supabase URL + anon key are available. */
export function isSupabaseConfigured() {
  return !!getSupabaseConfig();
}

/** Persist a manual config override (used by the in-app settings modal). */
export function setSupabaseConfig({ url, anonKey }) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    url: url.trim().replace(/\/+$/, ''),
    anonKey: anonKey.trim(),
  }));
  _client = null; // force rebuild on next getSupabase()
  _clientKey = null;
}

/** Remove the manual config override (falls back to env vars, if any). */
export function clearSupabaseConfig() {
  localStorage.removeItem(CONFIG_KEY);
  _client = null;
  _clientKey = null;
}
