// Pipeline velocity — duration math, percentile math, sample-size
// counts. The pure helpers (computeDurationsFromEvents +
// summarizeDurations) carry the load; the DB-bound getVelocity is
// just orchestration.

const v = require('../../src/oied/velocity.service');

const NOW = new Date('2026-05-15T12:00:00Z');
function eventAt(opportunityId, eventType, daysAgo) {
  return {
    opportunityId,
    eventType,
    createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
  };
}

describe('velocity.summarizeDurations', () => {
  it('returns nulls on empty input', () => {
    expect(v.summarizeDurations([])).toEqual({
      count: 0, avg_days: null, median_days: null, p90_days: null,
    });
  });
  it('count + avg + median + p90 across a known sample', () => {
    // Sorted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const out = v.summarizeDurations([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(out.count).toBe(10);
    expect(out.avg_days).toBeCloseTo(5.5, 1);
    expect(out.median_days).toBeCloseTo(5.5, 1);
    expect(out.p90_days).toBeCloseTo(9.1, 1); // linear interp at index 8.1
  });
  it('handles single-element arrays', () => {
    const out = v.summarizeDurations([7]);
    expect(out).toMatchObject({ count: 1, avg_days: 7, median_days: 7, p90_days: 7 });
  });
});

describe('velocity.computeDurationsFromEvents', () => {
  it('SPEC: derives time_to_submit/response/win per opportunity', () => {
    // Opp 1: generated 14d ago, submitted 10d ago, won 3d ago.
    // Opp 2: generated 20d ago, submitted 15d ago, response 8d ago, lost.
    // Opp 3: generated 5d ago, no submission yet.
    const events = [
      eventAt(1, 'generated', 14),
      eventAt(1, 'submitted', 10),
      eventAt(1, 'won', 3),
      eventAt(2, 'generated', 20),
      eventAt(2, 'submitted', 15),
      eventAt(2, 'response_received', 8),
      eventAt(2, 'lost', 4),
      eventAt(3, 'generated', 5),
    ];
    const out = v.computeDurationsFromEvents(events);
    expect(out.submit).toEqual([4, 5]);          // 14-10, 20-15 (op3 excluded)
    expect(out.response).toEqual([7]);           // 15-8 only on opp 2
    expect(out.win).toEqual([7]);                // 10-3 only on opp 1
  });

  it('skips opportunities missing the relevant event pair', () => {
    const events = [
      eventAt(1, 'generated', 5),  // no submit
      eventAt(2, 'submitted', 5),  // no generated → cannot compute time_to_submit
    ];
    const out = v.computeDurationsFromEvents(events);
    expect(out.submit).toEqual([]);
    expect(out.response).toEqual([]);
    expect(out.win).toEqual([]);
  });

  it('uses the FIRST occurrence of each event type per opp', () => {
    // If an opp has two submitted events, the first wins.
    const events = [
      eventAt(7, 'generated', 30),
      eventAt(7, 'submitted', 25),
      eventAt(7, 'submitted', 10), // ignored — first wins
    ];
    const out = v.computeDurationsFromEvents(events);
    expect(out.submit).toEqual([5]); // 30 − 25
  });

  it('drops negative durations defensively (out-of-order timestamps)', () => {
    // submitted before generated for opp 9 — ignore.
    const events = [
      eventAt(9, 'submitted', 30),
      eventAt(9, 'generated', 10),
    ];
    const out = v.computeDurationsFromEvents(events);
    expect(out.submit).toEqual([]);
  });
});

describe('velocity.countSampleSizes', () => {
  it('counts each canonical event type', () => {
    const events = [
      eventAt(1, 'generated', 1), eventAt(1, 'generated', 2),
      eventAt(2, 'submitted', 1),
      eventAt(3, 'won', 1), eventAt(4, 'lost', 1),
    ];
    const out = v.countSampleSizes(events);
    expect(out).toMatchObject({
      generated: 2, submitted: 1, won: 1, lost: 1, response_received: 0,
    });
  });
});

describe('velocity.quantile', () => {
  it('returns p90 with linear interpolation', () => {
    expect(v.quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1, 1);
  });
  it('handles single-element arrays', () => {
    expect(v.quantile([5], 0.5)).toBe(5);
  });
  it('returns null on empty', () => {
    expect(v.quantile([], 0.5)).toBeNull();
  });
});
