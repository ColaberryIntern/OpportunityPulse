// Deep Research Phase 2 — ventureScoring.service tests.
// Pure deterministic scoring engine — no mocks needed.

const svc = require('../../src/deepResearch/ventureScoring.service');

const context = {
  totals: { buildableResearchCount: 5 },
  channels: [
    { key: 'research', label: 'Research', count: 12 },
    { key: 'government', label: 'Government', count: 6 },
  ],
};
const correlation = { correlation_strength: 0.7 };
const timing = { stage: 'breakout', timing_score: 0.8 };

describe('ventureScoring.WEIGHTS', () => {
  it('the dimension weights sum to 1.0', () => {
    const sum = Object.values(svc.WEIGHTS).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe('ventureScoring.scoreVenture', () => {
  it('scores all 8 dimensions and produces a weighted composite', () => {
    const idea = {
      title: 'Gov AI agent',
      description: 'An agent for federal procurement workflows.',
      buildability_score: 0.8,
      revenue_potential: 'high',
      metadata: { target_customers: 'federal agencies' },
    };
    const out = svc.scoreVenture(idea, { context, correlation, timing });
    const dims = Object.keys(out.scores);
    expect(dims).toHaveLength(8);
    expect(dims).toEqual(expect.arrayContaining([
      'commercialization', 'buildability', 'market_timing', 'competition_saturation',
      'technical_feasibility', 'revenue_potential', 'gov_alignment', 'ai_defensibility',
    ]));
    // every dimension is 0-100
    for (const v of Object.values(out.scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(out.composite_score).toBeGreaterThan(0);
    expect(out.composite_score).toBeLessThanOrEqual(100);
    expect(['strong_build', 'build', 'watch', 'pass']).toContain(out.recommendation_level);
    // a high-buildability, gov-targeted, breakout-timed idea should score well
    expect(out.composite_score).toBeGreaterThan(60);
    expect(out.scores.gov_alignment).toBeGreaterThan(50); // gov channel + "federal" text
  });

  it('tolerates the persisted camelCase shape too', () => {
    const idea = {
      title: 'X', buildabilityScore: 0.5, revenuePotential: 'medium', metadata: {},
    };
    const out = svc.scoreVenture(idea, { context, correlation, timing });
    expect(out.scores.buildability).toBe(50);
  });

  it('scores a weak idea low and recommends pass/watch', () => {
    const idea = {
      title: 'Speculative thing',
      description: 'no clear customer',
      buildability_score: 0.2,
      revenue_potential: 'low',
      metadata: {},
    };
    const out = svc.scoreVenture(idea, {
      context: { totals: { buildableResearchCount: 0 }, channels: [] },
      correlation: { correlation_strength: 0.1 },
      timing: { stage: 'saturated', timing_score: 0.2 },
    });
    expect(out.composite_score).toBeLessThan(55);
    expect(['watch', 'pass']).toContain(out.recommendation_level);
  });

  it('is deterministic — same inputs give the same score', () => {
    const idea = { title: 'X', buildability_score: 0.6, revenue_potential: 'high', metadata: {} };
    const a = svc.scoreVenture(idea, { context, correlation, timing });
    const b = svc.scoreVenture(idea, { context, correlation, timing });
    expect(a.composite_score).toBe(b.composite_score);
    expect(a.scores).toEqual(b.scores);
  });
});
