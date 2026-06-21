// ── Cloudflare Worker entry ───────────────────────────────────────────────
// Serves the built SPA from the ASSETS binding and adds a small JSON API.
//   POST /api/interpret  → Vedic-astrology reading via Cloudflare Workers AI
// Everything else falls through to static assets (SPA fallback handled by the
// assets binding's not_found_handling = "single-page-application").

const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/interpret') return handleInterpret(request, env);
    if (url.pathname.startsWith('/api/')) return json({ error: 'Unknown endpoint' }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function handleInterpret(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Require a valid Supabase session so the AI endpoint isn't open to the world.
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ error: 'Please sign in to use AI readings.' }, 401);
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      if (!u.ok) return json({ error: 'Your session expired — please sign in again.' }, 401);
    } catch {
      return json({ error: 'Could not verify your session. Try again.' }, 503);
    }
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const summary = String(body.summary || '').slice(0, 4000);
  const focus = String(body.focus || 'overview');
  if (!summary) return json({ error: 'No chart data provided.' }, 400);

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

  try {
    const res = await env.AI.run(AI_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 900,
    });
    return json({ text: (res && res.response) || '' });
  } catch (e) {
    return json({ error: 'AI service error: ' + ((e && e.message) || 'unknown') }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
