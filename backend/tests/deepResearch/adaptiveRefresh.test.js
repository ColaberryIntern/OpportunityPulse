// Deep Research Phase 6 — adaptiveRefresh.service tests (pure helpers).

const svc = require('../../src/deepResearch/adaptiveRefresh.service');

describe('adaptiveRefresh.summarizeResult', () => {
  it('returns null for falsy input', () => {
    expect(svc.summarizeResult(null)).toBeNull();
  });
  it('keeps numeric top-level keys verbatim', () => {
    expect(svc.summarizeResult({ evaluated: 12 })).toEqual({ evaluated: 12 });
  });
  it('reduces array-valued keys to counts', () => {
    expect(svc.summarizeResult({ results: [1, 2, 3] })).toEqual({ results_count: 3 });
  });
  it('reduces nested results arrays to counts', () => {
    expect(svc.summarizeResult({
      decay: { evaluated: 4, results: [1, 2, 3, 4] },
    })).toEqual({ decay_count: 4 });
  });
});

describe('adaptiveRefresh.STEP_SETS', () => {
  it('exposes named step sets keyed by runType', () => {
    expect(svc.STEP_SETS.full).toEqual(svc.FULL_STEPS);
    expect(svc.STEP_SETS.portfolio.length).toBeGreaterThan(0);
    expect(svc.STEP_SETS.observatory.length).toBeGreaterThan(0);
    expect(svc.STEP_SETS.decay.length).toBe(1);
  });
  it('every step is [name, fn]', () => {
    for (const [name, fn] of svc.FULL_STEPS) {
      expect(typeof name).toBe('string');
      expect(typeof fn).toBe('function');
    }
  });
});

describe('adaptiveRefresh.startScheduler', () => {
  const old = process.env.DEEP_RESEARCH_ADAPTIVE_REFRESH_ENABLED;
  afterEach(() => {
    process.env.DEEP_RESEARCH_ADAPTIVE_REFRESH_ENABLED = old;
    svc.stopScheduler();
  });
  it('returns null when not enabled', () => {
    delete process.env.DEEP_RESEARCH_ADAPTIVE_REFRESH_ENABLED;
    expect(svc.startScheduler()).toBeNull();
  });
});
