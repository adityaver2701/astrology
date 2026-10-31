// ── Azure AI Search retrieval (RAG) ───────────────────────────────────────
// Keyword (BM25) search over the `astro-interpretations` index built by
// scripts/build-search-index.mjs. Used to ground /api/chat, and exposed as
//   GET /api/search?q=...   (signed-in users) for testing / pgvector comparison.
// Config: var AZURE_SEARCH_ENDPOINT, secret AZURE_SEARCH_QUERY_KEY (read-only).
// Fail-soft: returns [] when unconfigured or on error, so chat still works.

import { supabaseUser } from './push.js';

const API = '2024-07-01';
export const INDEX_NAME = 'astro-interpretations';

export async function searchInterpretations(env, query, top = 3) {
  const q = String(query || '').trim().slice(0, 500);
  if (!q || !env.AZURE_SEARCH_ENDPOINT || !env.AZURE_SEARCH_QUERY_KEY) return [];
  try {
    const base = env.AZURE_SEARCH_ENDPOINT.replace(/\/+$/, '');
    const r = await fetch(`${base}/indexes/${INDEX_NAME}/docs/search?api-version=${API}`, {
      method: 'POST',
      headers: { 'api-key': env.AZURE_SEARCH_QUERY_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: q, searchMode: 'any', queryType: 'simple', top, select: 'id,title,content' }),
    });
    if (!r.ok) { console.error('search: query failed', r.status); return []; }
    const body = await r.json();
    return (body.value || []).map((d) => ({ id: d.id, title: d.title, content: d.content, score: d['@search.score'] }));
  } catch (e) {
    console.error('search: error', e && e.message);
    return [];
  }
}

/** Format passages as a grounding block for the model prompt. */
export function formatPassages(passages) {
  if (!passages.length) return '';
  return '\n\n## Reference passages (retrieved from the app\'s interpretation library)\n'
    + passages.map((p, i) => `[${i + 1}] ${p.title}: ${p.content}`).join('\n')
    + '\nUse these where relevant and cite them as [1], [2]...';
}

export async function handleSearch(request, env, json) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  let user = null;
  try { user = await supabaseUser(request, env); } catch { /* fallthrough */ }
  if (!user) return json({ error: 'Please sign in.' }, 401);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  if (!q.trim()) return json({ error: 'Missing q' }, 400);
  const top = Math.min(Math.max(Number(url.searchParams.get('top')) || 5, 1), 10);
  return json({ query: q, results: await searchInterpretations(env, q, top) });
}
