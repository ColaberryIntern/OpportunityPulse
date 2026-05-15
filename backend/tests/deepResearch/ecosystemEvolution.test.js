// Deep Research Phase 5 — ecosystemEvolution.service tests.

const svc = require('../../src/deepResearch/ecosystemEvolution.service');

describe('ecosystemEvolution.classifyEcosystem', () => {
  it('classifies converging when many ventures are tagged elsewhere', () => {
    expect(svc.classifyEcosystem({
      healthScore: 60, maturityScore: 50, momentumScore: 50,
      ventureCount: 5, sharedVentureFraction: 0.8,
    })).toBe('converging');
  });
  it('classifies accelerating when momentum + health are strong', () => {
    expect(svc.classifyEcosystem({
      healthScore: 70, maturityScore: 50, momentumScore: 75,
      ventureCount: 4, sharedVentureFraction: 0.2,
    })).toBe('accelerating');
  });
  it('classifies saturated when mature but flat', () => {
    expect(svc.classifyEcosystem({
      healthScore: 60, maturityScore: 80, momentumScore: 20,
      ventureCount: 10, sharedVentureFraction: 0.1,
    })).toBe('saturated');
  });
  it('classifies declining when momentum + health both low', () => {
    expect(svc.classifyEcosystem({
      healthScore: 25, maturityScore: 50, momentumScore: 20,
      ventureCount: 4, sharedVentureFraction: 0.0,
    })).toBe('declining');
  });
  it('classifies emerging by default for small + early', () => {
    expect(svc.classifyEcosystem({
      healthScore: 50, maturityScore: 30, momentumScore: 50,
      ventureCount: 2, sharedVentureFraction: 0.0,
    })).toBe('emerging');
  });
  it('classifies dying when there are no matching ventures', () => {
    expect(svc.classifyEcosystem({
      healthScore: 0, maturityScore: 0, momentumScore: 0, ventureCount: 0, sharedVentureFraction: 0,
    })).toBe('dying');
  });
});

describe('ecosystemEvolution.computeEcosystem', () => {
  it('rolls up venture-level signals into the three ecosystem scores', () => {
    const template = {
      templateKey: 'ai_assistant', label: 'AI Assistant',
      applicableTo: [1, 2],
    };
    const ventures = [
      { id: 1, lifecycleState: 'building' },
      { id: 2, lifecycleState: 'evaluating' },
    ];
    const readinessByVenture = new Map([
      [1, { executionReadinessScore: 75 }],
      [2, { executionReadinessScore: 65 }],
    ]);
    const confidenceTrendByVenture = new Map([
      [1, 0.1], [2, -0.05],
    ]);
    const result = svc.computeEcosystem(template, ventures, readinessByVenture,
      confidenceTrendByVenture, [template]);
    expect(result.venture_count).toBe(2);
    expect(result.health_score).toBeGreaterThan(60);
    expect(result.maturity_score).toBeGreaterThan(30);
    expect(['emerging', 'accelerating', 'saturated', 'declining', 'converging']).toContain(result.classification);
  });
  it('reports zero scores + dying when no ventures match', () => {
    const template = { templateKey: 'k', label: 'K', applicableTo: [] };
    const result = svc.computeEcosystem(template, [{ id: 9 }], new Map(), new Map(), [template]);
    expect(result.venture_count).toBe(0);
    expect(result.classification).toBe('dying');
  });
});
