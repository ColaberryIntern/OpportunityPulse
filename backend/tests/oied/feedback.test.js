// Feedback loop — pending outcomes filter, weekly aggregation, insights.

const fb = require('../../src/oied/feedback.service');

const NOW = new Date('2026-05-15T12:00:00Z');
function eventAt(opportunityId, eventType, daysAgo) {
  return {
    opportunityId,
    eventType,
    createdAt: new Date(NOW.getTime() - daysAgo * 86400000),
  };
}

describe('feedback.pickPending', () => {
  it('SPEC: returns submitted-without-outcome >7d', () => {
    const events = [
      eventAt(1, 'submitted', 10),
      eventAt(2, 'submitted', 8),
      eventAt(3, 'submitted', 3), // too recent
    ];
    const out = fb.pickPending(events, { now: NOW });
    expect(out.map((p) => p.opportunity_id).sort()).toEqual([1, 2]);
    // Stale-first ordering (10d before 8d).
    expect(out[0].opportunity_id).toBe(1);
  });

  it('SPEC: excludes opportunities with a later won/lost/response', () => {
    const events = [
      eventAt(1, 'submitted', 14),
      eventAt(1, 'won', 10),         // outcome → should exclude
      eventAt(2, 'submitted', 14),
      eventAt(2, 'response_received', 9), // response counts as movement
      eventAt(3, 'submitted', 14),
      eventAt(3, 'lost', 12),        // outcome → exclude
      eventAt(4, 'submitted', 14),   // pending — keep
    ];
    const out = fb.pickPending(events, { now: NOW });
    expect(out.map((p) => p.opportunity_id)).toEqual([4]);
  });

  it('respects custom thresholdDays', () => {
    const events = [eventAt(5, 'submitted', 4)];
    expect(fb.pickPending(events, { now: NOW, thresholdDays: 3 }))
      .toHaveLength(1);
    expect(fb.pickPending(events, { now: NOW, thresholdDays: 5 }))
      .toHaveLength(0);
  });

  it('returns empty when there are no submitted events', () => {
    expect(fb.pickPending([], { now: NOW })).toEqual([]);
  });
});

describe('feedback.aggregateWeekly', () => {
  function makeArgs(events, oppMap = new Map(), predictionMap = new Map()) {
    return {
      events,
      oppMap,
      predictionMap,
      since: new Date(NOW.getTime() - 7 * 86400000),
      until: NOW,
    };
  }

  it('SPEC: counts wins + losses + actual_revenue', () => {
    const oppMap = new Map([
      [1, { id: 1, title: 'A', value: 500_000, category: 'Staffing' }],
      [2, { id: 2, title: 'B', value: 200_000, category: 'Staffing' }],
      [3, { id: 3, title: 'C', value: 100_000, category: 'IT Services' }],
    ]);
    const events = [
      eventAt(1, 'won', 2),
      eventAt(2, 'won', 4),
      eventAt(3, 'lost', 1),
    ];
    const out = fb.aggregateWeekly(makeArgs(events, oppMap));
    expect(out.won_count).toBe(2);
    expect(out.lost_count).toBe(1);
    expect(out.actual_revenue).toBe(700_000);
    expect(out.win_rate).toBeCloseTo(2 / 3, 2);
  });

  it('SPEC: top_performing_category picks the most-won category', () => {
    const oppMap = new Map([
      [1, { id: 1, value: 100, category: 'Staffing' }],
      [2, { id: 2, value: 100, category: 'Staffing' }],
      [3, { id: 3, value: 100, category: 'IT Services' }],
    ]);
    const out = fb.aggregateWeekly(makeArgs([
      eventAt(1, 'won', 1),
      eventAt(2, 'won', 2),
      eventAt(3, 'won', 3),
    ], oppMap));
    expect(out.insights.top_performing_category).toEqual({
      category: 'Staffing', wins: 2,
    });
  });

  it('biggest_win + biggest_loss are by value', () => {
    const oppMap = new Map([
      [1, { id: 1, title: 'small win', value: 50_000, category: 'X' }],
      [2, { id: 2, title: 'big win',   value: 500_000, category: 'X' }],
      [3, { id: 3, title: 'big loss',  value: 1_000_000, category: 'X' }],
    ]);
    const out = fb.aggregateWeekly(makeArgs([
      eventAt(1, 'won', 1),
      eventAt(2, 'won', 2),
      eventAt(3, 'lost', 3),
    ], oppMap));
    expect(out.insights.biggest_win.opportunity_id).toBe(2);
    expect(out.insights.biggest_loss.opportunity_id).toBe(3);
  });

  it('predicted_vs_actual averages probabilities across won vs lost', () => {
    const oppMap = new Map([
      [1, { id: 1, value: 100, category: 'X' }],
      [2, { id: 2, value: 100, category: 'X' }],
      [3, { id: 3, value: 100, category: 'X' }],
    ]);
    const predictionMap = new Map([
      [1, 0.40], [2, 0.60], [3, 0.30],
    ]);
    const out = fb.aggregateWeekly(makeArgs([
      eventAt(1, 'won', 1),
      eventAt(2, 'won', 2),
      eventAt(3, 'lost', 3),
    ], oppMap, predictionMap));
    expect(out.insights.predicted_vs_actual.avg_predicted_for_wins).toBeCloseTo(0.50, 2);
    expect(out.insights.predicted_vs_actual.avg_predicted_for_losses).toBeCloseTo(0.30, 2);
    expect(out.insights.predicted_vs_actual.sample_size).toBe(3);
  });

  it('returns null win_rate when no wins+losses', () => {
    const out = fb.aggregateWeekly(makeArgs([], new Map()));
    expect(out.win_rate).toBeNull();
    expect(out.insights.top_performing_category).toBeNull();
    expect(out.insights.biggest_win).toBeNull();
  });
});

describe('feedback.buildWeeklySummaryHtml', () => {
  it('produces non-empty HTML with the period', () => {
    const html = fb.buildWeeklySummaryHtml({
      organization_id: 1,
      period: { start: '2026-05-08T12:00:00Z', end: '2026-05-15T12:00:00Z' },
      won_count: 2, lost_count: 1, actual_revenue: 700_000,
      win_rate: 0.67,
      insights: {
        top_performing_category: { category: 'Staffing', wins: 2 },
        biggest_win: { opportunity_id: 1, title: 'Big win', value: 500_000 },
        biggest_loss: null,
        predicted_vs_actual: { avg_predicted_for_wins: 0.5, avg_predicted_for_losses: 0.3, sample_size: 3 },
      },
    });
    expect(html).toMatch(/Weekly Summary/);
    expect(html).toMatch(/Staffing/);
    expect(html).toMatch(/Big win/);
  });
});
