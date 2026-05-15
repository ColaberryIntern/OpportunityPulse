// Deep Research Phase 4 — resourceCapacity.service tests.

const svc = require('../../src/deepResearch/resourceCapacity.service');

const supply = {
  total_headcount: 5,
  roles: { 'tech lead': 1, 'full-stack engineer': 2, 'ai/ml engineer': 1 },
  infra_slots: 8,
  avg_team_size: 3,
};

function readiness(ventureId, headcount, roles, infraItems = 3, decision = null) {
  return {
    ventureIdeaId: ventureId,
    staffing: { headcount, roles },
    infrastructure: { items: Array(infraItems).fill('item') },
    breakdown: decision ? { decision: { decision } } : {},
  };
}
function venture(id, state) {
  return { id, title: `V${id}`, lifecycleState: state };
}

describe('resourceCapacity.aggregateDemand', () => {
  it('only counts ventures in active lifecycle states', () => {
    const ventures = [venture(1, 'evaluating'), venture(2, 'archived'), venture(3, 'building')];
    const map = new Map(ventures.map((v) => [v.id, v]));
    const r = [readiness(1, 2, ['tech lead', 'full-stack engineer']),
      readiness(2, 5, ['tech lead']),
      readiness(3, 3, ['tech lead', 'ai/ml engineer', 'full-stack engineer'])];
    const out = svc.aggregateDemand(r, map);
    expect(out.totalHeadcount).toBe(5); // 2 + 3, archived excluded
    expect(out.roleDemand['tech lead']).toBe(2);
    expect(out.roleDemand['ai/ml engineer']).toBe(1);
  });
});

describe('resourceCapacity.identifyBottlenecks', () => {
  it('flags missing roles and role deficits', () => {
    const bottlenecks = svc.identifyBottlenecks(
      { 'tech lead': 3, 'rare specialist': 2 }, supply, 50, 50,
    );
    expect(bottlenecks.find((b) => b.type === 'role_deficit')).toBeTruthy();
    expect(bottlenecks.find((b) => b.type === 'missing_role')).toBeTruthy();
  });
  it('flags overall pressure when high', () => {
    const bottlenecks = svc.identifyBottlenecks({}, supply, 85, 90);
    expect(bottlenecks.find((b) => b.type === 'staffing_pressure')).toBeTruthy();
    expect(bottlenecks.find((b) => b.type === 'infra_pressure')).toBeTruthy();
  });
});

describe('resourceCapacity.computeCapacity', () => {
  it('computes pressures, concurrency, and counts BUILD_NOW ventures', () => {
    const ventures = [venture(1, 'evaluating'), venture(2, 'building')];
    const r = [
      readiness(1, 3, ['tech lead', 'full-stack engineer', 'ai/ml engineer'], 4, 'BUILD_NOW'),
      readiness(2, 2, ['full-stack engineer', 'full-stack engineer'], 3, 'BUILD_NOW'),
    ];
    const snap = svc.computeCapacity(r, ventures, supply);
    expect(snap.active_ventures).toBe(2);
    expect(snap.build_now_ventures).toBe(2);
    expect(snap.staffing_pressure).toBeGreaterThan(0);
    expect(snap.concurrency_limit).toBeGreaterThanOrEqual(1);
    expect(snap.role_demand['tech lead'].demand).toBe(1);
    expect(snap.rationale).toBeTruthy();
  });

  it('handles an empty venture set without crashing', () => {
    const snap = svc.computeCapacity([], [], supply);
    expect(snap.staffing_pressure).toBe(0);
    expect(snap.active_ventures).toBe(0);
  });
});
