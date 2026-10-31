// ── RAG corpus: the app's interpretation texts as search documents ─────────
// Shared by scripts/build-search-index.mjs (Azure AI Search) and any future
// pgvector loader, so both stores index exactly the same passages and the two
// retrieval back-ends can be compared like for like.

import { DUSTHANA_INTERPRETATIONS } from './dusthanaInterpretations.js';

const ordinal = (n) => `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10] || 'th'}`;

/** @returns {Array<{id:string,title:string,category:string,lord:number,house:number,content:string}>} */
export function buildInterpretationDocs() {
  const docs = [];
  for (const [key, byHouse] of Object.entries(DUSTHANA_INTERPRETATIONS)) {
    const lord = Number(key.replace('lord', ''));
    for (const [house, content] of Object.entries(byHouse)) {
      docs.push({
        id: `${key}-h${house}`,
        title: `${ordinal(lord)} lord in the ${ordinal(Number(house))} house`,
        category: 'dusthana-lord',
        lord,
        house: Number(house),
        content,
      });
    }
  }
  return docs;
}
