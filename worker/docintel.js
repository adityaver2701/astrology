// ── Azure Document Intelligence (layout) — PDF text fallback ──────────────
//   POST /api/docintel/layout   body: the PDF bytes (Content-Type: application/pdf)
//     Auth: Supabase bearer token. Returns { pages: string[], tables, pageCount }
//     where pages[i] is that page's lines joined with "\n" — the same shape as
//     pdf.js output in src/pdfParser.js, so the existing section parsers can
//     run on it unchanged.
//
// The free F0 tier analyses only the FIRST 2 PAGES of each document and
// accepts files up to 4 MB (~500 pages/month). Upgrade the resource to S0 to
// read whole reports.
//
// Config: var DOCINTEL_ENDPOINT, secret DOCINTEL_KEY
//   npx wrangler secret put DOCINTEL_KEY

import { supabaseUser } from './push.js';

const API_VERSION = '2024-11-30';
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
const POLL_MS = 1500;
const POLL_LIMIT = 20; // ~30 s

/** Convert an analyzeResult into pdf.js-style per-page text + simple tables. */
export function layoutToPages(analyzeResult) {
  const pages = (analyzeResult?.pages || []).map((p) => (p.lines || []).map((l) => l.content).join('\n'));
  const tables = (analyzeResult?.tables || []).map((t) => {
    const rows = Array.from({ length: t.rowCount }, () => Array(t.columnCount).fill(''));
    for (const c of t.cells || []) rows[c.rowIndex][c.columnIndex] = c.content;
    return { page: t.boundingRegions?.[0]?.pageNumber || null, rows };
  });
  return { pages, tables, pageCount: pages.length };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function handleDocIntelLayout(request, env, json) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.DOCINTEL_ENDPOINT || !env.DOCINTEL_KEY) return json({ error: 'Document Intelligence is not configured.' }, 503);

  let user = null;
  try { user = await supabaseUser(request, env); } catch { /* fallthrough */ }
  if (!user) return json({ error: 'Please sign in.' }, 401);

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_PDF_BYTES) return json({ error: 'PDF is larger than 4 MB.' }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'Empty body.' }, 400);
  if (bytes.byteLength > MAX_PDF_BYTES) return json({ error: 'PDF is larger than 4 MB.' }, 413);
  const head = new Uint8Array(bytes, 0, 5);
  if (String.fromCharCode(...head) !== '%PDF-') return json({ error: 'Not a PDF.' }, 415);

  const base = env.DOCINTEL_ENDPOINT.replace(/\/+$/, '');
  const start = await fetch(
    `${base}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${API_VERSION}`,
    { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': env.DOCINTEL_KEY, 'Content-Type': 'application/pdf' }, body: bytes }
  );
  if (start.status !== 202) {
    console.error('docintel: analyze start failed', start.status, (await start.text().catch(() => '')).slice(0, 300));
    return json({ error: 'Document analysis failed to start.' }, 502);
  }
  const opUrl = start.headers.get('Operation-Location');
  for (let i = 0; i < POLL_LIMIT; i++) {
    await sleep(POLL_MS);
    const r = await fetch(opUrl, { headers: { 'Ocp-Apim-Subscription-Key': env.DOCINTEL_KEY } });
    const body = await r.json().catch(() => null);
    if (body?.status === 'succeeded') return json(layoutToPages(body.analyzeResult));
    if (body?.status === 'failed') {
      console.error('docintel: analysis failed', JSON.stringify(body.error || {}).slice(0, 300));
      return json({ error: 'Document analysis failed.' }, 502);
    }
  }
  return json({ error: 'Document analysis timed out.' }, 504);
}
