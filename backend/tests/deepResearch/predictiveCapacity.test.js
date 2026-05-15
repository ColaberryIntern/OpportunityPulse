// Deep Research Phase 5 — predictiveCapacity.service tests.

const svc = require('../../src/deepResearch/predictiveCapacity.service');

const planSeq = [
  { venture_idea_id: 1, scheduled_week_start: 0, scheduled_week_end: 8 },
  { venture_idea_id: 2, scheduled_week_start: 4, scheduled_week_end: 14 },
  { venture_idea_id: 3, scheduled_week_start: 10, scheduled_week_end: 18 },
];

describe('predictiveCapacity.activeAtWeek', () => {
  it('returns ventures whose schedule covers the given week', () => {
    const active = svc.activeAtWeek(planSeq, 6, 1.0);
    expect(active.map((p) => p.venture_idea_id).sort()).toEqual([1, 2]);
  });
  it('honors slippage by stretching schedules', () => {
    const active = svc.activeAtWeek(planSeq, 6, 1.5);
    // venture 2's slipped start is 4 × 1.5 = 6, so it just barely starts.
    expect(active.map((p) => p.venture_idea_id)).toContain(1);
  });
});

describe('predictiveCapacity.queuedAtWeek', () => {
  it('returns ventures scheduled to start AFTER the given week', () => {
    const queued = svc.queuedAtWeek(planSeq, 5, 1.0);
    expect(queued.map((p) => p.venture_idea_id)).toEqual([3]);
  });
});

describe('predictiveCapacity.forecastOne', () => {
  const capacitySnapshot = { concurrency_limit: 2, bottlenecks: [{ type: 'role_deficit', label: 'tech lead deficit', severity: 80 }] };
  const plan = { sequence: planSeq };

  it('builds a realistic 30-day forecast with pressure + bottlenecks', () => {
    const out = svc.forecastOne({ horizonDays: 30, scenario: 'realistic', plan, capacitySnapshot });
    expect(out.horizon_days).toBe(30);
    expect(out.scenario).toBe('realistic');
    expect(out.projected_staffing_pressure).toBeGreaterThanOrEqual(0);
    expect(out.bottleneck_risks.length).toBeGreaterThan(0);
    expect(out.rationale).toBeTruthy();
  });
  it('conservative scenario assumes new arrivals', () => {
    const out = svc.forecastOne({ horizonDays: 90, scenario: 'conservative', plan, capacitySnapshot });
    expect(out.metadata.assumed_new_arrivals).toBeGreaterThan(0);
  });
  it('handles a plan with no sequence', () => {
    const out = svc.forecastOne({ horizonDays: 30, scenario: 'realistic', plan: null, capacitySnapshot });
    expect(out.projected_staffing_pressure).toBe(0);
  });
});
