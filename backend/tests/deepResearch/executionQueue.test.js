// Deep Research Phase 3 — executionQueue.service (orchestrator) tests.
// The deterministic engines (readiness, decision, deployment) run for real;
// the AI engines (mvpPlanning, launchStrategy) + ventureLifecycle are mocked.

jest.mock('../../src/models', () => ({
  VentureIdea: { findByPk: jest.fn(), findAll: jest.fn() },
  DeepResearchReport: { findByPk: jest.fn() },
  MonetizationModel: { findAll: jest.fn() },
  SignalCorrelation: { findOne: jest.fn() },
  ExecutionReadiness: { findOrCreate: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  MvpPlan: { findOne: jest.fn(), findOrCreate: jest.fn() },
  LaunchStrategy: { findOne: jest.fn(), findOrCreate: jest.fn() },
  DeploymentReadiness: { findOne: jest.fn(), findOrCreate: jest.fn() },
  ExecutionQueueItem: { findOrCreate: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  ProjectGenerationJob: { findAll: jest.fn() },
}));
jest.mock('../../src/deepResearch/mvpPlanning.service', () => ({ generateMvpPlan: jest.fn() }));
jest.mock('../../src/deepResearch/launchStrategy.service', () => ({ generateLaunchStrategy: jest.fn() }));
jest.mock('../../src/deepResearch/ventureLifecycle.service', () => ({
  STATES: ['discovered', 'evaluating', 'building', 'archived'],
  getLifecycle: jest.fn(),
}));

const M = require('../../src/models');
const mvpPlanning = require('../../src/deepResearch/mvpPlanning.service');
const launchStrategy = require('../../src/deepResearch/launchStrategy.service');
const ventureLifecycle = require('../../src/deepResearch/ventureLifecycle.service');
const svc = require('../../src/deepResearch/executionQueue.service');

function fakeRow(initial) {
  const row = { ...initial };
  row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
  row.toJSON = () => ({ ...row, update: undefined, toJSON: undefined });
  return row;
}

const ventureIdea = () => fakeRow({
  id: 1, reportId: 10, title: 'Gov AI Agent',
  buildabilityScore: 0.8, compositeScore: 75, recommendationLevel: 'strong_build',
  lifecycleState: 'evaluating', lifecycleOwner: null,
  scores: { technical_feasibility: 80, commercialization: 75, gov_alignment: 70, ai_defensibility: 60, competition_saturation: 70 },
  metadata: { target_customers: 'agencies', suggested_architecture: 'reuse pipeline' },
});

beforeEach(() => {
  jest.clearAllMocks();
  M.DeepResearchReport.findByPk.mockResolvedValue(fakeRow({
    id: 10, searchTerm: 'gov AI', marketStage: 'breakout', correlationStrength: 0.75, reportJson: {},
  }));
  M.MonetizationModel.findAll.mockResolvedValue([]);
  M.SignalCorrelation.findOne.mockResolvedValue(fakeRow({ convergenceType: 'commercial_acceleration' }));
  M.ProjectGenerationJob.findAll.mockResolvedValue([]);
  M.MvpPlan.findOne.mockResolvedValue(null);
  M.ExecutionReadiness.findOrCreate.mockResolvedValue([fakeRow({ ventureIdeaId: 1 }), true]);
  M.ExecutionQueueItem.findOrCreate.mockResolvedValue([fakeRow({ ventureIdeaId: 1 }), true]);
});

describe('executionQueue.assessVenture', () => {
  it('runs the deterministic engines, persists readiness + decision, refreshes the queue', async () => {
    M.VentureIdea.findByPk.mockResolvedValue(ventureIdea());
    const out = await svc.assessVenture(1);

    expect(out.execution_readiness.execution_readiness_score).toBeGreaterThan(0);
    expect(out.decision.decision).toBeTruthy();
    // readiness row updated, with the decision tucked into breakdown
    const erRow = (await M.ExecutionReadiness.findOrCreate.mock.results[0].value)[0];
    expect(erRow.update).toHaveBeenCalled();
    expect(erRow.breakdown.decision.decision).toBe(out.decision.decision);
    // queue item refreshed with a priority score
    const qItem = (await M.ExecutionQueueItem.findOrCreate.mock.results[0].value)[0];
    expect(qItem.update).toHaveBeenCalled();
    expect(qItem.priorityScore).toBeGreaterThanOrEqual(0);
  });

  it('throws NOT_FOUND for a missing venture idea', async () => {
    M.VentureIdea.findByPk.mockResolvedValue(null);
    await expect(svc.assessVenture(99)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('executionQueue.planMvp', () => {
  it('runs the AI engines + deterministic deployment readiness and persists each', async () => {
    M.VentureIdea.findByPk.mockResolvedValue(ventureIdea());
    M.ExecutionReadiness.findOne.mockResolvedValue(fakeRow({
      ventureIdeaId: 1, executionReadinessScore: 70, mvpTimelineWeeks: 10,
      technicalComplexity: 75, aiDependencyRisk: 70, operationalReadiness: 72, staffing: {},
    }));
    M.MvpPlan.findOrCreate.mockResolvedValue([fakeRow({ ventureIdeaId: 1 }), true]);
    M.LaunchStrategy.findOrCreate.mockResolvedValue([fakeRow({ ventureIdeaId: 1 }), true]);
    M.DeploymentReadiness.findOrCreate.mockResolvedValue([fakeRow({ ventureIdeaId: 1 }), true]);
    mvpPlanning.generateMvpPlan.mockResolvedValue({
      plan: { mvp_scope: 'scoped', phase_1_features: ['f1'], staffing: { roles: ['Lead'], headcount: 1 }, estimated_timeline_weeks: 10 },
      tokensUsed: 500,
    });
    launchStrategy.generateLaunchStrategy.mockResolvedValue({
      strategy: { icp: 'agencies', gtm: 'direct', channels: ['outbound'] }, tokensUsed: 400,
    });

    const out = await svc.planMvp(1);
    expect(out.mvpPlan).toBeTruthy();
    expect(out.launchStrategy).toBeTruthy();
    expect(out.deploymentReadiness).toBeTruthy();
    expect(out.errors).toHaveLength(0);
  });

  it('degrades gracefully when an AI engine fails — deployment readiness still runs', async () => {
    M.VentureIdea.findByPk.mockResolvedValue(ventureIdea());
    M.ExecutionReadiness.findOne.mockResolvedValue(fakeRow({
      ventureIdeaId: 1, executionReadinessScore: 70, technicalComplexity: 75,
      aiDependencyRisk: 70, operationalReadiness: 72, staffing: {},
    }));
    M.DeploymentReadiness.findOrCreate.mockResolvedValue([fakeRow({ ventureIdeaId: 1 }), true]);
    mvpPlanning.generateMvpPlan.mockRejectedValue(new Error('429 quota'));
    launchStrategy.generateLaunchStrategy.mockRejectedValue(new Error('429 quota'));

    const out = await svc.planMvp(1);
    expect(out.mvpPlan).toBeNull();
    expect(out.launchStrategy).toBeNull();
    expect(out.deploymentReadiness).toBeTruthy(); // deterministic — never fails
    expect(out.errors).toHaveLength(2);
  });
});

describe('executionQueue.listQueue', () => {
  it('returns priority-sorted items enriched with venture + readiness data', async () => {
    M.ExecutionQueueItem.findAll.mockResolvedValue([
      fakeRow({ id: 1, ventureIdeaId: 1, lifecycleState: 'evaluating', priorityScore: 80, blockers: [] }),
    ]);
    M.VentureIdea.findAll.mockResolvedValue([
      fakeRow({ id: 1, title: 'Gov AI Agent', reportId: 10, compositeScore: 75, recommendationLevel: 'strong_build' }),
    ]);
    M.ExecutionReadiness.findAll.mockResolvedValue([
      fakeRow({ ventureIdeaId: 1, executionReadinessScore: 70, breakdown: { decision: { decision: 'BUILD_NOW' } } }),
    ]);
    const out = await svc.listQueue();
    expect(out.items).toHaveLength(1);
    expect(out.items[0].venture_title).toBe('Gov AI Agent');
    expect(out.items[0].decision).toBe('BUILD_NOW');
    expect(out.items[0].execution_readiness_score).toBe(70);
  });

  it('returns an empty list when the queue is empty', async () => {
    M.ExecutionQueueItem.findAll.mockResolvedValue([]);
    const out = await svc.listQueue();
    expect(out.items).toEqual([]);
  });
});

describe('executionQueue.getPipeline', () => {
  it('groups ventures by lifecycle stage in canonical order', async () => {
    M.VentureIdea.findAll.mockResolvedValue([
      fakeRow({ id: 1, title: 'A', reportId: 10, lifecycleState: 'evaluating', compositeScore: 75 }),
      fakeRow({ id: 2, title: 'B', reportId: 10, lifecycleState: 'building', compositeScore: 60 }),
      fakeRow({ id: 3, title: 'C', reportId: 11, lifecycleState: 'evaluating', compositeScore: 50 }),
    ]);
    const out = await svc.getPipeline();
    const evaluating = out.stages.find((s) => s.state === 'evaluating');
    const building = out.stages.find((s) => s.state === 'building');
    expect(evaluating.ventures).toHaveLength(2);
    expect(building.ventures).toHaveLength(1);
  });
});

describe('executionQueue.getVentureExecution', () => {
  it('assembles every execution intelligence piece for a venture', async () => {
    M.VentureIdea.findByPk.mockResolvedValue(ventureIdea());
    ventureLifecycle.getLifecycle.mockResolvedValue({ current_state: 'evaluating', allowed_transitions: [], events: [] });
    M.ExecutionReadiness.findOne.mockResolvedValue(fakeRow({
      ventureIdeaId: 1, executionReadinessScore: 70, breakdown: { decision: { decision: 'BUILD_NOW' } },
    }));
    M.MvpPlan.findOne.mockResolvedValue(null);
    M.LaunchStrategy.findOne.mockResolvedValue(null);
    M.DeploymentReadiness.findOne.mockResolvedValue(null);
    M.ProjectGenerationJob.findAll.mockResolvedValue([]);
    M.ExecutionQueueItem.findOne.mockResolvedValue(null);

    const out = await svc.getVentureExecution(1);
    expect(out.venture_idea.id).toBe(1);
    expect(out.lifecycle.current_state).toBe('evaluating');
    expect(out.decision.decision).toBe('BUILD_NOW');
  });

  it('throws NOT_FOUND for a missing venture idea', async () => {
    M.VentureIdea.findByPk.mockResolvedValue(null);
    await expect(svc.getVentureExecution(99)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
