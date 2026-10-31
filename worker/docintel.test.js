import { describe, it, expect } from 'vitest';
import { layoutToPages } from './docintel.js';
import { mergeParsed, parsePages } from '../src/pdfParser.js';

describe('layoutToPages', () => {
  it('turns an analyzeResult into pdf.js-style page text and table grids', () => {
    const out = layoutToPages({
      pages: [{ lines: [{ content: 'Planetary Positions' }, { content: 'ASC' }] }, { lines: [] }],
      tables: [{ rowCount: 2, columnCount: 2, boundingRegions: [{ pageNumber: 1 }],
        cells: [{ rowIndex: 0, columnIndex: 0, content: 'Planet' }, { rowIndex: 1, columnIndex: 1, content: 'Leo' }] }],
    });
    expect(out.pages).toEqual(['Planetary Positions\nASC', '']);
    expect(out.tables[0]).toEqual({ page: 1, rows: [['Planet', ''], ['', 'Leo']] });
    expect(out.pageCount).toBe(2);
  });
  it('copes with an empty result', () => {
    expect(layoutToPages(undefined)).toEqual({ pages: [], tables: [], pageCount: 0 });
  });
});

describe('mergeParsed', () => {
  const empty = parsePages(['nothing useful here']);
  it('keeps the better source per section and recomputes overall confidence', () => {
    const alt = { ...empty, planets: { sun: { sign: 4 } }, confidence: { ...empty.confidence, planets: 1, chalit: 0.5 },
      birthDetails: { name: 'X' } };
    const m = mergeParsed(empty, alt);
    expect(m.planets).toEqual({ sun: { sign: 4 } });
    expect(m.birthDetails).toEqual({ name: 'X' });
    expect(m.docIntel.sections).toEqual(expect.arrayContaining(['planets', 'chalit', 'birthDetails']));
    expect(m.confidence.overall).toBeCloseTo((1 + 0.5) / 8);
  });
  it('never downgrades a section the primary parse already got', () => {
    const good = { ...empty, confidence: { ...empty.confidence, planets: 1 }, planets: { a: 1 } };
    const worse = { ...empty, confidence: { ...empty.confidence, planets: 0.3 }, planets: { b: 2 } };
    expect(mergeParsed(good, worse).planets).toEqual({ a: 1 });
  });
});
