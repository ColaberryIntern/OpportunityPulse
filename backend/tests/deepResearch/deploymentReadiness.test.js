// Deep Research Phase 3 — deploymentReadiness.service tests.
// Pure deterministic engine — no mocks.

const svc = require('../../src/deepResearch/deploymentReadiness.service');

const strongExecutionReadiness = {
  technical_complexity: 85, ai_dependency_risk: 80, operational_readiness: 82,
};

describe('deploymentReadiness.assessDeploymentReadiness', () => {
  it('classifies prototype when nothing is in place yet', () => {
    const out = svc.assessDeploymentReadiness({
      ventureIdea: { scores: {}, metadata: {} },
      executionReadiness: { technical_complexity: 30, ai_dependency_risk: 30, operational_readiness: 30 },
      hasCompletedRequirements: false,
      hasMvpPlan: false,
    });
    expect(out.readiness_level).toBe('prototype');
  });

  it('classifies mvp once an MVP plan exists', () => {
    const out = svc.assessDeploymentReadiness({
      ventureIdea: { scores: { technical_feasibility: 60 }, metadata: { suggested_architecture: 'x' } },
      executionReadiness: { technical_complexity: 55, ai_dependency_risk: 55, operational_readiness: 55 },
      hasCompletedRequirements: false,
      hasMvpPlan: true,
    });
    expect(['mvp', 'production']).toContain(out.readiness_level);
  });

  it('classifies production/enterprise with completed requirements + strong readiness', () => {
    const out = svc.assessDeploymentReadiness({
      ventureIdea: {
        scores: { technical_feasibility: 80, gov_alignment: 30 },
        metadata: { suggested_architecture: 'reuse the existing pipeline' },
      },
      executionReadiness: strongExecutionReadiness,
      hasCompletedRequirements: true,
      hasMvpPlan: true,
    });
    expect(['production', 'enterprise']).toContain(out.readiness_level);
    expect(out.requirements_completeness).toBeGreaterThan(70);
  });

  it('reports all five sub-scores + a rationale', () => {
    const out = svc.assessDeploymentReadiness({
      ventureIdea: { scores: { gov_alignment: 80 }, metadata: {} },
      executionReadiness: strongExecutionReadiness,
      hasCompletedRequirements: true,
      hasMvpPlan: true,
    });
    for (const k of ['requirements_completeness', 'architecture_quality', 'ai_dependency_risk',
      'infrastructure_readiness', 'compliance_exposure']) {
      expect(out[k]).toBeGreaterThanOrEqual(0);
      expect(out[k]).toBeLessThanOrEqual(100);
    }
    // gov-aligned venture carries high compliance exposure
    expect(out.compliance_exposure).toBeGreaterThan(60);
    expect(out.rationale).toBeTruthy();
    expect(svc.LEVELS).toContain(out.readiness_level);
  });

  it('is deterministic', () => {
    const args = {
      ventureIdea: { scores: { technical_feasibility: 70 }, metadata: {} },
      executionReadiness: strongExecutionReadiness,
      hasCompletedRequirements: true,
      hasMvpPlan: true,
    };
    expect(svc.assessDeploymentReadiness(args)).toEqual(svc.assessDeploymentReadiness(args));
  });
});
