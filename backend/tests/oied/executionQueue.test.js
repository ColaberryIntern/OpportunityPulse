// Execution queue — sort math, ROI computation, filtering.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Opportunity: { findAll: jest.fn() },
  OpportunityOutput: { findAll: jest.fn() },
}));

jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
}));

jest.mock('../../src/oied/winProbability.service', () => ({
  calculateWinProbability: jest.fn(async () => ({ win_probability: 0.30, components: {} })),
}));

const eq = require('../../src/oied/executionQueue.service');
const models = require('../../src/models');
const wp = require('../../src/oied/winProbability.service');

function makeDraft(id, opportunityId, over = {}) {
  return {
    id, opportunityId,
    type: 'proposal', status: 'draft', metadata: {},
    createdAt: new Date(),
    ...over,
  };
}
function makeOpp(id, value, category = 'IT Services', extra = {}) {
  return {
    id, value, category,
    title: `Opp ${id}`,
    expiresAt: null,
    aiAnalysis: { recommended_product: 'X', automation_potential: 50 },
    toJSON() { return { id, value, category, title: this.title, expiresAt: this.expiresAt, aiAnalysis: this.aiAnalysis, ...extra }; },
  };
}

beforeEach(() => {
  models.OpportunityOutput.findAll.mockReset();
  models.Opportunity.findAll.mockReset();
  wp.calculateWinProbability.mockReset().mockResolvedValue({ win_probability: 0.30, components: {} });
});

describe('executionQueue.computeRoiPerHour (pure)', () => {
  it('value × winProb / hours', () => {
    expect(eq.computeRoiPerHour({ value: 500_000, winProbability: 0.30, proposalHours: 6 }))
      .toBe(25_000);
  });
  it('falls back to 4h default when hours is 0 / missing (avoids divide-by-zero)', () => {
    // 100k × 0.2 / 4 (default) = 5,000.
    expect(eq.computeRoiPerHour({ value: 100_000, winProbability: 0.20, proposalHours: 0 }))
      .toBe(5_000);
  });
  it('handles missing values gracefully', () => {
    expect(eq.computeRoiPerHour({ value: null, winProbability: null, proposalHours: 4 }))
      .toBe(0);
  });
});

describe('executionQueue.listExecutionQueue', () => {
  it('returns empty when there are no drafts', async () => {
    models.OpportunityOutput.findAll.mockResolvedValue([]);
    const out = await eq.listExecutionQueue({ organizationId: 1 });
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
  });

  it('SPEC: sorts by ROI/hour descending', async () => {
    // 3 drafts with the same effort (4h proposal) and same win_prob (0.30).
    // Differing values → different ROIs.
    const drafts = [
      makeDraft(101, 1),
      makeDraft(102, 2),
      makeDraft(103, 3),
    ];
    const opps = [
      makeOpp(1, 100_000),  // ROI = 100k*.3/4 = 7,500
      makeOpp(2, 1_000_000), // ROI = 1M*.3/4   = 75,000
      makeOpp(3, 250_000),  // ROI = 250k*.3/4 = 18,750
    ];
    models.OpportunityOutput.findAll.mockResolvedValue(drafts);
    models.Opportunity.findAll.mockResolvedValue(opps);
    const out = await eq.listExecutionQueue({ organizationId: 1 });
    expect(out.rows.map((r) => r.opportunity_id)).toEqual([2, 3, 1]); // sorted desc
    expect(out.rows[0].roi_per_hour).toBe(75_000);
    expect(out.rows[1].roi_per_hour).toBe(18_750);
    expect(out.rows[2].roi_per_hour).toBe(7_500);
  });

  it('skips drafts whose parent opportunity is missing', async () => {
    models.OpportunityOutput.findAll.mockResolvedValue([
      makeDraft(101, 1), makeDraft(102, 99), // 99 has no opp row
    ]);
    models.Opportunity.findAll.mockResolvedValue([makeOpp(1, 250_000)]);
    const out = await eq.listExecutionQueue({ organizationId: 1 });
    expect(out.rows.map((r) => r.output_id)).toEqual([101]);
  });

  it('attaches title, category, expected_revenue per row', async () => {
    models.OpportunityOutput.findAll.mockResolvedValue([makeDraft(101, 1)]);
    models.Opportunity.findAll.mockResolvedValue([makeOpp(1, 500_000, 'Staffing')]);
    const out = await eq.listExecutionQueue({ organizationId: 1 });
    expect(out.rows[0]).toMatchObject({
      output_id: 101,
      opportunity_id: 1,
      title: 'Opp 1',
      category: 'Staffing',
      value: 500_000,
      win_probability: 0.30,
      expected_revenue: 150_000, // 500k * 0.30
    });
  });

  it('respects minRoi filter', async () => {
    models.OpportunityOutput.findAll.mockResolvedValue([
      makeDraft(101, 1), makeDraft(102, 2),
    ]);
    models.Opportunity.findAll.mockResolvedValue([
      makeOpp(1, 10_000),    // ROI = 10k*0.3/4 = 750
      makeOpp(2, 1_000_000), // ROI = 75,000
    ]);
    const out = await eq.listExecutionQueue({ organizationId: 1, minRoi: 1000 });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].opportunity_id).toBe(2);
  });
});
