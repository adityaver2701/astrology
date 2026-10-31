import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildInterpretationDocs } from '../src/searchCorpus.js';
import { searchInterpretations, formatPassages } from './search.js';

describe('buildInterpretationDocs', () => {
  const docs = buildInterpretationDocs();
  it('has one document per lord/house with unique ids', () => {
    expect(docs).toHaveLength(36);
    expect(new Set(docs.map((d) => d.id)).size).toBe(36);
  });
  it('gives readable titles with correct ordinals', () => {
    const t = Object.fromEntries(docs.map((d) => [d.id, d.title]));
    expect(t['lord6-h1']).toBe('6th lord in the 1st house');
    expect(t['lord8-h2']).toBe('8th lord in the 2nd house');
    expect(t['lord12-h3']).toBe('12th lord in the 3rd house');
    expect(t['lord12-h11']).toBe('12th lord in the 11th house');
    expect(t['lord12-h12']).toBe('12th lord in the 12th house');
  });
});

describe('searchInterpretations', () => {
  afterEach(() => vi.restoreAllMocks());
  const env = { AZURE_SEARCH_ENDPOINT: 'https://x.search.windows.net/', AZURE_SEARCH_QUERY_KEY: 'k' };

  it('returns [] without config or query (fail-soft)', async () => {
    expect(await searchInterpretations({}, 'saturn')).toEqual([]);
    expect(await searchInterpretations(env, '  ')).toEqual([]);
  });

  it('maps search hits and sends the query key', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      value: [{ id: 'lord8-h8', title: '8th lord in the 8th house', content: 'Sarala…', '@search.score': 3.2 }],
    }), { status: 200 }));
    const out = await searchInterpretations(env, 'longevity occult', 3);
    expect(out).toEqual([{ id: 'lord8-h8', title: '8th lord in the 8th house', content: 'Sarala…', score: 3.2 }]);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://x.search.windows.net/indexes/astro-interpretations/docs/search?api-version=2024-07-01');
    expect(init.headers['api-key']).toBe('k');
    expect(JSON.parse(init.body)).toMatchObject({ search: 'longevity occult', top: 3 });
  });

  it('returns [] when the service errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await searchInterpretations(env, 'saturn')).toEqual([]);
  });
});

describe('formatPassages', () => {
  it('numbers passages for citation, and is empty for none', () => {
    expect(formatPassages([])).toBe('');
    expect(formatPassages([{ title: 'A', content: 'x' }])).toContain('[1] A: x');
  });
});
