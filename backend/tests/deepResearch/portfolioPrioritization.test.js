// Deep Research Phase 4 — portfolioPrioritization.service tests.

const svc = require('../../src/deepResearch/portfolioPrioritization.service');

describe('portfolioPrioritization.roiPotentialScore', () => {
  it('maps known ROI values onto 0-100', () => {
    expect(svc.roiPotentialScore(null)).toBe(40);
    expect(svc.roiPotentialScore(0)).toBe(50);
    expect(svc.roiPotentialScore(2)).toBeGreaterThan(70);
    expect(svc.roiPotentialScore(-1)).toBeLessThan(50);
  });
});

describe('portfolioPrioritization.resourcePressurePenaltyScore', () => {
  it('is mild below 60, sharp above', () => {
    expect(svc.resourcePressurePenaltyScore(40)).toBeLessThan(20);
    expect(svc.resourcePressurePenaltyScore(85)).toBeGreaterThan(60);
  });
});

describe('portfolioPrioritization.scoreVenture', () => {
  const base = {
    compositeScore: 75, executionScore: 70, decision: 'BUILD_NOW',
    marketStage: 'breakout', roi12mo: 1.2, staffingPressure: 50, reuseBonus: 20,
  };
  it('produces a 0-100 portfolio score with the explainable factor breakdown', () => {
    const out = svc.scoreVenture(base);
    expect(out.portfolio_score).toBeGreaterThanOrEqual(0);
    expect(out.portfolio_score).toBeLessThanOrEqual(100);
    expect(out.factors.composite_score).toBe(75);
    expect(out.factors.decision_weight).toBe(100); // BUILD_NOW
  });
  it('drops the score when org pressure is high', () => {
    const calm = svc.scoreVenture({ ...base, staffingPressure: 30 });
    const strained = svc.scoreVenture({ ...base, staffingPressure: 90 });
    expect(strained.portfolio_score).toBeLessThan(calm.portfolio_score);
  });
  it('is deterministic', () => {
    expect(svc.scoreVenture(base)).toEqual(svc.scoreVenture(base));
  });
});

describe('portfolioPrioritization.sequencingFromScore', () => {
  it('passes on OVERSATURATED / HIGH_RISK regardless of score', () => {
    expect(svc.sequencingFromScore(85, 'OVERSATURATED')).toBe('pass');
    expect(svc.sequencingFromScore(80, 'HIGH_RISK')).toBe('pass');
  });
  it('monitors TOO_EARLY', () => {
    expect(svc.sequencingFromScore(70, 'TOO_EARLY')).toBe('monitor');
  });
  it('executes_now only for strong BUILD_NOW', () => {
    expect(svc.sequencingFromScore(80, 'BUILD_NOW')).toBe('execute_now');
    expect(svc.sequencingFromScore(70, 'BUILD_NOW')).toBe('queue');
  });
});

describe('portfolioPrioritization.rankPortfolio', () => {
  it('ranks ventures highest-score-first and writes sequencing + rationale', () => {
    const ventures = [
      { id: 1, title: 'A', compositeScore: 80 },
      { id: 2, title: 'B', compositeScore: 50 },
    ];
    const readinessByVenture = new Map([
      [1, { executionReadinessScore: 75, breakdown: { decision: { decision: 'BUILD_NOW' } } }],
      [2, { executionReadinessScore: 45, breakdown: { decision: { decision: 'MONITOR' } } }],
    ]);
    const ranked = svc.rankPortfolio({
      ventureIdeas: ventures,
      readinessByVenture,
      latestRoiByVenture: new Map([[1, 1.0], [2, 0.2]]),
      capacitySnapshot: { staffing_pressure: 50 },
      overlapMap: new Map(),
    });
    expect(ranked[0].venture_idea_id).toBe(1);
    expect(ranked[0].portfolio_rank).toBe(1);
    expect(ranked[0].sequencing_recommendation).toBeTruthy();
    expect(ranked[0].rationale).toBeTruthy();
  });
});
