// Deep Research Phase 4 — executionCapacityPlanner.service tests.

const svc = require('../../src/deepResearch/executionCapacityPlanner.service');

describe('executionCapacityPlanner.hiringRecommendationsFrom', () => {
  it('translates role deficits into hire recommendations', () => {
    const recs = svc.hiringRecommendationsFrom({
      role_demand: {
        'tech lead': { demand: 3, supply: 1, deficit: 2 },
        'full-stack engineer': { demand: 2, supply: 2, deficit: 0 },
      },
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].role).toBe('tech lead');
    expect(recs[0].hires_recommended).toBe(2);
  });
  it('returns an empty list when the snapshot is missing', () => {
    expect(svc.hiringRecommendationsFrom(null)).toEqual([]);
  });
});

describe('executionCapacityPlanner.planQuarters', () => {
  it('schedules priority-sorted ventures into concurrency slots, packing earliest first', () => {
    const ranking = [
      { venture_idea_id: 1, sequencing_recommendation: 'execute_now', portfolio_rank: 1 },
      { venture_idea_id: 2, sequencing_recommendation: 'queue', portfolio_rank: 2 },
      { venture_idea_id: 3, sequencing_recommendation: 'queue', portfolio_rank: 3 },
      { venture_idea_id: 4, sequencing_recommendation: 'monitor', portfolio_rank: 4 },
    ];
    const readinessByVenture = new Map([
      [1, { mvpTimelineWeeks: 8 }], [2, { mvpTimelineWeeks: 10 }],
      [3, { mvpTimelineWeeks: 6 }], [4, { mvpTimelineWeeks: 5 }],
    ]);
    const plan = svc.planQuarters(ranking, readinessByVenture, 2, 4);
    // Monitor was deliberately not scheduled.
    expect(plan.find((p) => p.venture_idea_id === 4).scheduled_quarter).toBeNull();
    // First two ventures land in Q1 (each in their own slot, starting at week 0).
    expect(plan[0].scheduled_quarter).toBe(1);
    expect(plan[1].scheduled_quarter).toBe(1);
    // Third venture stacks behind whichever slot finished first.
    expect(plan[2].scheduled_week_start).toBe(8);
  });
});

describe('executionCapacityPlanner.buildPlan', () => {
  it('builds the full plan with concurrency, by_quarter, hiring recs', () => {
    const ranking = [
      { venture_idea_id: 1, sequencing_recommendation: 'execute_now', portfolio_rank: 1 },
      { venture_idea_id: 2, sequencing_recommendation: 'queue', portfolio_rank: 2 },
    ];
    const readinessByVenture = new Map([
      [1, { mvpTimelineWeeks: 8 }], [2, { mvpTimelineWeeks: 12 }],
    ]);
    const capacitySnapshot = {
      concurrency_limit: 2,
      role_demand: { 'tech lead': { demand: 2, supply: 1, deficit: 1 } },
    };
    const plan = svc.buildPlan({ ranking, readinessByVenture, capacitySnapshot });
    expect(plan.concurrency_limit).toBe(2);
    expect(plan.average_venture_weeks).toBeGreaterThan(0);
    expect(plan.by_quarter.Q1.length).toBeGreaterThan(0);
    expect(plan.hiring_recommendations).toHaveLength(1);
  });
});
