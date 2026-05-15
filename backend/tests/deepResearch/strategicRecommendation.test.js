// Deep Research Phase 6 — strategicRecommendation.service pure-logic tests.

const svc = require('../../src/deepResearch/strategicRecommendation.service');

describe('strategicRecommendation.decisionFromReadiness', () => {
  it('extracts the decision out of a breakdown', () => {
    expect(svc.decisionFromReadiness({
      breakdown: { decision: { decision: 'BUILD_NOW' } },
    })).toBe('BUILD_NOW');
  });
  it('returns null when breakdown is empty', () => {
    expect(svc.decisionFromReadiness({})).toBeNull();
    expect(svc.decisionFromReadiness({ breakdown: {} })).toBeNull();
  });
});

describe('strategicRecommendation.rebalanceRec', () => {
  it('emits portfolio_rebalance when BUILD-heavy fraction > 0.7', async () => {
    // 3 active, 3 BUILD_NOW → 100% build-heavy.
    const ventures = [
      { id: 1, lifecycleState: 'evaluating' },
      { id: 2, lifecycleState: 'evaluating' },
      { id: 3, lifecycleState: 'evaluating' },
    ];
    const readinessRows = [
      { ventureIdeaId: 1, breakdown: { decision: { decision: 'BUILD_NOW' } } },
      { ventureIdeaId: 2, breakdown: { decision: { decision: 'BUILD_SOON' } } },
      { ventureIdeaId: 3, breakdown: { decision: { decision: 'BUILD_NOW' } } },
    ];
    const rec = await svc.rebalanceRec(readinessRows, ventures);
    expect(rec).toBeTruthy();
    expect(rec.type).toBe('portfolio_rebalance');
    expect(rec.supportingMetrics.fraction).toBeCloseTo(1, 2);
  });
  it('returns null when the portfolio is mixed', async () => {
    const ventures = [
      { id: 1, lifecycleState: 'evaluating' },
      { id: 2, lifecycleState: 'evaluating' },
      { id: 3, lifecycleState: 'evaluating' },
    ];
    const readinessRows = [
      { ventureIdeaId: 1, breakdown: { decision: { decision: 'BUILD_NOW' } } },
      { ventureIdeaId: 2, breakdown: { decision: { decision: 'MONITOR' } } },
      { ventureIdeaId: 3, breakdown: { decision: { decision: 'TOO_EARLY' } } },
    ];
    expect(await svc.rebalanceRec(readinessRows, ventures)).toBeNull();
  });
});
