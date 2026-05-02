const {
  calculatePriorityScore,
  urgencyFromCloseDate,
  revenueVelocity,
  bucketFor,
} = require('../../src/oied/priorityScoring.service');

describe('priorityScoring.urgencyFromCloseDate', () => {
  const now = new Date('2026-01-15T00:00:00Z');
  it('= 100 within 7 days', () => {
    expect(urgencyFromCloseDate(new Date('2026-01-20'), now)).toBe(100);
  });
  it('= 85 within 14 days', () => {
    expect(urgencyFromCloseDate(new Date('2026-01-29'), now)).toBe(85);
  });
  it('= 65 within 30 days', () => {
    expect(urgencyFromCloseDate(new Date('2026-02-10'), now)).toBe(65);
  });
  it('= 0 already past close date', () => {
    expect(urgencyFromCloseDate(new Date('2026-01-10'), now)).toBe(0);
  });
  it('= 30 floor when close date unknown', () => {
    expect(urgencyFromCloseDate(null, now)).toBe(30);
  });
});

describe('priorityScoring.revenueVelocity', () => {
  it('zero with no inputs', () => {
    expect(revenueVelocity({})).toBe(0);
  });
  it('saturates at 100 with full revenue + automation + ease', () => {
    expect(revenueVelocity({
      revenue_weight: 20,
      automation_score: 15,
      ease_of_entry: 10,
    })).toBe(100);
  });
  it('partial inputs scale linearly', () => {
    const v = revenueVelocity({ revenue_weight: 10, automation_score: 7, ease_of_entry: 5 });
    expect(v).toBeGreaterThanOrEqual(40);
    expect(v).toBeLessThanOrEqual(60);
  });
});

describe('priorityScoring.bucketFor', () => {
  it('act_now when priority >= 80', () => {
    expect(bucketFor({ priority: 85, urgency: 30, fit: 50, breakdown: {} })).toBe('act_now');
  });
  it('act_now when urgency >= 90 even with low priority', () => {
    expect(bucketFor({ priority: 50, urgency: 100, fit: 50, breakdown: {} })).toBe('act_now');
  });
  it('high_value when revenue >= 16 + fit >= 50', () => {
    expect(bucketFor({
      priority: 60, urgency: 50, fit: 70,
      breakdown: { revenue_weight: 16, ease_of_entry: 5, automation_score: 5 },
    })).toBe('high_value');
  });
  it('quick_win when ease + automation high + urgency moderate', () => {
    expect(bucketFor({
      priority: 60, urgency: 70, fit: 60,
      breakdown: { revenue_weight: 4, ease_of_entry: 9, automation_score: 13 },
    })).toBe('quick_win');
  });
  it('standard otherwise', () => {
    expect(bucketFor({ priority: 30, urgency: 30, fit: 30, breakdown: {} })).toBe('standard');
  });
});

describe('priorityScoring.calculatePriorityScore', () => {
  it('returns priority + breakdown + bucket', () => {
    const r = calculatePriorityScore({
      opportunity: { expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
      fitScore: 80,
      breakdown: { revenue_weight: 18, automation_score: 13, ease_of_entry: 9 },
    });
    expect(r.priorityScore).toBeGreaterThanOrEqual(70);
    expect(r.urgency).toBe(100);
    expect(r.bucket).toBe('act_now');
  });
  it('clamps to [0, 100]', () => {
    const r = calculatePriorityScore({
      opportunity: { expiresAt: null },
      fitScore: 150,
      breakdown: {},
    });
    expect(r.priorityScore).toBeLessThanOrEqual(100);
    expect(r.priorityScore).toBeGreaterThanOrEqual(0);
  });
});
