// Deep Research Phase 4 — sharedInfrastructure.service tests.

const svc = require('../../src/deepResearch/sharedInfrastructure.service');

const venture = (id) => ({ id, metadata: { suggested_architecture: '' } });

describe('sharedInfrastructure.buildFingerprint', () => {
  it('includes infra items, stack, ai components, and architecture tokens', () => {
    const v = { id: 1, metadata: { suggested_architecture: 'reuses the vector store and embedding pipeline' } };
    const er = { infrastructure: { items: ['Postgres database', 'Vector store'] } };
    const mvp = {
      suggestedStack: ['Node.js', 'Postgres'],
      recommendedAiComponents: ['OpenAI gpt-4o-mini', 'text-embedding-3-small'],
    };
    const fp = svc.buildFingerprint(v, er, mvp);
    expect(fp.has('arch:vector')).toBe(true);
    expect(fp.has('arch:embedding')).toBe(true);
    expect(fp.has('infra:postgres database')).toBe(true);
    expect(fp.has('stack:node.js')).toBe(true);
    expect(fp.has('ai:openai gpt-4o-mini')).toBe(true);
  });

  it('returns an empty set for a venture with nothing', () => {
    expect(svc.buildFingerprint(venture(2), null, null).size).toBe(0);
  });
});

describe('sharedInfrastructure.jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint', () => {
    expect(svc.jaccard(new Set(['a']), new Set(['a']))).toBe(1);
    expect(svc.jaccard(new Set(['a']), new Set(['b']))).toBe(0);
    expect(svc.jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});

describe('sharedInfrastructure.analyzeOverlaps', () => {
  it('detects pairs above the threshold and identifies portfolio-wide opportunities', () => {
    const ventures = [
      { id: 1, metadata: { suggested_architecture: 'vector embedding rag' } },
      { id: 2, metadata: { suggested_architecture: 'vector embedding agent' } },
      { id: 3, metadata: { suggested_architecture: 'vector workflow' } },
      { id: 4, metadata: { suggested_architecture: 'completely unrelated copywriting' } },
    ];
    const readinessByVenture = new Map();
    const mvpByVenture = new Map();
    const out = svc.analyzeOverlaps(ventures, readinessByVenture, mvpByVenture);
    // Pairs containing the 'vector' arch token should appear; venture 4 should not pair.
    expect(out.pairs.length).toBeGreaterThan(0);
    expect(out.pairs.every((p) => [p.venture_a_id, p.venture_b_id].every((id) => id !== 4))).toBe(true);
    // 'vector' is used by 3 ventures → shared build opportunity.
    expect(out.shared_opportunities.find((o) => o.component === 'arch:vector')).toBeTruthy();
  });
});
