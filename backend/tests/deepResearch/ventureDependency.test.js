// Deep Research Phase 4 — ventureDependency.service tests.

const svc = require('../../src/deepResearch/ventureDependency.service');

describe('ventureDependency.staffingFingerprint', () => {
  it('returns a lowercased role set', () => {
    const fp = svc.staffingFingerprint({ staffing: { roles: ['Tech Lead', 'AI/ML Engineer'] } });
    expect(fp.has('tech lead')).toBe(true);
    expect(fp.has('ai/ml engineer')).toBe(true);
  });
});

describe('ventureDependency.aiProviderFingerprint', () => {
  it('picks explicit providers from the recommended-AI text', () => {
    const fp = svc.aiProviderFingerprint({ recommendedAiComponents: ['OpenAI gpt-4o', 'embeddings'] });
    expect(fp.has('openai')).toBe(true);
  });
  it('falls back to the implicit default when no explicit provider is named', () => {
    const fp = svc.aiProviderFingerprint({ recommendedAiComponents: ['LLM for classification'] });
    expect(fp.has('default')).toBe(true);
  });
});

describe('ventureDependency.staffingEdge', () => {
  it('skips a single common non-scarce role', () => {
    const e = svc.staffingEdge(1, new Set(['full-stack engineer']), 2, new Set(['full-stack engineer']));
    expect(e).toBeNull();
  });
  it('emits an edge when ventures share scarce roles', () => {
    const e = svc.staffingEdge(1, new Set(['tech lead', 'ai/ml engineer']), 2, new Set(['tech lead']));
    expect(e).toBeTruthy();
    expect(e.metadata.scarce_roles).toContain('tech lead');
    expect(e.risk_score).toBeGreaterThan(0);
  });
});

describe('ventureDependency.buildGraph', () => {
  it('builds nodes, edges, and sequencing constraints for the portfolio', () => {
    const ventures = [
      { id: 1, title: 'A', lifecycleState: 'evaluating' },
      { id: 2, title: 'B', lifecycleState: 'approved' },
    ];
    const readinessByVenture = new Map([
      [1, { staffing: { roles: ['Tech lead', 'AI/ML engineer'] } }],
      [2, { staffing: { roles: ['Tech lead'] } }],
    ]);
    const mvpByVenture = new Map([
      [1, { recommendedAiComponents: ['OpenAI gpt-4o-mini'] }],
      [2, { recommendedAiComponents: ['OpenAI text-embedding-3-small'] }],
    ]);
    const archPairs = [{
      venture_a_id: 1, venture_b_id: 2, overlap_score: 0.6,
      shared_components: ['arch:vector', 'arch:embedding'],
    }];
    const graph = svc.buildGraph(ventures, readinessByVenture, mvpByVenture, archPairs);
    expect(graph.nodes).toHaveLength(2);
    // Architecture edge + staffing edge + AI provider edge all expected.
    const types = new Set(graph.edges.map((e) => e.dependency_type));
    expect(types.has('shared_architecture')).toBe(true);
    expect(types.has('shared_staffing')).toBe(true);
    expect(types.has('shared_ai_provider')).toBe(true);
    expect(graph.nodes[0].dependency_risk).toBeGreaterThan(0);
    expect(graph.sequencing_constraints.length).toBeGreaterThan(0);
  });
});
