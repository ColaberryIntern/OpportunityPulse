// Deep Research Phase 7 — clusterDrilldown.service pure-logic tests.

const svc = require('../../src/deepResearch/clusterDrilldown.service');

describe('clusterDrilldown.topTerms', () => {
  it('returns empty for empty input', () => {
    expect(svc.topTerms([])).toEqual([]);
  });
  it('drops stop words + sorts by frequency', () => {
    // topTerms uses a 3+ char regex, so "ai" gets dropped along with stop words.
    const out = svc.topTerms([
      'rag for the federal government', 'rag for healthcare', 'data engineering for the government',
    ], { limit: 10 });
    const terms = out.map((t) => t.term);
    expect(terms).toContain('rag');
    expect(terms).toContain('government');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('for');
  });
});

describe('clusterDrilldown.summarizeBy', () => {
  it('drops single-occurrence values', () => {
    const opps = [{ sourceData: { agency_name: 'DOD' } }];
    const out = svc.summarizeBy(opps, (o) => o.sourceData.agency_name);
    expect(out).toEqual([]);
  });
  it('keeps values that recur', () => {
    const opps = [
      { sourceData: { agency_name: 'DOD' } },
      { sourceData: { agency_name: 'DOD' } },
      { sourceData: { agency_name: 'HHS' } },
    ];
    const out = svc.summarizeBy(opps, (o) => o.sourceData.agency_name);
    expect(out).toEqual([{ value: 'DOD', count: 2 }]);
  });
});

describe('clusterDrilldown.summarizeSources', () => {
  it('counts by source', () => {
    expect(svc.summarizeSources([
      { source: 'sam_gov' }, { source: 'sam_gov' }, { source: 'bonfire' },
    ])).toEqual({ sam_gov: 2, bonfire: 1 });
  });
});

describe('clusterDrilldown.buildDrilldown', () => {
  it('produces a shape with all expected facets', () => {
    const opps = [
      {
        id: 1, title: 'AI for the government', description: 'rag-based summarization',
        source: 'sam_gov', sourceData: { agency_name: 'DOD' },
      },
      {
        id: 2, title: 'AI for healthcare workers', description: 'machine learning',
        source: 'sam_gov', sourceData: { agency_name: 'DOD' },
      },
    ];
    const out = svc.buildDrilldown(opps);
    expect(out).toHaveProperty('themes');
    expect(out).toHaveProperty('agencies');
    expect(out).toHaveProperty('technologies');
    expect(out).toHaveProperty('vendors');
    expect(out).toHaveProperty('naics');
    expect(out).toHaveProperty('strategic_language');
    expect(out.sample_opportunity_ids).toEqual([1, 2]);
  });
});
