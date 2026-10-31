// ── Push registration → Azure Notification Hubs ───────────────────────────
//   POST /api/push/register  { installationId, token }
//     Auth: Supabase bearer token (same as /api/interpret).
//     Upserts an FCM v1 *installation* on the `astrology-alerts` hub, tagged
//     with `user:<supabase user id>` so the nightly alert job can target one
//     user with a tag expression instead of storing tokens itself.
//
// Config:
//   NH_HUB_NAME           (var)    e.g. "astrology-alerts"
//   NH_CONNECTION_STRING  (secret) the hub's DefaultListenSharedAccessSignature
//                         connection string — Listen is enough to manage
//                         installations; never ship the Full key to Workers.
//       npx wrangler secret put NH_CONNECTION_STRING
//
// REST reference: PUT https://{ns}.servicebus.windows.net/{hub}/installations/{id}?api-version=2020-06

const API_VERSION = '2020-06';
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Parse "Endpoint=sb://…/;SharedAccessKeyName=…;SharedAccessKey=…". */
export function parseConnectionString(cs) {
  const parts = Object.fromEntries(
    String(cs || '')
      .split(';')
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf('=');
        return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
      })
  );
  const endpoint = (parts.Endpoint || '').replace(/^sb:\/\//, 'https://').replace(/\/+$/, '');
  if (!endpoint || !parts.SharedAccessKeyName || !parts.SharedAccessKey) return null;
  return { endpoint, keyName: parts.SharedAccessKeyName, key: parts.SharedAccessKey };
}

/**
 * Service Bus SAS token. The key is used as raw UTF-8 bytes (NOT base64-decoded).
 * @param {string} resourceUri e.g. https://ns.servicebus.windows.net/hub
 */
export async function createSasToken(resourceUri, keyName, key, ttlSeconds = 3600, nowMs = Date.now()) {
  const sr = encodeURIComponent(resourceUri.toLowerCase());
  const se = Math.floor(nowMs / 1000) + ttlSeconds;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${sr}\n${se}`));
  const sig = encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(mac))));
  return `SharedAccessSignature sr=${sr}&sig=${sig}&se=${se}&skn=${encodeURIComponent(keyName)}`;
}

async function supabaseUserId(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!u.ok) return null;
  return (await u.json().catch(() => null))?.id || null;
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {(obj: any, status?: number) => Response} json
 */
export async function handlePushRegister(request, env, json) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const nh = parseConnectionString(env.NH_CONNECTION_STRING);
  if (!nh || !env.NH_HUB_NAME) return json({ error: 'Push is not configured on this deployment.' }, 503);

  let userId;
  try { userId = await supabaseUserId(request, env); } catch { userId = null; }
  if (!userId) return json({ error: 'Please sign in to enable notifications.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const installationId = String(body?.installationId || '');
  const token = String(body?.token || '');
  if (!ID_RE.test(installationId) || token.length < 20 || token.length > 4096) {
    return json({ error: 'Invalid installationId or token.' }, 400);
  }

  const hubUri = `${nh.endpoint}/${env.NH_HUB_NAME}`;
  const sas = await createSasToken(hubUri, nh.keyName, nh.key);
  const res = await fetch(`${hubUri}/installations/${installationId}?api-version=${API_VERSION}`, {
    method: 'PUT',
    headers: { Authorization: sas, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installationId,
      platform: 'fcmv1',
      pushChannel: token,
      tags: [`user:${userId}`],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('push/register: hub returned', res.status, detail.slice(0, 500));
    return json({ error: 'Could not register this device for notifications.' }, 502);
  }
  return json({ ok: true, installationId });
}
