// ── Admin AI chat ──────────────────────────────────────────────────────────
// POST /api/chat — an AI astrology chat, restricted to admin accounts. On
// every turn the worker loads the admin's own `astro_sync` row (their saved
// profiles), computes each profile's chart with the bundled astrology engine,
// and hands the lot to the model as grounding context so the admin can ask
// questions across everyone they've saved.
//
// Provider chain (first configured one wins):
//   1. Claude (paid)      — wrangler secret put ANTHROPIC_API_KEY
//   2. Groq (free tier)   — wrangler secret put GROQ_API_KEY
//   3. Cloudflare Workers AI (free allocation) — the AI binding
//
// ADMIN_EMAILS var in wrangler.jsonc lists the allowed accounts.
// The response streams back as plain text (same shape as /api/interpret with
// stream=true), so the client can render tokens as they arrive.

import Anthropic from '@anthropic-ai/sdk';
import {
  getJulianDate,
  calculatePlanets,
  calculateAscendantLongitude,
  calculateVimshottariDasha,
  getCurrentDasha,
  SIGNS,
} from '../src/astrologyEngine.js';
import { searchInterpretations, formatPassages } from './search.js';

const CLAUDE_MODEL = 'claude-opus-4-8';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const WORKERS_AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fast',
];
const MAX_OUTPUT_TOKENS = 4096;
const MAX_HISTORY_MESSAGES = 40;   // most recent turns kept
const MAX_MESSAGE_CHARS = 8000;    // per-message cap

const PLANET_LABELS = {
  sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', rahu: 'Rahu', ketu: 'Ketu',
};

const CHAT_SYSTEM = `You are an experienced, compassionate Vedic astrologer (Jyotish) assisting the owner of an astrology practice.
You are given the owner's saved client profiles below — birth details, computed sidereal (Lahiri) chart placements, current Vimshottari dasha, recorded life events, and notes.

Guidelines:
- Ground every answer in the actual placements provided. Name the specific planets, houses, nakshatras, or dasha periods you are reasoning from.
- When a question names a person, use that person's profile. When it doesn't, ask which profile they mean — or compare across profiles when that is clearly the intent.
- Use classical Vedic principles: rasi, bhava, nakshatra, planetary dignity, Vimshottari dasha, and Trik Bhava (6th/8th/12th) dynamics where relevant.
- Frame everything as tendencies and possibilities, never certainties. No medical, legal, or financial advice.
- Be specific and concise. Prefer a short, direct answer over an exhaustive essay unless asked for depth.`;

export async function handleChat(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.ANTHROPIC_API_KEY && !env.GROQ_API_KEY && !env.AI) {
    return json({ error: 'No AI provider is configured for the chat.' }, 503);
  }

  // ── Auth: valid Supabase session AND an admin email ─────────────────────
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ error: 'Please sign in to use the chat.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'Auth is not configured on this deployment.' }, 503);
  }

  let userId, email;
  try {
    const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!u.ok) return json({ error: 'Your session expired — please sign in again.' }, 401);
    const info = await u.json().catch(() => null);
    userId = info?.id;
    email = (info?.email || '').toLowerCase();
  } catch {
    return json({ error: 'Could not verify your session. Try again.' }, 503);
  }

  const admins = String(env.ADMIN_EMAILS || 'penetacle@gmail.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!userId || !admins.includes(email)) {
    return json({ error: 'The AI chat is available to admin accounts only.' }, 403);
  }

  // ── Parse the conversation ───────────────────────────────────────────────
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const history = Array.isArray(body.messages) ? body.messages : [];
  const messages = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'Send at least one user message.' }, 400);
  }

  // ── Load the admin's saved profiles (their own RLS-protected row) ────────
  let profiles = [];
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/astro_sync?user_id=eq.${encodeURIComponent(userId)}&select=data`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      profiles = rows?.[0]?.data?.savedProfiles || [];
    }
  } catch { /* fall through — chat still works, just without profile context */ }

  // RAG: pull the most relevant interpretation passages for the latest
  // question from Azure AI Search (no-op if not configured).
  const passages = await searchInterpretations(env, messages[messages.length - 1].content, 3);
  const profileContext = buildProfileContext(profiles) + formatPassages(passages);

  // ── Provider 1: Claude (only when the paid API key is configured) ────────
  if (env.ANTHROPIC_API_KEY) {
    return claudeStreamResponse(env, ctx, profileContext, messages);
  }

  // ── Provider 2: Groq free tier ───────────────────────────────────────────
  // OpenAI chat-completions shape: single system message + history.
  const oaMessages = [
    { role: 'system', content: `${CHAT_SYSTEM}\n\n${profileContext}` },
    ...messages,
  ];
  let lastErr = 'unknown';
  if (env.GROQ_API_KEY) {
    const model = env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
    try {
      const r = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages: oaMessages, max_tokens: MAX_OUTPUT_TOKENS, stream: true }),
      });
      if (r.ok) return sseToTextResponse(r.body, model, extractOpenAIDelta);
      lastErr = `Groq ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`;
    } catch (e) {
      lastErr = 'Groq request failed: ' + ((e && e.message) || 'unknown');
    }
  }

  // ── Provider 3: Cloudflare Workers AI (free allocation) ──────────────────
  if (env.AI) {
    for (const model of WORKERS_AI_MODELS) {
      try {
        const aiStream = await env.AI.run(model, { messages: oaMessages, max_tokens: MAX_OUTPUT_TOKENS, stream: true });
        return sseToTextResponse(aiStream, model, extractCfResponse);
      } catch (e) {
        lastErr = (e && e.message) || 'unknown';
        if (!/deprecat|not found|no such model|unavailable|unsupported|50\d\d/i.test(lastErr)) break;
      }
    }
  }
  return errorResponse(502, 'The AI service is temporarily unavailable. Please try again.', 'chat: all providers failed; ' + lastErr);
}

// ── Claude (streaming via the official SDK) ────────────────────────────────
function claudeStreamResponse(env, ctx, profileContext, messages) {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: CHAT_SYSTEM },
      // The profile block is stable across turns → prompt-cache it so each
      // follow-up question re-reads it at ~10% of the input price.
      { type: 'text', text: profileContext, cache_control: { type: 'ephemeral' } },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const pump = (async () => {
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          await writer.write(encoder.encode(event.delta.text));
        }
      }
    } catch (e) {
      // Log the real cause server-side; show the client only a correlation ID.
      const correlationId = crypto.randomUUID();
      console.error(`[${correlationId}] chat: claude stream failed`, (e && e.message) || e);
      await writer.write(encoder.encode(`\n\n⚠ The AI service hit an error (ref ${correlationId}). Please try again.`)).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  ctx.waitUntil(pump);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Model': CLAUDE_MODEL,
      'X-Source': 'claude',
    },
  });
}

// ── SSE → plain-text stream (Groq / Workers AI) ────────────────────────────
// Same shapes as /api/interpret: Groq is OpenAI-style deltas, Workers AI is
// {"response":"tok"} events.
function extractCfResponse(obj) { return obj?.response || ''; }
function extractOpenAIDelta(obj) { return obj?.choices?.[0]?.delta?.content || ''; }

function sseToTextResponse(sseStream, model, extract) {
  let buffer = '';
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
            if (tok) controller.enqueue(encoder.encode(tok));
          } catch { /* ignore malformed keep-alives */ }
        }
      }
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

// ── Profile → prompt context ───────────────────────────────────────────────
// One compact block per saved profile: birth data, computed placements,
// current dasha, life events, notes. Chart math mirrors App.jsx
// handleGenerateNatal (UTC-shifted birth time, Lahiri sidereal).
function buildProfileContext(profiles) {
  if (!profiles.length) {
    return 'No saved profiles were found in the admin account. Answer general Vedic astrology questions, and suggest saving a profile (Birth & Location tab) to get chart-grounded answers.';
  }
  const blocks = profiles.map((p, i) => {
    const bd = p.birthDetails || {};
    const head = `## Profile ${i + 1}: ${p.profileName || bd.name || '(unnamed)'}`;
    const birthLine = `Born ${bd.date || '?'} at ${bd.time || '?'} in ${bd.placeName || 'unknown place'} ` +
      `(lat ${bd.latitude ?? '?'}, lon ${bd.longitude ?? '?'}, UTC${fmtTz(bd.timezone)}).`;

    let chartLines = 'Chart could not be computed (incomplete birth data).';
    try {
      if (bd.date && typeof bd.latitude === 'number' && typeof bd.longitude === 'number') {
        chartLines = computeChartSummary(bd);
      }
    } catch { /* keep fallback text */ }

    const events = Array.isArray(p.lifeEvents) && p.lifeEvents.length
      ? 'Recorded life events:\n' + p.lifeEvents
          .map(ev => `- ${ev.name || 'event'} (${ev.startDate || '?'}${ev.endDate && ev.endDate !== ev.startDate ? ` → ${ev.endDate}` : ''})`)
          .join('\n')
      : 'No recorded life events.';
    const notes = p.notes ? `Notes: ${p.notes}` : '';

    return [head, birthLine, chartLines, events, notes].filter(Boolean).join('\n');
  });

  return `# Saved profiles (${profiles.length})\n\n${blocks.join('\n\n')}`;
}

function computeChartSummary(bd) {
  const birthLocal = new Date(`${bd.date}T${bd.time || '12:00'}Z`);
  const birthUtc = new Date(birthLocal.getTime() - (bd.timezone || 0) * 3600000);
  const jd = getJulianDate(birthUtc);
  const { planets } = calculatePlanets(jd);
  const lagnaLon = calculateAscendantLongitude(jd, bd.longitude, bd.latitude);
  const lagnaSign = Math.floor(lagnaLon / 30);

  const lines = Object.keys(planets).map(k => {
    const pl = planets[k];
    const house = ((pl.signIndex - lagnaSign + 12) % 12) + 1;
    return `- ${PLANET_LABELS[pl.id] || pl.id}: ${pl.signName} (house ${house}), ${pl.nakshatraName} nakshatra pada ${pl.pada}${pl.retrograde ? ', retrograde' : ''}`;
  });

  let dashaStr = '';
  try {
    const dashas = calculateVimshottariDasha(jd, planets.moon.longitude);
    const cur = getCurrentDasha(dashas, new Date()) || {};
    if (cur.currentMahadasha) {
      dashaStr = `\nCurrent Vimshottari Dasha: ${cur.currentMahadasha.lord} Mahadasha` +
        (cur.currentAntardasha ? ` / ${cur.currentAntardasha.lord} Antardasha` : '') + '.';
    }
  } catch { /* dasha optional */ }

  return `Ascendant (Lagna): ${SIGNS[lagnaSign]?.name || '?'}.\nPlanetary placements (Lahiri sidereal):\n${lines.join('\n')}${dashaStr}`;
}

function fmtTz(tz) {
  if (typeof tz !== 'number') return '±?';
  const sign = tz >= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Generic client message + a correlation ID; the detailed cause is logged
// server-side only (never returned to the client).
function errorResponse(status, clientMessage, detail) {
  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}]`, detail);
  return json({ error: clientMessage, correlationId }, status);
}
