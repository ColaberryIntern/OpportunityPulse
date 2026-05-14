// Deep Research Phase 3 — ventureDecisionEngine.service tests.
// Pure deterministic rule engine — no mocks. Every decision path covered.

const svc = require('../../src/deepResearch/ventureDecisionEngine.service');

// A baseline "strong" input; each test overrides the fields its rule needs.
const base = {
  compositeScore: 75,
  executionScore: 70,
  marketStage: 'breakout',
  correlationStrength: 0.7,
  convergenceType: 'commercial_acceleration',
  competitionSaturation: 70,
  monetizationModelCount: 3,
};

describe('ventureDecisionEngine.decide — every decision path', () => {
  it('BUILD_NOW for strong scores in a breakout/acceleration market', () => {
    expect(svc.decide(base).decision).toBe('BUILD_NOW');
  });

  it('BUILD_SOON for solid scores but off-peak timing', () => {
    expect(svc.decide({ ...base, marketStage: 'emerging', compositeScore: 62, executionScore: 55 }).decision)
      .toBe('BUILD_SOON');
  });

  it('OVERSATURATED when competition room is low in a mature market', () => {
    expect(svc.decide({ ...base, competitionSaturation: 20, marketStage: 'mainstream' }).decision)
      .toBe('OVERSATURATED');
  });

  it('HIGH_RISK when execution readiness is very low', () => {
    expect(svc.decide({ ...base, executionScore: 30 }).decision).toBe('HIGH_RISK');
  });

  it('TOO_EARLY for an emerging market with weak correlation', () => {
    expect(svc.decide({ ...base, marketStage: 'emerging', correlationStrength: 0.2 }).decision)
      .toBe('TOO_EARLY');
  });

  it('NEEDS_VALIDATION for a low composite score', () => {
    expect(svc.decide({ ...base, compositeScore: 45 }).decision).toBe('NEEDS_VALIDATION');
  });

  it('NEEDS_VALIDATION for weak correlation + weak convergence', () => {
    expect(svc.decide({
      ...base, correlationStrength: 0.3, convergenceType: 'research_only', marketStage: 'acceleration',
    }).decision).toBe('NEEDS_VALIDATION');
  });

  it('MONITOR as the catch-all', () => {
    // Solid-ish but not enough for BUILD_SOON, not weak enough for the negatives.
    expect(svc.decide({
      ...base, compositeScore: 55, executionScore: 48, marketStage: 'mainstream',
    }).decision).toBe('MONITOR');
  });

  it('always returns a rationale + the explainable factor breakdown', () => {
    const out = svc.decide(base);
    expect(out.rationale).toBeTruthy();
    expect(out.factors.composite_score).toBe(75);
    expect(out.factors.market_stage).toBe('breakout');
  });

  it('is deterministic', () => {
    expect(svc.decide(base)).toEqual(svc.decide(base));
  });
});

describe('ventureDecisionEngine.decideForVenture', () => {
  it('extracts inputs from the domain objects', () => {
    const out = svc.decideForVenture({
      ventureIdea: { compositeScore: 75, scores: { competition_saturation: 70 } },
      report: { marketStage: 'breakout', correlationStrength: 0.7, signalCorrelation: { convergenceType: 'commercial_acceleration' } },
      executionReadiness: { execution_readiness_score: 70 },
      monetizationModels: [{}, {}],
    });
    expect(out.decision).toBe('BUILD_NOW');
    expect(out.factors.monetization_model_count).toBe(2);
  });
});
