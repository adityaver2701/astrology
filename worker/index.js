// ── Cloudflare Worker entry ───────────────────────────────────────────────
// Serves the built SPA from the ASSETS binding and adds a small JSON API.
//   POST /api/interpret  → Vedic-astrology reading via Cloudflare Workers AI
//                          (auth-gated, per-user rate-limited, cached, and
//                          streamed as plain text when body.stream === true)
//   GET  /api/health     → Supabase reachability probe for uptime monitors
// Everything else falls through to static assets (SPA fallback handled by the
// assets binding's not_found_handling = "single-page-application").

import { sendTransitAlerts } from './alerts.js';

// Tried in order; if one is deprecated/unavailable we fall through to the next.
const AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
];

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
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return handleHealth(env);
    if (url.pathname === '/api/interpret') return handleInterpret(request, env, ctx);
    if (url.pathname.startsWith('/api/')) return json({ error: 'Unknown endpoint' }, 404);
    return env.ASSETS.fetch(request);
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

// ── Health check ──────────────────────────────────────────────────────────
async function handleHealth(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ ok: true, supabase: 'unconfigured' });
  }
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return json({ ok: false, supabase: 'unhealthy', status: r.status }, 503);
    return json({ ok: true, supabase: 'healthy' });
  } catch (e) {
    return json({ ok: false, supabase: 'unreachable', error: (e && e.message) || 'unknown' }, 503);
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
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ error: 'Please sign in to use AI readings.' }, 401);
  let userId = 'anonymous';
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      if (!u.ok) return json({ error: 'Your session expired — please sign in again.' }, 401);
      const userInfo = await u.json().catch(() => null);
      userId = userInfo?.id || 'anonymous';
    } catch {
      return json({ error: 'Could not verify your session. Try again.' }, 503);
    }
  }

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
  return json({ error: 'AI service error: ' + lastErr }, 502);
}

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
function sseToTextResponse(sseStream, model, onComplete) {
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
            const tok = JSON.parse(payload)?.response || '';
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
