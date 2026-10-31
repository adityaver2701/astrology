// Create/refresh the Azure AI Search index used for RAG.
//   node --env-file=.env.azure scripts/build-search-index.mjs
// Needs AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY (admin key — local
// use only; the Worker uses a read-only query key).
import { buildInterpretationDocs } from '../src/searchCorpus.js';

const API = '2024-07-01';
export const INDEX_NAME = 'astro-interpretations';
const endpoint = (process.env.AZURE_SEARCH_ENDPOINT || '').replace(/\/+$/, '');
const key = process.env.AZURE_SEARCH_ADMIN_KEY;
if (!endpoint || !key || key.startsWith('__')) {
  console.error('Set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY (e.g. in .env.azure).');
  process.exit(1);
}
const headers = { 'api-key': key, 'Content-Type': 'application/json' };

const schema = {
  name: INDEX_NAME,
  fields: [
    { name: 'id', type: 'Edm.String', key: true, filterable: true },
    { name: 'title', type: 'Edm.String', searchable: true, analyzer: 'en.microsoft' },
    { name: 'category', type: 'Edm.String', filterable: true, facetable: true },
    { name: 'lord', type: 'Edm.Int32', filterable: true },
    { name: 'house', type: 'Edm.Int32', filterable: true },
    { name: 'content', type: 'Edm.String', searchable: true, analyzer: 'en.microsoft' },
  ],
};

const put = await fetch(`${endpoint}/indexes/${INDEX_NAME}?api-version=${API}`, { method: 'PUT', headers, body: JSON.stringify(schema) });
if (!put.ok) { console.error('Index create failed', put.status, await put.text()); process.exit(1); }
console.log(`Index ${INDEX_NAME}: ${put.status === 201 ? 'created' : 'updated'}`);

const docs = buildInterpretationDocs().map((d) => ({ '@search.action': 'mergeOrUpload', ...d }));
const up = await fetch(`${endpoint}/indexes/${INDEX_NAME}/docs/index?api-version=${API}`, { method: 'POST', headers, body: JSON.stringify({ value: docs }) });
const res = await up.json().catch(() => ({}));
const ok = (res.value || []).filter((r) => r.status).length;
console.log(`Uploaded ${ok}/${docs.length} documents (HTTP ${up.status})`);
if (!up.ok || ok !== docs.length) process.exit(1);
