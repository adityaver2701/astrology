// ── Cloud Sync (Supabase) ────────────────────────────────────────────────
// Lightweight fetch-based client against Supabase's PostgREST API.
// No SDK dependency. Stores all app data as a single JSON row keyed by id.
//
// One-time setup (see CLOUD_SYNC_SETUP.md in project root):
//   1. Create a free project at https://supabase.com
//   2. Run the SQL in CLOUD_SYNC_SETUP.md to create the `astro_sync` table
//   3. Paste the Project URL + anon key into the app's ☁ Cloud Sync settings
//
// Config resolution order:
//   1. localStorage  (set via the in-app Cloud Sync settings modal)
//   2. Vite env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local)

const CONFIG_KEY = 'astro_sync_config';
const ROW_ID = 'main';
const TABLE = 'astro_sync';

export function getSyncConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const cfg = JSON.parse(saved);
      if (cfg && cfg.url && cfg.anonKey) return cfg;
    }
  } catch (e) {
    console.error('cloudSync: bad config in localStorage', e);
  }
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  return null;
}

export function setSyncConfig({ url, anonKey }) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    url: url.trim().replace(/\/+$/, ''),
    anonKey: anonKey.trim()
  }));
}

export function clearSyncConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

function headers(cfg, withBody = false) {
  const h = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`
  };
  // Only set Content-Type when actually sending a body. Adding it to GET
  // requests forces an unnecessary CORS preflight (OPTIONS) round-trip.
  if (withBody) h['Content-Type'] = 'application/json';
  return h;
}

function hostOf(cfg) {
  try {
    return new URL(cfg.url).host;
  } catch {
    return cfg.url;
  }
}

// Wraps fetch with a timeout and turns the opaque browser-level
// "Failed to fetch" / "Load failed" / timeout into an actionable message.
async function request(cfg, url, opts = {}, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    const host = hostOf(cfg);
    if (err.name === 'AbortError') {
      throw new Error(`Cloud sync timed out reaching ${host}. The Supabase project may be paused or your connection is slow. Open your Supabase dashboard and make sure the project is active.`, { cause: err });
    }
    // fetch() throws a TypeError ("Failed to fetch" / "Load failed" / "NetworkError")
    // when the request never reached the server: paused project, DNS, offline, or CORS.
    if (err instanceof TypeError) {
      throw new Error(`Could not reach Supabase at ${host}. Most likely the free project was auto-paused after inactivity — open https://supabase.com/dashboard, select the project, and click "Restore"/"Resume". Also check your internet connection and that the Project URL is correct.`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the synced data bundle from the cloud.
 * @returns {Promise<{data: object, updatedAt: string} | null>} null when no row exists yet
 * @throws on network/auth/config errors (caller shows sync error state)
 */
export async function cloudLoad(cfg = getSyncConfig()) {
  if (!cfg) throw new Error('Cloud sync not configured');
  const res = await request(
    cfg,
    `${cfg.url}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=data,updated_at`,
    { headers: headers(cfg) }
  );
  if (!res.ok) throw new Error(`Cloud load failed (HTTP ${res.status}): ${await safeText(res)}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { data: rows[0].data, updatedAt: rows[0].updated_at };
}

/**
 * Upsert the data bundle to the cloud (last-write-wins).
 * @param {object} data - the full app data bundle
 */
export async function cloudSave(data, cfg = getSyncConfig()) {
  if (!cfg) throw new Error('Cloud sync not configured');
  const res = await request(cfg, `${cfg.url}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      ...headers(cfg, true),
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{ id: ROW_ID, data, updated_at: new Date().toISOString() }])
  });
  if (!res.ok) throw new Error(`Cloud save failed (HTTP ${res.status}): ${await safeText(res)}`);
}

/** Quick connectivity/credentials check used by the settings modal. */
export async function testConnection(cfg) {
  const res = await request(cfg, `${cfg.url}/rest/v1/${TABLE}?select=id&limit=1`, {
    headers: headers(cfg)
  });
  if (res.status === 401 || res.status === 403) throw new Error('Invalid anon key (unauthorized).');
  if (res.status === 404) throw new Error('Table `astro_sync` not found — run the setup SQL first.');
  if (!res.ok) throw new Error(`Connection failed (HTTP ${res.status}): ${await safeText(res)}`);
  return true;
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}
