// Deep Research Phase 2 — marketTiming.service tests.
// Pure deterministic engine — no mocks needed.

const svc = require('../../src/deepResearch/marketTiming.service');

// Build a correlation-shaped input.
const sig = (channel, volume, recent, prior, accel = 1) => ({
  channel, label: channel, volume, recent_count: recent, prior_count: prior,
  acceleration: accel, signal_score: 0.4,
});

describe('marketTiming.computeMaturity', () => {
  it('is low for thin signal and high for broad+deep signal', () => {
    expect(svc.computeMaturity([sig('research', 2, 1, 1)])).toBeLessThan(0.3);
    const broad = svc.computeMaturity([
      sig('research', 20, 10, 10), sig('talent', 15, 8, 7), sig('government', 12, 6, 6),
      sig('capital', 8, 4, 4), sig('freelance', 10, 5, 5),
    ]);
    expect(broad).toBeGreaterThan(0.6);
  });
});

describe('marketTiming.computeMomentum', () => {
  it('maps acceleration onto 0-1', () => {
    expect(svc.computeMomentum(0.5)).toBe(0);
    expect(svc.computeMomentum(1.0)).toBeCloseTo(0.333, 2);
    expect(svc.computeMomentum(2.0)).toBe(1);
  });
});

describe('marketTiming.classifyStage', () => {
  it('declining overrides everything when acceleration is low', () => {
    expect(svc.classifyStage({ momentum: 0.9, maturity: 0.9, acceleration: 0.6 })).toBe('declining');
  });
  it('thin + slow → emerging', () => {
    expect(svc.classifyStage({ momentum: 0.2, maturity: 0.1, acceleration: 1 })).toBe('emerging');
  });
  it('thin + fast → acceleration', () => {
    expect(svc.classifyStage({ momentum: 0.7, maturity: 0.1, acceleration: 1.5 })).toBe('acceleration');
  });
  it('developing + hot → breakout', () => {
    expect(svc.classifyStage({ momentum: 0.7, maturity: 0.4, acceleration: 1.6 })).toBe('breakout');
  });
  it('mature + warm → mainstream', () => {
    expect(svc.classifyStage({ momentum: 0.45, maturity: 0.7, acceleration: 1 })).toBe('mainstream');
  });
  it('mature + cold → saturated', () => {
    expect(svc.classifyStage({ momentum: 0.2, maturity: 0.7, acceleration: 1 })).toBe('saturated');
  });
});

describe('marketTiming.classifyTiming', () => {
  it('classifies a hot emerging market and reports thin-data low confidence', () => {
    const correlation = {
      acceleration: 2.0,
      signal_breakdown: [sig('research', 4, 4, 1, 4)],
    };
    const out = svc.classifyTiming(correlation, { totals: { sourceCount: 4 } });
    expect(svc.STAGES).toContain(out.stage);
    expect(out.confidence).toBeLessThan(0.5); // thin data
    expect(out.timing_score).toBeGreaterThan(0);
    expect(out.rationale).toBeTruthy();
    expect(out.signal_velocities.publication.volume).toBe(4);
  });

  it('classifies a broad steady market as mainstream/saturated with higher confidence', () => {
    const breakdown = [
      sig('research', 20, 10, 10), sig('talent', 15, 7, 8), sig('government', 14, 7, 7),
      sig('capital', 10, 5, 5), sig('freelance', 12, 6, 6),
    ];
    const out = svc.classifyTiming(
      { acceleration: 1.0, signal_breakdown: breakdown },
      { totals: { sourceCount: 71 } },
    );
    expect(['mainstream', 'saturated']).toContain(out.stage);
    expect(out.confidence).toBeGreaterThan(0.6);
  });

  it('handles an empty correlation gracefully', () => {
    const out = svc.classifyTiming({ acceleration: 1, signal_breakdown: [] }, { totals: { sourceCount: 0 } });
    expect(out.stage).toBe('emerging');
    expect(out.confidence).toBe(0);
  });
});
