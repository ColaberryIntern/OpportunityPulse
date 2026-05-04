// Recommendation engine — pure ranking with mocked upstream services.

jest.mock('../../src/oied/myOpportunities.service', () => ({
  listMyOpportunities: jest.fn(),
}));
jest.mock('../../src/oied/events.service', () => ({
  getConversionStats: jest.fn(async () => ({
    generated: 0, submitted: 0, response_received: 0, won: 0, lost: 0,
    submit_rate: 0, response_rate: 0, win_rate: null,
  })),
  topWonCategories: jest.fn(async () => []),
}));

const myOppsSvc = require('../../src/oied/myOpportunities.service');
const eventsSvc = require('../../src/oied/events.service');
const rec = require('../../src/oied/recommendation.service');

function fakeOpp(over = {}) {
  return {
    id: over.id || 1,
    title: over.title || 'RFP for X',
    category: over.category || 'IT Services',
    value: over.value != null ? over.value : 250000,
    expiresAt: over.expiresAt || new Date(Date.now() + 14 * 86400000),
    fitScore: over.fitScore != null ? over.fitScore : 60,
    priorityScore: over.priorityScore != null ? over.priorityScore : 60,
    urgency: over.urgency != null ? over.urgency : 65,
    bucket: over.bucket || 'standard',
    aiAnalysis: over.aiAnalysis || { recommended_product: 'OpsBot' },
    description: over.description || 'short',
  };
}

describe('recommendation.winProbabilityFor', () => {
  it('uses baseline 20% with no historical data', () => {
    const stats = { win_rate: null };
    const p = rec.winProbabilityFor(fakeOpp({ category: 'IT Services', fitScore: 50 }), stats, []);
    expect(p).toBeCloseTo(0.20, 2);
  });
  it('rises above baseline when category is in wonCategories (v4: +0.075 with 1 synthetic win)', () => {
    const p = rec.winProbabilityFor(
      fakeOpp({ category: 'Staffing', fitScore: 50 }),
      { win_rate: null },
      ['Staffing'],
    );
    // v4 learning engine: 1 synthetic same-category, same-deal-size,
    // same-effort win → 0.04 + 0.02 + 0.015 = 0.075 above baseline.
    expect(p).toBeGreaterThan(0.20);
    expect(p).toBeCloseTo(0.275, 2);
  });
  it('+5% when fitScore >= 70', () => {
    const p = rec.winProbabilityFor(
      fakeOpp({ category: 'Other', fitScore: 75 }),
      { win_rate: null },
      [],
    );
    expect(p).toBeCloseTo(0.25, 2);
  });
  it('caps at 0.85', () => {
    const p = rec.winProbabilityFor(
      fakeOpp({ category: 'Staffing', fitScore: 75 }),
      { win_rate: 0.80 },
      ['Staffing'],
    );
    expect(p).toBeLessThanOrEqual(0.85);
  });
  it('floors at 0.05', () => {
    const p = rec.winProbabilityFor(
      fakeOpp({ category: 'Other', fitScore: 0 }),
      { win_rate: 0.0 },
      [],
    );
    expect(p).toBeGreaterThanOrEqual(0.05);
  });
});

describe('recommendation.buildReason', () => {
  it('mentions urgent close', () => {
    const reason = rec.buildReason(fakeOpp({ urgency: 100 }), { effort_score: 50 });
    expect(reason).toMatch(/closes in/);
  });
  it('mentions $1M+ value', () => {
    const reason = rec.buildReason(fakeOpp({ value: 2_000_000 }), { effort_score: 50 });
    expect(reason).toMatch(/\$2M/);
  });
  it('mentions strong fit and low effort', () => {
    const reason = rec.buildReason(fakeOpp({ fitScore: 80 }), { effort_score: 25 });
    expect(reason).toMatch(/strong profile fit/);
    expect(reason).toMatch(/low effort/);
  });
  it('falls back to a default phrase', () => {
    const reason = rec.buildReason(
      fakeOpp({ urgency: 30, value: 10, fitScore: 0, bucket: 'standard' }),
      { effort_score: 80 },
    );
    expect(reason).toBe('matches your profile');
  });
});

describe('recommendation.getTopActions', () => {
  beforeEach(() => {
    myOppsSvc.listMyOpportunities.mockReset();
  });

  it('returns empty array when My Opps is empty', async () => {
    myOppsSvc.listMyOpportunities.mockResolvedValue({ rows: [], total: 0 });
    const out = await rec.getTopActions(1);
    expect(out).toEqual([]);
  });

  it('returns up to 3 ranked items by default, sorted by recommendation_score desc', async () => {
    myOppsSvc.listMyOpportunities.mockResolvedValue({
      rows: [
        fakeOpp({ id: 1, priorityScore: 30, urgency: 30 }),  // low
        fakeOpp({ id: 2, priorityScore: 90, urgency: 100 }), // high
        fakeOpp({ id: 3, priorityScore: 60, urgency: 65 }),  // mid
        fakeOpp({ id: 4, priorityScore: 75, urgency: 85 }),  // high-mid
        fakeOpp({ id: 5, priorityScore: 40, urgency: 45 }),  // low-mid
      ],
      total: 5,
    });
    const out = await rec.getTopActions(1);
    expect(out.length).toBeLessThanOrEqual(3);
    // Sorted desc
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i - 1].recommendation_score).toBeGreaterThanOrEqual(out[i].recommendation_score);
    }
    // First should be id=2 (highest priority + urgency).
    expect(out[0].opportunity_id).toBe(2);
  });

  it('each result carries reason + effort_estimate + win_probability', async () => {
    myOppsSvc.listMyOpportunities.mockResolvedValue({
      rows: [fakeOpp({ id: 1, priorityScore: 70, urgency: 90 })], total: 1,
    });
    const [r] = await rec.getTopActions(1);
    expect(typeof r.reason).toBe('string');
    expect(r.effort_estimate.proposal_hours).toBeGreaterThan(0);
    expect(r.effort_estimate.build_days).toBeGreaterThan(0);
    expect(r.win_probability).toBeGreaterThan(0);
    expect(r.win_probability).toBeLessThan(1);
  });

  it('respects custom limit (clamped to [1, 10])', async () => {
    myOppsSvc.listMyOpportunities.mockResolvedValue({
      rows: Array.from({ length: 8 }, (_, i) => fakeOpp({ id: i + 1, priorityScore: 90 - i })),
      total: 8,
    });
    const out5 = await rec.getTopActions(1, { limit: 5 });
    expect(out5.length).toBe(5);
    const out0 = await rec.getTopActions(1, { limit: 0 });
    expect(out0.length).toBe(1); // clamped to min 1
    const out99 = await rec.getTopActions(1, { limit: 99 });
    expect(out99.length).toBe(8); // clamped to data size
  });
});

describe('recommendation.effortDivisor', () => {
  it('neutral 1.0 at effort 50', () => {
    expect(rec.effortDivisor(50)).toBe(1);
  });
  it('< 1 for low effort (boosts score)', () => {
    expect(rec.effortDivisor(25)).toBeCloseTo(0.5, 1);
  });
  it('> 1 for high effort (penalizes score)', () => {
    expect(rec.effortDivisor(80)).toBeCloseTo(1.6, 1);
  });
  it('floors at 0.5', () => {
    expect(rec.effortDivisor(10)).toBe(0.5);
  });
});
