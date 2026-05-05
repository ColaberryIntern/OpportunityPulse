// Revenue dashboard — pipeline math, conversion math, weekly trend.

const rd = require('../../src/oied/revenueDashboard.service');

const FROZEN_NOW = new Date('2026-05-15T12:00:00Z');

function eventFor(eventType, value, daysAgo = 0) {
  return {
    eventType,
    createdAt: new Date(FROZEN_NOW.getTime() - daysAgo * 86400000),
    opportunity: { value },
  };
}

describe('revenueDashboard.computeDashboard (pure math)', () => {
  it('SPEC: pipeline + expected + actual + conversion all correct on a real example', () => {
    const draftOpps = [
      { id: 1, value: 500_000, bucket: 'act_now' },
      { id: 2, value: 1_000_000, bucket: 'high_value' },
      { id: 3, value: 100_000, bucket: 'standard' },
    ];
    const wpByOppId = new Map([
      [1, 0.30], [2, 0.50], [3, 0.10],
    ]);
    const conversionEvents = [
      eventFor('submitted', 500_000, 14),
      eventFor('submitted', 1_000_000, 7),
      eventFor('won',       500_000,  3),
      eventFor('lost',      250_000,  3),
      eventFor('response_received', 100_000, 1),
    ];
    const out = rd.computeDashboard({
      draftOpps, wpByOppId, conversionEvents,
      organizationId: 1, now: FROZEN_NOW,
    });
    expect(out.pipeline_value).toBe(1_600_000);                 // 500k+1M+100k
    expect(out.expected_revenue).toBe(660_000);                 // 150k + 500k + 10k
    expect(out.actual_revenue).toBe(500_000);                   // 1 won × 500k
    expect(out.submitted_count).toBe(2);
    expect(out.won_count).toBe(1);
    expect(out.lost_count).toBe(1);
    expect(out.response_count).toBe(1);
    expect(out.conversion_rate).toBeCloseTo(0.5, 2);            // 1 / (1+1)
    expect(out.submit_to_win_rate).toBeCloseTo(0.5, 2);         // 1 / 2
  });

  it('falls back to baseline 0.20 when an opp has no win-prob history', () => {
    const draftOpps = [{ id: 1, value: 100_000, bucket: 'standard' }];
    const out = rd.computeDashboard({
      draftOpps, wpByOppId: new Map(), conversionEvents: [],
      organizationId: 1, now: FROZEN_NOW,
    });
    expect(out.expected_revenue).toBe(20_000); // 100k * 0.20
  });

  it('actual_revenue ignores non-won events', () => {
    const out = rd.computeDashboard({
      draftOpps: [], wpByOppId: new Map(),
      conversionEvents: [
        eventFor('submitted', 500_000, 1),
        eventFor('response_received', 1_000_000, 1),
        eventFor('lost', 250_000, 1),
      ],
      organizationId: 1, now: FROZEN_NOW,
    });
    expect(out.actual_revenue).toBe(0);
  });

  it('conversion_rate is null when there are zero wins+losses', () => {
    const out = rd.computeDashboard({
      draftOpps: [], wpByOppId: new Map(),
      conversionEvents: [eventFor('submitted', 500_000, 1)],
      organizationId: 1, now: FROZEN_NOW,
    });
    expect(out.conversion_rate).toBeNull();
  });

  it('submit_to_win_rate is null when nothing has been submitted', () => {
    const out = rd.computeDashboard({
      draftOpps: [], wpByOppId: new Map(), conversionEvents: [],
      organizationId: 1, now: FROZEN_NOW,
    });
    expect(out.submit_to_win_rate).toBeNull();
  });

  it('pipeline_by_bucket aggregates value + count per bucket', () => {
    const out = rd.computeDashboard({
      draftOpps: [
        { id: 1, value: 100_000, bucket: 'act_now' },
        { id: 2, value: 200_000, bucket: 'act_now' },
        { id: 3, value: 50_000,  bucket: 'standard' },
      ],
      wpByOppId: new Map(),
      conversionEvents: [],
      organizationId: 1, now: FROZEN_NOW,
    });
    const actNow = out.pipeline_by_bucket.find((b) => b.bucket === 'act_now');
    const standard = out.pipeline_by_bucket.find((b) => b.bucket === 'standard');
    expect(actNow.value).toBe(300_000);
    expect(actNow.count).toBe(2);
    expect(standard.count).toBe(1);
  });

  it('weekly_trend has 12 buckets going back 12 weeks', () => {
    const out = rd.computeDashboard({
      draftOpps: [], wpByOppId: new Map(),
      conversionEvents: [eventFor('won', 500_000, 3)],
      organizationId: 1, now: FROZEN_NOW,
    });
    expect(out.weekly_trend).toHaveLength(12);
    // Most recent week should contain the 3-days-ago win.
    const lastWeek = out.weekly_trend[out.weekly_trend.length - 1];
    expect(lastWeek.won_count).toBe(1);
    expect(lastWeek.won_value).toBe(500_000);
  });

  it('handles fully empty data without divide-by-zero', () => {
    const out = rd.computeDashboard({
      draftOpps: [], wpByOppId: new Map(), conversionEvents: [],
      organizationId: 1, now: FROZEN_NOW,
    });
    expect(out.pipeline_value).toBe(0);
    expect(out.expected_revenue).toBe(0);
    expect(out.actual_revenue).toBe(0);
    expect(out.conversion_rate).toBeNull();
    expect(out.submit_to_win_rate).toBeNull();
  });
});
