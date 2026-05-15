// Deep Research Phase 6 — ventureHealth.service pure-logic tests.

const svc = require('../../src/deepResearch/ventureHealth.service');

describe('ventureHealth.classify', () => {
  it('returns declining when trajectory declining + confidence drop', () => {
    expect(svc.classify({
      trajectory: 'declining', confidence_delta: -0.2, stall_days: 5, state: 'evaluating', overlap_count: 0,
    })).toBe('declining');
  });
  it('returns at_risk on big confidence drop alone', () => {
    expect(svc.classify({
      trajectory: 'stable', confidence_delta: -0.2, stall_days: 5, state: 'evaluating', overlap_count: 0,
    })).toBe('at_risk');
  });
  it('returns stagnating on long stall in STALLABLE state', () => {
    expect(svc.classify({
      trajectory: 'stable', confidence_delta: 0, stall_days: svc.STALL_DAYS + 1,
      state: 'evaluating', overlap_count: 0,
    })).toBe('stagnating');
  });
  it('returns overloaded on heavy overlap + active state', () => {
    expect(svc.classify({
      trajectory: 'stable', confidence_delta: 0, stall_days: 5, state: 'building', overlap_count: 4,
    })).toBe('overloaded');
  });
  it('returns strengthening on rising trajectory', () => {
    expect(svc.classify({
      trajectory: 'rising', confidence_delta: 0.05, stall_days: 5, state: 'evaluating', overlap_count: 0,
    })).toBe('strengthening');
  });
  it('defaults to healthy', () => {
    expect(svc.classify({
      trajectory: 'stable', confidence_delta: 0, stall_days: 0, state: 'evaluating', overlap_count: 0,
    })).toBe('healthy');
  });
});

describe('ventureHealth.scoreFromSignals', () => {
  it('produces a higher score for healthy than for declining', () => {
    const base = {
      state: 'evaluating', confidence_delta: 0, stall_days: 0, overlap_count: 0, trajectory: 'stable',
    };
    const healthy = svc.scoreFromSignals(base, 'healthy');
    const declining = svc.scoreFromSignals(base, 'declining');
    expect(healthy).toBeGreaterThan(declining);
  });
  it('clamps to 0..100', () => {
    const v = svc.scoreFromSignals({
      state: 'evaluating', confidence_delta: -1, stall_days: 365, overlap_count: 20, trajectory: 'declining',
    }, 'declining');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe('ventureHealth.suggestedAction', () => {
  it('returns a suggestion for at_risk', () => {
    expect(svc.suggestedAction('at_risk')).toMatch(/Re-run/);
  });
  it('returns null for healthy', () => {
    expect(svc.suggestedAction('healthy')).toBeNull();
  });
});

describe('ventureHealth.readinessDelta', () => {
  it('returns 0 with fewer than two history rows', () => {
    expect(svc.readinessDelta([])).toBe(0);
    expect(svc.readinessDelta([{ confidence: 0.5, createdAt: new Date() }])).toBe(0);
  });
  it('returns latest minus prior', () => {
    const hist = [
      { confidence: 0.6, createdAt: new Date('2026-05-10T00:00:00Z') },
      { confidence: 0.4, createdAt: new Date('2026-05-05T00:00:00Z') },
    ];
    expect(svc.readinessDelta(hist)).toBeCloseTo(0.2, 3);
  });
});

describe('ventureHealth.computeStallDays', () => {
  it('uses ventureCreatedAt when no events', () => {
    const now = new Date('2026-05-15T00:00:00Z').getTime();
    const created = new Date('2026-05-05T00:00:00Z');
    expect(svc.computeStallDays([], created, now)).toBe(10);
  });
  it('uses the most recent event when present', () => {
    const now = new Date('2026-05-15T00:00:00Z').getTime();
    const events = [
      { createdAt: new Date('2026-05-01T00:00:00Z') },
      { createdAt: new Date('2026-05-12T00:00:00Z') }, // most recent
    ];
    expect(svc.computeStallDays(events, '2026-04-01T00:00:00Z', now)).toBe(3);
  });
});
