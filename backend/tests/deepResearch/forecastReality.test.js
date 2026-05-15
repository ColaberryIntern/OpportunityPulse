// Deep Research Phase 6 — forecastReality.service tests.

const svc = require('../../src/deepResearch/forecastReality.service');

describe('forecastReality.classifyDelta', () => {
  it('returns accurate within tolerance', () => {
    const out = svc.classifyDelta(100, 110);
    expect(out.classification).toBe('accurate');
    expect(out.fraction).toBeCloseTo(0.1, 2);
  });
  it('returns pessimistic when actual significantly exceeds predicted', () => {
    expect(svc.classifyDelta(100, 200).classification).toBe('pessimistic');
  });
  it('returns optimistic when actual significantly under predicted', () => {
    expect(svc.classifyDelta(100, 20).classification).toBe('optimistic');
  });
  it('returns unknown when inputs are missing', () => {
    expect(svc.classifyDelta(null, 100).classification).toBe('unknown');
    expect(svc.classifyDelta(50, null).classification).toBe('unknown');
  });
  it('uses absolute denominator to avoid division by zero', () => {
    const out = svc.classifyDelta(0, 0);
    expect(out.classification).toBe('accurate');
  });
});
