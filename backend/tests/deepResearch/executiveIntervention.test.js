// Deep Research Phase 6 — executiveIntervention.service pure-logic tests.

const svc = require('../../src/deepResearch/executiveIntervention.service');

describe('executiveIntervention.findHireRecs', () => {
  it('returns nothing when snapshot is null', () => {
    expect(svc.findHireRecs(null)).toEqual([]);
  });
  it('skips roles without deficit', () => {
    const recs = svc.findHireRecs({
      role_demand: {
        'tech lead': { demand: 1, supply: 1, deficit: 0 },
        'ai/ml engineer': { demand: 2, supply: 1, deficit: 1 },
      },
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe('hire');
    expect(recs[0].supportingMetrics.role).toBe('ai/ml engineer');
  });
  it('uses the highest severity when supply is zero', () => {
    const recs = svc.findHireRecs({
      role_demand: { 'devops': { demand: 2, supply: 0, deficit: 2 } },
    });
    expect(recs[0].severity).toBe(svc.SEVERITY_HIGH);
  });
});

describe('executiveIntervention.findQueueRec', () => {
  it('returns null when build_now <= concurrency', () => {
    expect(svc.findQueueRec({ build_now_ventures: 1, concurrency_limit: 2 })).toBeNull();
  });
  it('emits queue_pressure when build_now > concurrency', () => {
    const rec = svc.findQueueRec({ build_now_ventures: 5, concurrency_limit: 2 });
    expect(rec.type).toBe('queue_pressure');
    expect(rec.supportingMetrics.over_by).toBe(3);
  });
});
