// Deep Research Phase 3 — executionReadiness.service tests.
// Pure deterministic engine — no mocks.

const svc = require('../../src/deepResearch/executionReadiness.service');

const strongIdea = {
  title: 'Gov AI agent',
  buildability_score: 0.85,
  composite_score: 78,
  scores: {
    technical_feasibility: 80, commercialization: 75, gov_alignment: 70, ai_defensibility: 60,
  },
  metadata: { target_customers: 'federal agencies', suggested_architecture: 'reuse vector store' },
};
const strongReport = { marketStage: 'breakout', correlationStrength: 0.75 };

describe('executionReadiness.WEIGHTS', () => {
  it('the sub-score weights sum to 1.0', () => {
    const sum = Object.values(svc.WEIGHTS).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe('executionReadiness.estimateTimelineWeeks', () => {
  it('maps high technical readiness to a short timeline', () => {
    expect(svc.estimateTimelineWeeks(100)).toBe(6);
    expect(svc.estimateTimelineWeeks(0)).toBe(22);
    expect(svc.estimateTimelineWeeks(50)).toBe(14);
  });
});

describe('executionReadiness.deriveStaffing', () => {
  it('adds more roles for harder builds', () => {
    const easy = svc.deriveStaffing(85, 70);
    const hard = svc.deriveStaffing(40, 40);
    expect(hard.headcount).toBeGreaterThan(easy.headcount);
    expect(easy.roles).toContain('Tech lead');
  });
});

describe('executionReadiness.assessExecutionReadiness', () => {
  it('scores all four dimensions, the composite, and derives timeline + staffing', () => {
    const out = svc.assessExecutionReadiness(strongIdea, { report: strongReport });
    for (const k of ['technical_complexity', 'ai_dependency_risk', 'market_readiness', 'operational_readiness']) {
      expect(out[k]).toBeGreaterThanOrEqual(0);
      expect(out[k]).toBeLessThanOrEqual(100);
    }
    expect(out.execution_readiness_score).toBeGreaterThan(60); // strong idea
    expect(out.mvp_timeline_weeks).toBeGreaterThan(0);
    expect(out.staffing.headcount).toBeGreaterThan(0);
    expect(Array.isArray(out.infrastructure.items)).toBe(true);
    expect(out.rationale).toBeTruthy();
    expect(out.breakdown.weights).toEqual(svc.WEIGHTS);
  });

  it('scores a weak idea low', () => {
    const weak = svc.assessExecutionReadiness({
      title: 'X', buildability_score: 0.2, composite_score: 35, scores: {}, metadata: {},
    }, { report: { marketStage: 'declining', correlationStrength: 0.1 } });
    expect(weak.execution_readiness_score).toBeLessThan(50);
  });

  it('tolerates the persisted camelCase shape', () => {
    const out = svc.assessExecutionReadiness({
      title: 'X', buildabilityScore: 0.6, compositeScore: 60, scores: {}, metadata: {},
    }, { report: strongReport });
    expect(out.execution_readiness_score).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = svc.assessExecutionReadiness(strongIdea, { report: strongReport });
    const b = svc.assessExecutionReadiness(strongIdea, { report: strongReport });
    expect(a).toEqual(b);
  });
});
