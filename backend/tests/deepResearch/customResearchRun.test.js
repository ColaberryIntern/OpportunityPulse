// Deep Research Phase 7 — customResearchRun.service pure-logic tests.

const svc = require('../../src/deepResearch/customResearchRun.service');

describe('customResearchRun.tokenize', () => {
  it('lowercases + drops short tokens', () => {
    expect(svc.tokenize('AI, video, generation, a')).toEqual(['ai', 'video', 'generation']);
  });
  it('splits on commas/spaces/semicolons/pipes', () => {
    expect(svc.tokenize('rag|llm; healthcare,defense')).toEqual([
      'rag', 'llm', 'healthcare', 'defense',
    ]);
  });
  it('returns empty for empty input', () => {
    expect(svc.tokenize('')).toEqual([]);
    expect(svc.tokenize(null)).toEqual([]);
  });
});

describe('customResearchRun.summarizeResults', () => {
  it('counts by type', () => {
    expect(svc.summarizeResults([
      { type: 'gov_contract' }, { type: 'gov_contract' }, { type: 'bonfire' },
    ])).toEqual({ gov_contract: 2, bonfire: 1 });
  });
});

describe('customResearchRun.compareRuns', () => {
  it('returns zero deltas for identical breakdowns', () => {
    const a = { match_count: 10, breakdown: { gov_contract: 5, bonfire: 5 } };
    const diff = svc.compareRuns(a, a);
    expect(diff.delta_match_count).toBe(0);
    expect(diff.channel_diffs.every((d) => d.delta === 0)).toBe(true);
  });
  it('reports per-channel deltas', () => {
    const a = { match_count: 10, breakdown: { gov_contract: 5, bonfire: 5 } };
    const b = { match_count: 12, breakdown: { gov_contract: 7, bonfire: 5 } };
    const diff = svc.compareRuns(a, b);
    expect(diff.delta_match_count).toBe(2);
    const gov = diff.channel_diffs.find((d) => d.channel === 'gov_contract');
    expect(gov.delta).toBe(2);
  });
});

describe('customResearchRun.buildWhereFromTokens', () => {
  it('returns minimal where for empty tokens', () => {
    const where = svc.buildWhereFromTokens([]);
    expect(where.status).toBe('active');
  });
  it('AND-joins per token with OR over title/description', () => {
    const where = svc.buildWhereFromTokens(['ai', 'defense']);
    expect(where.status).toBe('active');
    const Op = require('sequelize').Op;
    expect(Array.isArray(where[Op.and])).toBe(true);
    expect(where[Op.and]).toHaveLength(2);
  });
});
