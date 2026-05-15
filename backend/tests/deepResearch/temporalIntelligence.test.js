// Deep Research Phase 5 — temporalIntelligence.service tests.

jest.mock('../../src/models', () => ({
  TemporalSnapshot: { create: jest.fn(), findAll: jest.fn() },
}));
const { TemporalSnapshot } = require('../../src/models');
const svc = require('../../src/deepResearch/temporalIntelligence.service');

beforeEach(() => { jest.clearAllMocks(); });

describe('temporalIntelligence.classifyDelta', () => {
  it('classifies deltas into the six categories', () => {
    expect(svc.classifyDelta(0)).toBe('stable');
    expect(svc.classifyDelta(0.12)).toBe('strengthening');
    expect(svc.classifyDelta(0.5)).toBe('accelerating');
    expect(svc.classifyDelta(-0.12)).toBe('weakening');
    expect(svc.classifyDelta(-0.5)).toBe('decelerating');
    expect(svc.classifyDelta(null)).toBe('insufficient_data');
    expect(svc.classifyDelta(NaN)).toBe('insufficient_data');
  });
});

describe('temporalIntelligence.recordMetric', () => {
  it('writes a snapshot row', async () => {
    TemporalSnapshot.create.mockResolvedValue({ id: 1 });
    await svc.recordMetric('staffing_pressure', 72.5, { scope: 'portfolio' });
    expect(TemporalSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      metricKey: 'staffing_pressure', metricValue: 72.5, scope: 'portfolio',
    }));
  });
});

describe('temporalIntelligence.getMetricMovement', () => {
  it('returns insufficient_data with zero or one sample', async () => {
    TemporalSnapshot.findAll.mockResolvedValue([]);
    expect((await svc.getMetricMovement('k')).classification).toBe('insufficient_data');
    TemporalSnapshot.findAll.mockResolvedValue([{ metricValue: 10 }]);
    expect((await svc.getMetricMovement('k')).classification).toBe('insufficient_data');
  });

  it('computes delta + classification with multiple samples', async () => {
    TemporalSnapshot.findAll.mockResolvedValue([
      { metricValue: 50 }, { metricValue: 60 }, { metricValue: 80 },
    ]);
    const out = await svc.getMetricMovement('staffing_pressure');
    expect(out.first).toBe(50);
    expect(out.last).toBe(80);
    expect(out.delta_absolute).toBe(30);
    expect(out.delta_fraction).toBe(0.6);
    expect(out.classification).toBe('accelerating');
  });
});
