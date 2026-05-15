// Deep Research Phase 6 — operationalDrift.service pure-logic tests.

const svc = require('../../src/deepResearch/operationalDrift.service');

// We assert the published severity floors so that detectors don't suddenly
// downgrade their seriousness without a deliberate code change.
describe('operationalDrift.severity constants', () => {
  it('publishes high/med/low severity floors', () => {
    expect(svc.SEVERITY_HIGH).toBe(80);
    expect(svc.SEVERITY_MED).toBe(55);
    expect(svc.SEVERITY_LOW).toBe(30);
  });
});

describe('operationalDrift module surface', () => {
  it('exports the five detectors', () => {
    expect(typeof svc.detectQueueDrift).toBe('function');
    expect(typeof svc.detectExecutionSlowdown).toBe('function');
    expect(typeof svc.detectStaffingImbalance).toBe('function');
    expect(typeof svc.detectDependencyAccumulation).toBe('function');
    expect(typeof svc.detectExecutionBottleneck).toBe('function');
  });
  it('exports an aggregate computeDrift', () => {
    expect(typeof svc.computeDrift).toBe('function');
  });
});
