// Deep Research Phase 3 — mvpPlanning.service tests.

jest.mock('../../src/deepResearch/aiProvider.service', () => ({ chat: jest.fn() }));

const aiProvider = require('../../src/deepResearch/aiProvider.service');
const svc = require('../../src/deepResearch/mvpPlanning.service');

beforeEach(() => { aiProvider.chat.mockReset(); });

const ventureIdea = {
  title: 'Constituent Triage Agent',
  description: 'Triages inbound constituent requests.',
  buildability_score: 0.75,
  metadata: { suggested_architecture: 'reuse the classification pipeline', target_customers: 'agencies' },
};

describe('mvpPlanning.sanitizePlan', () => {
  it('clamps arrays, shapes staffing, and attaches the deterministic timeline', () => {
    const plan = svc.sanitizePlan({
      mvp_scope: 'x'.repeat(2000),
      phase_1_features: Array(20).fill('feature'),
      staffing: { roles: ['Tech lead', 'Engineer'], headcount: 2 },
    }, 10);
    expect(plan.mvp_scope).toHaveLength(1000);
    expect(plan.phase_1_features.length).toBeLessThanOrEqual(9);
    expect(plan.staffing.headcount).toBe(2);
    expect(plan.estimated_timeline_weeks).toBe(10);
    expect(plan.generated_by).toBe('deep-research-phase-3-mvp-planning');
  });

  it('falls back to roles.length when headcount is missing', () => {
    const plan = svc.sanitizePlan({ staffing: { roles: ['A', 'B', 'C'] } }, 8);
    expect(plan.staffing.headcount).toBe(3);
  });
});

describe('mvpPlanning.generateMvpPlan', () => {
  it('uses the execution readiness timeline when provided', async () => {
    aiProvider.chat.mockResolvedValue({
      content: JSON.stringify({ mvp_scope: 'a scoped MVP', phase_1_features: ['f1', 'f2'] }),
      tokensUsed: 900,
    });
    const { plan, tokensUsed } = await svc.generateMvpPlan(ventureIdea, {
      report: { searchTerm: 'agents', marketStage: 'breakout' },
      executionReadiness: { mvp_timeline_weeks: 9, execution_readiness_score: 72 },
    });
    expect(plan.estimated_timeline_weeks).toBe(9);
    expect(plan.mvp_scope).toBe('a scoped MVP');
    expect(tokensUsed).toBe(900);
  });

  it('derives a timeline from buildability when execution readiness is absent', async () => {
    aiProvider.chat.mockResolvedValue({ content: JSON.stringify({ mvp_scope: 'x' }), tokensUsed: 100 });
    const { plan } = await svc.generateMvpPlan(ventureIdea, { report: {} });
    // buildability 0.75 → ~10 weeks; just assert it's a sane positive number
    expect(plan.estimated_timeline_weeks).toBeGreaterThan(0);
    expect(plan.estimated_timeline_weeks).toBeLessThanOrEqual(22);
  });

  it('tolerates non-JSON AI output', async () => {
    aiProvider.chat.mockResolvedValue({ content: 'sorry', tokensUsed: 5 });
    const { plan } = await svc.generateMvpPlan(ventureIdea, { report: {} });
    expect(plan.mvp_scope).toBe('');
    expect(plan.phase_1_features).toEqual([]);
  });

  it('propagates an AI failure', async () => {
    aiProvider.chat.mockRejectedValue(new Error('429 quota'));
    await expect(svc.generateMvpPlan(ventureIdea, { report: {} })).rejects.toThrow('429 quota');
  });
});
