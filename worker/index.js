// ── Cloudflare Worker entry ───────────────────────────────────────────────
// Serves the built SPA from the ASSETS binding and adds a small JSON API.
//   POST /api/interpret  → Vedic-astrology reading via Groq (free tier) when
//                          GROQ_API_KEY is set, falling back to Cloudflare
//                          Workers AI. Auth-gated, per-user rate-limited,
//                          cached, and streamed as plain text when
//                          body.stream === true.
//   POST /api/chat       → Admin-only AI chat grounded in the admin's saved
//                          profiles. Claude when ANTHROPIC_API_KEY is set,
//                          else free Groq → Workers AI (see ./chat.js).
//   GET  /api/health     → Supabase reachability probe for uptime monitors
// Everything else falls through to static assets (SPA fallback handled by the
// assets binding's not_found_handling = "single-page-application").

import { sendTransitAlerts } from './alerts.js';
import { handleChat } from './chat.js';

// Cloudflare Workers AI models — tried in order; if one is deprecated or
// unavailable we fall through to the next. These are the fallback tier.
const AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
];

// Groq (free tier) is the primary provider when GROQ_API_KEY is configured
// (`wrangler secret put GROQ_API_KEY`). OpenAI-compatible chat-completions API,
// very fast token streaming. We fall back to Workers AI if the key is absent
// or the call fails. Override the model with the GROQ_MODEL var if desired.
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// Per-user daily limit on AI readings. Uses the RATE_LIMIT_KV binding when
// configured (see HOSTING.md); otherwise falls back to a per-isolate memory
// map (best-effort — resets when the isolate recycles, but still stops bursts).
const DAILY_LIMIT = 20;
const memoryCounts = new Map();

// ── "Deep Reading" master prompt ──────────────────────────────────────────
// A long-form Trik-Bhava reading (BPHS + "Trik Bhavo Ki Gatha"). Kept as the
// system message; the native's inputs + computed placements go in the user
// message. Needs a larger output budget than the short readings.
const DEEP_MAX_TOKENS = 3072;
const DEEP_SYSTEM =
`Role & Framework:
You are a Vedic Jyotish master with 25+ years of practical experience, deeply trained in:
1. Brihat Parashara Hora Shastra
2. The karmic-psychological insights of Trik Bhavo Ki Gatha by Pandit Krishna Ashant
Using classical Jyotish principles combined with deep Trik Bhava analysis (6th, 8th, and 12th houses), generate a high-precision, emotionally accurate life and personality analysis.

Analysis Requirements
Your analysis must:
– Decode dominant planetary energies, karmic themes, and Trik Bhava influence
– Reveal true inner nature, emotional wiring, silent struggles, and misunderstood traits
– Describe major life phases and turning points already experienced (retrospective, not predictive)
Explain patterns around: Suffering, Detachment, Delayed results, Responsibility, Inner resilience.
Analyze relationship dynamics, including: Trust patterns, Emotional withdrawal, Intimacy blocks.
Note major life events in the past that changed the life trajectory.

Snapshot Judgments (Mandatory Section)
Include a section titled "Snapshot Judgments" with 8–10 sharp, uncomfortably accurate observations, strictly divided as follows:
1. Love & Emotional Bonds (4–5 snapshots): Attachment patterns, emotional withdrawal, unspoken expectations, past relational turning points.
2. Career & Life Direction (4–5 snapshots): Delayed results, responsibility, ambition/discipline, internal pressure, the shift toward self-defined success.
Each snapshot must feel like a remembered truth, not a generalized personality trait.

Style & Tone Guidelines
– Calm, grounded, psychological — not mystical
– No vague astrology, no clichés, no disclaimers
– Speak with the certainty of lived experience

Future Love, Marriage & Career Trajectory
Love & Marriage (Predictive): grounded, non-sensational, based strictly on chart indicators and Trik Bhava dynamics. Cover likely timing windows (no exact dates), nature of future partner (emotional temperament, maturity, karmic role), whether marriage is delayed/unconventional/transformational, key long-term challenges, how past emotional patterns may repeat or resolve, and the conditions under which emotional fulfillment becomes stable. Frame marriage as karmic evolution, not a reward.
Career & Financial Path (Predictive): use planetary strength, Trik Bhava influence, and karma-to-effort alignment. Cover best-suited career domains (name suitable roles, fields, modes of work); whether success comes through authority vs independence, structured systems vs self-built paths, visibility vs behind-the-scenes mastery; expected growth pattern (early struggle vs late consolidation, sudden shifts vs slow compounding); financial stability and risk tendencies; and the age/life phase when career identity stabilizes. Emphasize earned authority, delayed recognition, and self-defined success.

Constraints for the predictive sections: predictive but psychologically grounded, no fear-based outcomes, no absolute promises or denial, and always link future outcomes to past patterns already experienced.

Closing Requirement
End with a concise Trik-based closing insight explaining how the person's life difficulties are refining and shaping them, not punishing them.`;

export default {
  async fetch(request, env, ctx) {
    const response = await route(request, env, ctx);
    // withCors is a no-op unless the request came from the Android WebView.
    return withCors(withSecurityHeaders(response), request);
  },

  // ── Crons ────────────────────────────────────────────────────────────────
  // "0 6 * * *"  keep Supabase warm (free tier auto-pauses after ~7 idle days)
  // "0 7 * * 1"  weekly transit-alert emails (no-op unless RESEND_API_KEY,
  //              SUPABASE_SERVICE_ROLE_KEY and ALERT_FROM are configured)
  async scheduled(event, env, ctx) {
    if (event.cron === '0 7 * * 1') {
      ctx.waitUntil(sendTransitAlerts(env));
    } else {
      ctx.waitUntil(keepSupabaseWarm(env));
    }
  },
};

// ── Android app (Capacitor) cross-origin access ────────────────────────────
// The Android build serves the bundled site from a LOCAL asset server, so its
// WebView origin is `https://localhost` — every /api/* call from the app is
// cross-origin and needs CORS. Only these exact origins are allowed; browsers
// on any other site still get no CORS headers at all.
const NATIVE_ORIGINS = new Set([
  'https://localhost',      // androidScheme: "https" (what capacitor.config.json uses)
  'http://localhost',       // androidScheme: "http" fallback
  'capacitor://localhost',  // iOS / legacy scheme, harmless to allow
]);

function corsHeadersFor(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !NATIVE_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withCors(response, request) {
  const cors = corsHeadersFor(request);
  if (!cors) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Routing ────────────────────────────────────────────────────────────────
async function route(request, env, ctx) {
  const url = new URL(request.url);

  // CORS preflight for the Android app's API calls.
  if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    const cors = corsHeadersFor(request);
    if (cors) return new Response(null, { status: 204, headers: cors });
    return new Response(null, { status: 204 });
  }

  // OTA live-update assets. Served from dist/ota/ like any other static file,
  // but must never be cached by an intermediary or the app will keep seeing a
  // stale manifest after a deploy. See scripts/build-ota.mjs.
  if (url.pathname === '/ota/manifest.json') {
    const res = await env.ASSETS.fetch(request);
    // The assets binding has not_found_handling = "single-page-application",
    // so a MISSING manifest comes back as index.html with status 200 rather
    // than a 404. Detect that and answer honestly, otherwise the app tries to
    // JSON.parse an HTML page every time it checks for an update.
    const isHtml = (res.headers.get('content-type') || '').includes('text/html');
    if (!res.ok || isHtml) {
      return json(
        { error: 'No OTA bundle published. Run `npm run deploy` (build:ota + wrangler deploy).' },
        404,
        { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
      );
    }
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'no-store, must-revalidate');
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(res.body, { status: res.status, headers });
  }
  if (url.pathname.startsWith('/ota/')) {
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    // Bundle filenames are version-stamped, so they're safe to cache forever.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(res.body, { status: res.status, headers });
  }

  if (url.pathname === '/api/health') return handleHealth(env);
  // Per-IP throttle on the (potentially expensive) AI POST endpoints. Auth
  // login/signup/reset/OTP live on Supabase, which rate-limits them itself.
  if (url.pathname === '/api/interpret' || url.pathname === '/api/chat') {
    if (request.method === 'POST' && !(await checkIpRateLimit(env, request))) {
      return json({ error: 'Too many requests — please slow down and try again shortly.' }, 429);
    }
  }
  if (url.pathname === '/api/interpret') return handleInterpret(request, env, ctx);
  if (url.pathname === '/api/chat') return handleChat(request, env, ctx);
  if (url.pathname.startsWith('/api/')) return json({ error: 'Unknown endpoint' }, 404);
  return env.ASSETS.fetch(request);
}

// ── Security headers ───────────────────────────────────────────────────────
// Applied to every response (API JSON, text streams, and static assets alike).
// CSP restricts scripts to our own origin; connect-src enumerates the only
// cross-origin hosts the browser legitimately talks to (Supabase for auth/data,
// Sentry for error reporting, open-meteo + nominatim for the place search).
// Keep connect-src in sync with any new browser-side fetch target.
const CSP = [
  "default-src 'self'",
  // 'self' plus the Cloudflare Web Analytics beacon that index.html loads.
  "script-src 'self' https://static.cloudflareinsights.com",
  // Google Fonts: stylesheet from googleapis, font files from gstatic (src/index.css).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  // 'self' also covers the Android app's own /api and /ota calls back to this
  // Worker; the app's local WebView origin isn't governed by this header.
  "connect-src 'self' https://astrology.penetacle.workers.dev https://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://geocoding-api.open-meteo.com https://nominatim.openstreetmap.org https://cloudflareinsights.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy', CSP);
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Preserve status/body/stream; only augment headers.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Per-IP rate limiting (defense-in-depth) ────────────────────────────────
// Primary auth (login/signup/password-reset/OTP) is hosted by Supabase, which
// enforces its own per-IP limits. These endpoints are ours, so we cap the AI
// routes per source IP to blunt scripted abuse and runaway model cost — and to
// throttle anyone hammering the Supabase token-verification path through us.
// Uses RATE_LIMIT_KV when bound; otherwise a per-isolate memory window.
const IP_LIMIT = 20;            // requests per window
const IP_WINDOW_SECONDS = 60;   // sliding-ish fixed window
const ipCounts = new Map();

async function checkIpRateLimit(env, request) {
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
  const bucket = Math.floor(Date.now() / (IP_WINDOW_SECONDS * 1000));
  const key = `ip:${ip}:${bucket}`;
  if (env.RATE_LIMIT_KV) {
    const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
    if (current >= IP_LIMIT) return false;
    await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: IP_WINDOW_SECONDS * 2 });
    return true;
  }
  const current = ipCounts.get(key) || 0;
  if (current >= IP_LIMIT) return false;
  if (ipCounts.size > 5000) ipCounts.clear(); // crude GC
  ipCounts.set(key, current + 1);
  return true;
}

// ── Server-side error logging with a client-safe correlation ID ────────────
// Detailed causes (upstream provider status/body, exception messages) go to the
// Worker logs only; the client gets a generic message plus the correlation ID
// so a user can quote it in a support request without exposing internals.
function errorResponse(status, clientMessage, detail) {
  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}]`, detail);
  return json({ error: clientMessage, correlationId }, status);
}

// ── Health check ──────────────────────────────────────────────────────────
async function handleHealth(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ ok: true, supabase: 'unconfigured' });
  }
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return json({ ok: false, supabase: 'unhealthy' }, 503);
    return json({ ok: true, supabase: 'healthy' });
  } catch (e) {
    console.error('health: supabase probe failed', (e && e.message) || e);
    return json({ ok: false, supabase: 'unreachable' }, 503);
  }
}

async function keepSupabaseWarm(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return;
  const headers = { apikey: env.SUPABASE_ANON_KEY };
  const targets = [
    `${env.SUPABASE_URL}/auth/v1/health`,
    `${env.SUPABASE_URL}/rest/v1/`, // touches PostgREST → exercises the database
  ];
  await Promise.allSettled(
    targets.map((u) => fetch(u, { headers }).catch(() => {}))
  );
}

// ── Rate limiting ─────────────────────────────────────────────────────────
async function checkRateLimit(env, userId) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${userId}:${day}`;
  if (env.RATE_LIMIT_KV) {
    const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
    if (current >= DAILY_LIMIT) return false;
    await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 90000 });
    return true;
  }
  // Memory fallback (per isolate)
  const current = memoryCounts.get(key) || 0;
  if (current >= DAILY_LIMIT) return false;
  if (memoryCounts.size > 5000) memoryCounts.clear(); // crude GC
  memoryCounts.set(key, current + 1);
  return true;
}

// ── Reading cache ─────────────────────────────────────────────────────────
// Identical chart + focus → identical prompt, so serve yesterday's answer
// instead of re-querying the model. Keyed by SHA-256 of the prompt inputs.
async function cacheKeyFor(summary, focus) {
  const data = new TextEncoder().encode(`${focus}\n${summary}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return new Request(`https://cache.internal/interpret/${hex}`);
}

async function handleInterpret(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Require a valid Supabase session so the AI endpoint isn't open to the world.
  // Fail closed: if auth isn't configured we refuse rather than treat callers as
  // anonymous, so a misconfigured deployment can't silently expose the endpoint.
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ error: 'Please sign in to use AI readings.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'Authentication is not configured on this deployment.' }, 503);
  }
  let userId;
  try {
    const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!u.ok) return json({ error: 'Your session expired — please sign in again.' }, 401);
    const userInfo = await u.json().catch(() => null);
    userId = userInfo?.id;
  } catch {
    return json({ error: 'Could not verify your session. Try again.' }, 503);
  }
  if (!userId) return json({ error: 'Your session expired — please sign in again.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const summary = String(body.summary || '').slice(0, 4000);
  const focus = String(body.focus || 'overview');
  const wantsStream = body.stream === true;
  const birth = body.birth && typeof body.birth === 'object' ? body.birth : {};
  if (!summary) return json({ error: 'No chart data provided.' }, 400);

  // Cache first — a hit costs no rate-limit budget and no model call.
  const cacheReq = await cacheKeyFor(summary, focus);
  const cached = await caches.default.match(cacheReq);
  if (cached) {
    const { text, model } = await cached.json();
    if (wantsStream) return textStreamResponse(text, model, 'cache');
    return json({ text, model, cached: true });
  }

  if (!(await checkRateLimit(env, userId))) {
    return json({ error: `Daily AI reading limit reached (${DAILY_LIMIT}/day). Try again tomorrow.` }, 429);
  }

  let messages;
  let maxTokens = 900;

  if (focus === 'deep') {
    // Long-form Trik-Bhava reading using the master prompt. The inputs the
    // template asks for come from `birth`; fall back to whatever the summary's
    // first line already carries if a field is missing.
    const inputs =
      `Full Name: ${birth.name || 'Not provided'}\n` +
      `Birthplace: ${birth.place || birth.placeName || 'Not provided'}\n` +
      `Date of Birth: ${birth.date || 'Not provided'}\n` +
      `Time of Birth: ${birth.time || 'Not provided'}`;
    const user =
      `Inputs\n${inputs}\n\n` +
      `Computed chart context (Lahiri sidereal — use this for grounding, do not merely restate it):\n${summary}`;
    messages = [
      { role: 'system', content: DEEP_SYSTEM },
      { role: 'user', content: user },
    ];
    maxTokens = DEEP_MAX_TOKENS;
  } else {
    const focusLine = {
      overview: 'Give a balanced overview of personality, core strengths, and growth areas.',
      career: 'Focus on career direction, vocation, and professional strengths.',
      relationships: 'Focus on relationships, partnership style, and emotional needs.',
      current: 'Focus on the current Vimshottari Dasha period: its themes, opportunities, and cautions.',
    }[focus] || 'Give a balanced overview.';

    const system =
      'You are an experienced, compassionate Vedic astrologer (Jyotish). Interpret the birth ' +
      'chart using classical Vedic principles — signs (rasi), houses (bhava), nakshatras, planetary ' +
      'dignity, and Vimshottari dasha. Be insightful, encouraging, and specific to the placements ' +
      'given. Write 3-5 short paragraphs in clear language. Frame everything as tendencies and ' +
      'possibilities, never certainties. Do NOT give medical, legal, or financial advice.';
    const user = `Birth chart summary:\n${summary}\n\nTask: ${focusLine}`;
    messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  const putCache = (text, model) => ctx.waitUntil(
    caches.default.put(cacheReq, new Response(JSON.stringify({ text, model }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
    }))
  );

  let lastErr = 'unknown';

  // ── Primary: Groq (free tier) ────────────────────────────────────────────
  if (env.GROQ_API_KEY) {
    const model = env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
    try {
      const r = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: wantsStream }),
      });
      if (r.ok) {
        if (wantsStream) {
          // OpenAI-style SSE: data: {"choices":[{"delta":{"content":"..."}}]}
          return sseToTextResponse(r.body, model, (fullText) => {
            if (fullText) putCache(fullText, model);
          }, extractOpenAIDelta);
        }
        const data = await r.json();
        const text = data?.choices?.[0]?.message?.content || '';
        if (text) {
          putCache(text, model);
          return json({ text, model });
        }
        lastErr = 'empty response from ' + model;
      } else {
        lastErr = `Groq ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`;
      }
    } catch (e) {
      lastErr = 'Groq request failed: ' + ((e && e.message) || 'unknown');
    }
    // Any Groq failure falls through to Cloudflare Workers AI below.
  }

  // ── Fallback: Cloudflare Workers AI ──────────────────────────────────────
  if (!env.AI) return errorResponse(502, 'The AI service is temporarily unavailable. Please try again.', 'interpret: no fallback AI binding; ' + lastErr);
  for (const model of AI_MODELS) {
    try {
      if (wantsStream) {
        const aiStream = await env.AI.run(model, { messages, max_tokens: maxTokens, stream: true });
        return sseToTextResponse(aiStream, model, (fullText) => {
          if (fullText) putCache(fullText, model);
        });
      }
      const res = await env.AI.run(model, { messages, max_tokens: maxTokens });
      const text = (res && res.response) || '';
      if (text) {
        putCache(text, model);
        return json({ text, model });
      }
      lastErr = 'empty response from ' + model;
    } catch (e) {
      lastErr = (e && e.message) || 'unknown';
      // Only fall through on availability/deprecation-type errors; otherwise stop.
      if (!/deprecat|not found|no such model|unavailable|unsupported|50\d\d/i.test(lastErr)) break;
    }
  }
  return errorResponse(502, 'The AI service is temporarily unavailable. Please try again.', 'interpret: all providers failed; ' + lastErr);
}

// Token extractors for the two SSE shapes we consume.
// Cloudflare Workers AI: {"response":"tok"} ; OpenAI/Groq: {"choices":[{"delta":{"content":"tok"}}]}
function extractCfResponse(obj) { return obj?.response || ''; }
function extractOpenAIDelta(obj) { return obj?.choices?.[0]?.delta?.content || ''; }

// Wrap a plain string as a "stream" response (used for cache hits).
function textStreamResponse(text, model, source) {
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Model': model,
      'X-Source': source,
    },
  });
}

// Convert Workers AI SSE ("data: {\"response\":\"tok\"}") into a plain-text
// stream the client can read incrementally, accumulating the full text for
// the cache callback.
function sseToTextResponse(sseStream, model, onComplete, extract = extractCfResponse) {
  let buffer = '';
  let fullText = '';
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const transform = new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop(); // keep incomplete tail
      for (const evt of events) {
        for (const line of evt.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const tok = extract(JSON.parse(payload)) || '';
            if (tok) {
              fullText += tok;
              controller.enqueue(encoder.encode(tok));
            }
          } catch { /* ignore malformed keep-alives */ }
        }
      }
    },
    flush() {
      onComplete(fullText);
    },
  });
  return new Response(sseStream.pipeThrough(transform), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Model': model,
      'X-Source': 'model',
    },
  });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
