// Deep Research Phase 5 — ventureTrajectory.service tests.

const svc = require('../../src/deepResearch/ventureTrajectory.service');

describe('ventureTrajectory.classifyTrajectory', () => {
  it('returns unknown when there is no data at all', () => {
    expect(svc.classifyTrajectory({
      confidenceDelta: null, scoreDelta01: null, lifecycleVelocity: null, periodDays: 30,
    })).toBe('unknown');
  });
  it('classifies stagnating when stuck for a long time with no movement', () => {
    expect(svc.classifyTrajectory({
      confidenceDelta: 0, scoreDelta01: 0, lifecycleVelocity: 0, periodDays: 45,
    })).toBe('stagnating');
  });
  it('classifies accelerating when deltas are high + velocity > 0', () => {
    expect(svc.classifyTrajectory({
      confidenceDelta: 0.25, scoreDelta01: 0.3, lifecycleVelocity: 0.1, periodDays: 30,
    })).toBe('accelerating');
  });
  it('classifies strengthening for moderate positive movement', () => {
    expect(svc.classifyTrajectory({
      confidenceDelta: 0.1, scoreDelta01: 0.08, lifecycleVelocity: 0, periodDays: 30,
    })).toBe('strengthening');
  });
  it('classifies weakening for negative movement', () => {
    expect(svc.classifyTrajectory({
      confidenceDelta: -0.12, scoreDelta01: -0.1, lifecycleVelocity: 0, periodDays: 30,
    })).toBe('weakening');
  });
  it('classifies stable as the default', () => {
    expect(svc.classifyTrajectory({
      confidenceDelta: 0.01, scoreDelta01: 0.01, lifecycleVelocity: 0.05, periodDays: 30,
    })).toBe('stable');
  });
});
