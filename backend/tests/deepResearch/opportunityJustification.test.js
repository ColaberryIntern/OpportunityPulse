// Deep Research Phase 7 — opportunityJustification.service pure-logic tests.

const svc = require('../../src/deepResearch/opportunityJustification.service');

describe('opportunityJustification.summarizeChannels', () => {
  it('counts by type', () => {
    expect(svc.summarizeChannels([
      { type: 'gov_contract' }, { type: 'gov_contract' }, { type: 'bonfire' },
    ])).toEqual({ gov_contract: 2, bonfire: 1 });
  });
  it('uses "unknown" for missing type', () => {
    expect(svc.summarizeChannels([{}])).toEqual({ unknown: 1 });
  });
});

describe('opportunityJustification.computeFactors', () => {
  it('returns empty for empty input', () => {
    expect(svc.computeFactors([])).toEqual([]);
  });
  it('produces a channel factor + an ai_score factor when scores are present', () => {
    const factors = svc.computeFactors([
      { type: 'gov_contract', aiScore: 80 },
      { type: 'gov_contract', aiScore: 90 },
    ]);
    const labels = factors.map((f) => f.channel);
    expect(labels).toEqual(expect.arrayContaining(['gov_contract', 'ai_score']));
  });
  it('skips ai_score factor when scores are zero', () => {
    const factors = svc.computeFactors([{ type: 'gov_contract', aiScore: 0 }]);
    expect(factors.every((f) => f.channel !== 'ai_score')).toBe(true);
  });
});

describe('opportunityJustification.composeHeadline', () => {
  it('reports no-evidence state cleanly', () => {
    expect(svc.composeHeadline('venture', [])).toMatch(/no traced evidence/i);
  });
  it('mentions the dominant channel', () => {
    const h = svc.composeHeadline('cluster', [
      { type: 'gov_contract' }, { type: 'gov_contract' }, { type: 'bonfire' },
    ]);
    expect(h).toMatch(/gov_contract/);
    expect(h).toMatch(/3 supporting/);
  });
});

describe('opportunityJustification.deriveConfidence', () => {
  it('is zero with no evidence', () => {
    expect(svc.deriveConfidence([])).toBe(0);
  });
  it('rises with volume + mean relevance', () => {
    const low = svc.deriveConfidence([
      { _trace: { relevance: 30 } }, { _trace: { relevance: 40 } },
    ]);
    const high = svc.deriveConfidence(
      Array.from({ length: 20 }, () => ({ _trace: { relevance: 90 } })),
    );
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
  });
});
