// Deep Research Phase 5 — strategicDrift.service tests.

const svc = require('../../src/deepResearch/strategicDrift.service');

describe('strategicDrift.checkEcosystemOvercommitment', () => {
  it('returns null when no single ecosystem dominates', () => {
    // 5 ventures, max ecosystem holds 2 → 40% < 50% threshold.
    const ventures = [
      { id: 1, lifecycleState: 'evaluating' }, { id: 2, lifecycleState: 'evaluating' },
      { id: 3, lifecycleState: 'evaluating' }, { id: 4, lifecycleState: 'evaluating' },
      { id: 5, lifecycleState: 'evaluating' },
    ];
    const templates = [
      { templateKey: 'a', label: 'A', applicableTo: [1, 2] },
      { templateKey: 'b', label: 'B', applicableTo: [3, 4] },
      { templateKey: 'c', label: 'C', applicableTo: [5] },
    ];
    expect(svc.checkEcosystemOvercommitment({ ventures, templates })).toBeNull();
  });
  it('flags when one ecosystem captures more than the threshold', () => {
    const ventures = [
      { id: 1, lifecycleState: 'evaluating' }, { id: 2, lifecycleState: 'evaluating' },
      { id: 3, lifecycleState: 'evaluating' }, { id: 4, lifecycleState: 'evaluating' },
    ];
    const templates = [
      { templateKey: 'a', label: 'A', applicableTo: [1, 2, 3] },
      { templateKey: 'b', label: 'B', applicableTo: [4] },
    ];
    const alert = svc.checkEcosystemOvercommitment({ ventures, templates });
    expect(alert).toBeTruthy();
    expect(alert.driftType).toBe('ecosystem_overcommitment');
    expect(alert.severity).toBeGreaterThan(50);
  });
});

describe('strategicDrift.checkRiskConcentration', () => {
  it('flags when >40% of ventures are HIGH_RISK / OVERSATURATED / TOO_EARLY', () => {
    const ventures = [
      { id: 1, lifecycleState: 'evaluating' }, { id: 2, lifecycleState: 'evaluating' },
      { id: 3, lifecycleState: 'evaluating' },
    ];
    const readinessByVenture = new Map([
      [1, { breakdown: { decision: { decision: 'HIGH_RISK' } } }],
      [2, { breakdown: { decision: { decision: 'OVERSATURATED' } } }],
      [3, { breakdown: { decision: { decision: 'BUILD_NOW' } } }],
    ]);
    const alert = svc.checkRiskConcentration({ ventures, readinessByVenture });
    expect(alert).toBeTruthy();
    expect(alert.driftType).toBe('risk_concentration');
  });
});

describe('strategicDrift.checkExecutionOverload', () => {
  it('flags when staffing pressure exceeds the overload threshold', () => {
    expect(svc.checkExecutionOverload({ capacitySnapshot: { staffing_pressure: 90 } }))
      .toMatchObject({ driftType: 'execution_overload' });
    expect(svc.checkExecutionOverload({ capacitySnapshot: { staffing_pressure: 50 } })).toBeNull();
  });
});

describe('strategicDrift.checkPortfolioImbalance', () => {
  it('flags when ventures cluster in too few ecosystems', () => {
    const ventures = [
      { id: 1, lifecycleState: 'evaluating' }, { id: 2, lifecycleState: 'evaluating' },
      { id: 3, lifecycleState: 'evaluating' },
    ];
    const templates = [
      { templateKey: 'a', label: 'A', applicableTo: [1, 2, 3] },
    ];
    expect(svc.checkPortfolioImbalance({ ventures, templates })).toMatchObject({
      driftType: 'portfolio_imbalance',
    });
  });
});

describe('strategicDrift.checkStrategyDrift', () => {
  it('flags stuck-too-long ventures', () => {
    const stuckSince = new Date(Date.now() - 60 * 86400000);
    const ventures = [{ id: 1, lifecycleState: 'evaluating', createdAt: stuckSince }];
    const lifecycleEventsByVenture = new Map([[1, [{ createdAt: stuckSince }]]]);
    const alert = svc.checkStrategyDrift({ ventures, lifecycleEventsByVenture });
    expect(alert).toMatchObject({ driftType: 'strategy_drift' });
    expect(alert.relatedVentureIds).toEqual([1]);
  });
  it('returns null when nothing is stuck', () => {
    const fresh = new Date();
    const ventures = [{ id: 1, lifecycleState: 'evaluating', createdAt: fresh }];
    const lifecycleEventsByVenture = new Map([[1, [{ createdAt: fresh }]]]);
    expect(svc.checkStrategyDrift({ ventures, lifecycleEventsByVenture })).toBeNull();
  });
});
