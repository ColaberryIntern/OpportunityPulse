// Deep Research Phase 3 — execution intelligence orchestrator + queue.
//
// This service operationalizes the Phase 3 engines. It owns:
//   - assessVenture()  : run the deterministic engines (execution readiness +
//                        build-vs-monitor decision), persist, refresh the
//                        venture's execution queue row.
//   - planMvp()        : run the AI engines (MVP plan + launch strategy) +
//                        the deterministic deployment readiness, persist.
//   - getVentureExecution() : assemble every piece of execution intelligence
//                        for one venture (lifecycle, readiness, decision,
//                        MVP plan, launch strategy, deployment readiness, jobs).
//   - listQueue()      : the execution queue, priority-sorted.
//   - getPipeline()    : ventures grouped by lifecycle stage.
//
// The decision is persisted inside the execution_readiness.breakdown JSONB —
// it is computed in the same deterministic pass and has no independent
// lifecycle of its own.

const { Op } = require('sequelize');
const {
  VentureIdea, DeepResearchReport, MonetizationModel, SignalCorrelation,
  ExecutionReadiness, MvpPlan, LaunchStrategy, DeploymentReadiness,
  ExecutionQueueItem, ProjectGenerationJob,
} = require('../models');
const logger = require('../logging/logger');
const executionReadiness = require('./executionReadiness.service');
const ventureDecisionEngine = require('./ventureDecisionEngine.service');
const deploymentReadiness = require('./deploymentReadiness.service');
const mvpPlanning = require('./mvpPlanning.service');
const launchStrategy = require('./launchStrategy.service');
const ventureLifecycle = require('./ventureLifecycle.service');

// Decision → priority weight. BUILD_NOW rises to the top; risk/saturation sink.
const DECISION_PRIORITY = {
  BUILD_NOW: 30, BUILD_SOON: 20, NEEDS_VALIDATION: 6, MONITOR: 5,
  TOO_EARLY: -5, OVERSATURATED: -12, HIGH_RISK: -12,
};

// Load a venture idea + the report context the engines need.
async function _loadVentureWithContext(ventureIdeaId) {
  const ventureIdea = await VentureIdea.findByPk(Number(ventureIdeaId));
  if (!ventureIdea) {
    const err = new Error(`Venture idea ${ventureIdeaId} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const [report, monetizationModels, signalCorrelation] = await Promise.all([
    ventureIdea.reportId ? DeepResearchReport.findByPk(ventureIdea.reportId) : null,
    MonetizationModel.findAll({ where: { reportId: ventureIdea.reportId || 0 } }),
    SignalCorrelation.findOne({ where: { reportId: ventureIdea.reportId || 0 } }),
  ]);
  // Attach the correlation onto the report object so the decision engine can
  // read it the same way it would from getReport().
  const reportCtx = report ? report.toJSON() : {};
  if (signalCorrelation) reportCtx.signalCorrelation = signalCorrelation.toJSON();
  return { ventureIdea, report: reportCtx, monetizationModels: monetizationModels || [] };
}

// Recompute the venture's priority score + blockers and upsert its queue row.
async function _refreshQueueItem(ventureIdea, { erRow, decision, mvpPlan, jobs }) {
  const composite = Number(ventureIdea.compositeScore) || 0;
  const erScore = erRow ? Number(erRow.executionReadinessScore) : 0;
  const decisionWeight = decision ? (DECISION_PRIORITY[decision.decision] || 0) : 0;
  const priority = Math.max(0, Math.min(100, Number(
    (erScore * 0.4 + composite * 0.3 + decisionWeight + 25).toFixed(2),
  )));

  const blockers = [];
  const completedJob = (jobs || []).find((j) => j.status === 'success');
  if (!completedJob) blockers.push('Requirements not yet generated');
  if (!mvpPlan && ['planning_mvp', 'building', 'validating', 'launching'].includes(ventureIdea.lifecycleState)) {
    blockers.push('MVP plan missing for current lifecycle stage');
  }
  if (erRow && Number(erRow.executionReadinessScore) < 45) blockers.push('Low execution readiness');
  if (decision && (decision.decision === 'HIGH_RISK' || decision.decision === 'OVERSATURATED')) {
    blockers.push(`Decision engine flagged ${decision.decision}`);
  }

  const [item] = await ExecutionQueueItem.findOrCreate({
    where: { ventureIdeaId: ventureIdea.id },
    defaults: {
      ventureIdeaId: ventureIdea.id,
      lifecycleState: ventureIdea.lifecycleState,
      owner: ventureIdea.lifecycleOwner,
    },
  });
  await item.update({
    lifecycleState: ventureIdea.lifecycleState,
    priorityScore: priority,
    owner: ventureIdea.lifecycleOwner,
    blockers,
  });
  return item;
}

// ASSESS — run the deterministic engines (execution readiness + decision),
// persist, refresh the queue row. Cheap (no AI) — safe to call often.
async function assessVenture(ventureIdeaId) {
  const { ventureIdea, report, monetizationModels } = await _loadVentureWithContext(ventureIdeaId);

  const readiness = executionReadiness.assessExecutionReadiness(ventureIdea, { report });
  const decision = ventureDecisionEngine.decideForVenture({
    ventureIdea, report, executionReadiness: readiness, monetizationModels,
  });

  // Persist execution readiness — the decision rides in the breakdown JSONB.
  const breakdown = { ...readiness.breakdown, decision };
  const [erRow] = await ExecutionReadiness.findOrCreate({
    where: { ventureIdeaId: ventureIdea.id },
    defaults: { ventureIdeaId: ventureIdea.id },
  });
  await erRow.update({
    executionReadinessScore: readiness.execution_readiness_score,
    mvpTimelineWeeks: readiness.mvp_timeline_weeks,
    technicalComplexity: readiness.technical_complexity,
    aiDependencyRisk: readiness.ai_dependency_risk,
    marketReadiness: readiness.market_readiness,
    operationalReadiness: readiness.operational_readiness,
    staffing: readiness.staffing,
    infrastructure: readiness.infrastructure,
    breakdown,
    rationale: readiness.rationale,
  });

  const jobs = await ProjectGenerationJob.findAll({ where: { ventureIdeaId: ventureIdea.id } });
  const mvpPlan = await MvpPlan.findOne({ where: { ventureIdeaId: ventureIdea.id } });
  await _refreshQueueItem(ventureIdea, { erRow, decision, mvpPlan, jobs });

  logger.info('executionQueue: venture assessed', {
    ventureIdeaId: ventureIdea.id,
    executionScore: readiness.execution_readiness_score,
    decision: decision.decision,
  });
  return { execution_readiness: { ...readiness, breakdown }, decision };
}

// PLAN MVP — run the AI engines (MVP plan + launch strategy) + the
// deterministic deployment readiness. Heavier (two AI calls). Each AI step
// is independent: one failing does not block the other or the deterministic
// deployment readiness.
async function planMvp(ventureIdeaId) {
  const { ventureIdea, report, monetizationModels } = await _loadVentureWithContext(ventureIdeaId);
  const erRow = await ExecutionReadiness.findOne({ where: { ventureIdeaId: ventureIdea.id } });
  const erContext = erRow ? {
    execution_readiness_score: Number(erRow.executionReadinessScore),
    mvp_timeline_weeks: erRow.mvpTimelineWeeks,
    technical_complexity: Number(erRow.technicalComplexity),
    ai_dependency_risk: Number(erRow.aiDependencyRisk),
    operational_readiness: Number(erRow.operationalReadiness),
    staffing: erRow.staffing,
  } : {};

  const result = { mvpPlan: null, launchStrategy: null, deploymentReadiness: null, errors: [] };

  // MVP plan (AI).
  try {
    const { plan } = await mvpPlanning.generateMvpPlan(ventureIdea, {
      report, executionReadiness: erContext,
    });
    const [row] = await MvpPlan.findOrCreate({
      where: { ventureIdeaId: ventureIdea.id }, defaults: { ventureIdeaId: ventureIdea.id },
    });
    await row.update({
      mvpScope: plan.mvp_scope,
      phase1Features: plan.phase_1_features,
      fastLaunchFeatures: plan.fast_launch_features,
      futureRoadmap: plan.future_roadmap,
      suggestedArchitecture: plan.suggested_architecture,
      suggestedStack: plan.suggested_stack,
      recommendedAiComponents: plan.recommended_ai_components,
      staffing: plan.staffing,
      estimatedTimelineWeeks: plan.estimated_timeline_weeks,
      generatedBy: plan.generated_by,
    });
    result.mvpPlan = row.toJSON();
  } catch (e) {
    result.errors.push({ step: 'mvp_plan', error: e.message });
    logger.warn('executionQueue: MVP plan generation failed', { ventureIdeaId: ventureIdea.id, error: e.message });
  }

  // Launch strategy (AI).
  try {
    const { strategy } = await launchStrategy.generateLaunchStrategy(ventureIdea, {
      report, monetizationModels,
    });
    const [row] = await LaunchStrategy.findOrCreate({
      where: { ventureIdeaId: ventureIdea.id }, defaults: { ventureIdeaId: ventureIdea.id },
    });
    await row.update({
      icp: strategy.icp,
      gtm: strategy.gtm,
      landingPage: strategy.landing_page,
      outreach: strategy.outreach,
      channels: strategy.channels,
      pricingStrategy: strategy.pricing_strategy,
      pilotStrategy: strategy.pilot_strategy,
      enterpriseStrategy: strategy.enterprise_strategy,
      govStrategy: strategy.gov_strategy,
      generatedBy: strategy.generated_by,
    });
    result.launchStrategy = row.toJSON();
  } catch (e) {
    result.errors.push({ step: 'launch_strategy', error: e.message });
    logger.warn('executionQueue: launch strategy generation failed', { ventureIdeaId: ventureIdea.id, error: e.message });
  }

  // Deployment readiness (deterministic — never fails).
  const jobs = await ProjectGenerationJob.findAll({ where: { ventureIdeaId: ventureIdea.id } });
  const hasCompletedRequirements = jobs.some((j) => j.status === 'success');
  const dr = deploymentReadiness.assessDeploymentReadiness({
    ventureIdea,
    executionReadiness: erContext,
    hasCompletedRequirements,
    hasMvpPlan: !!result.mvpPlan,
  });
  const [drRow] = await DeploymentReadiness.findOrCreate({
    where: { ventureIdeaId: ventureIdea.id }, defaults: { ventureIdeaId: ventureIdea.id },
  });
  await drRow.update({
    readinessLevel: dr.readiness_level,
    requirementsCompleteness: dr.requirements_completeness,
    architectureQuality: dr.architecture_quality,
    aiDependencyRisk: dr.ai_dependency_risk,
    infrastructureReadiness: dr.infrastructure_readiness,
    complianceExposure: dr.compliance_exposure,
    breakdown: dr.breakdown,
    rationale: dr.rationale,
  });
  result.deploymentReadiness = drRow.toJSON();

  // Refresh the queue row now that an MVP plan may exist.
  await _refreshQueueItem(ventureIdea, {
    erRow,
    decision: erRow && erRow.breakdown ? erRow.breakdown.decision : null,
    mvpPlan: result.mvpPlan,
    jobs,
  });

  logger.info('executionQueue: MVP planning complete', {
    ventureIdeaId: ventureIdea.id,
    mvpPlan: !!result.mvpPlan,
    launchStrategy: !!result.launchStrategy,
    deploymentLevel: dr.readiness_level,
    errors: result.errors.length,
  });
  return result;
}

// Assemble every piece of execution intelligence for one venture idea.
async function getVentureExecution(ventureIdeaId) {
  const id = Number(ventureIdeaId);
  const ventureIdea = await VentureIdea.findByPk(id);
  if (!ventureIdea) {
    const err = new Error(`Venture idea ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const [lifecycle, erRow, mvpPlan, launch, drRow, jobs, queueItem] = await Promise.all([
    ventureLifecycle.getLifecycle(id),
    ExecutionReadiness.findOne({ where: { ventureIdeaId: id } }),
    MvpPlan.findOne({ where: { ventureIdeaId: id } }),
    LaunchStrategy.findOne({ where: { ventureIdeaId: id } }),
    DeploymentReadiness.findOne({ where: { ventureIdeaId: id } }),
    ProjectGenerationJob.findAll({ where: { ventureIdeaId: id } }),
    ExecutionQueueItem.findOne({ where: { ventureIdeaId: id } }),
  ]);
  return {
    venture_idea: ventureIdea.toJSON(),
    lifecycle,
    execution_readiness: erRow ? erRow.toJSON() : null,
    decision: erRow && erRow.breakdown ? (erRow.breakdown.decision || null) : null,
    mvp_plan: mvpPlan ? mvpPlan.toJSON() : null,
    launch_strategy: launch ? launch.toJSON() : null,
    deployment_readiness: drRow ? drRow.toJSON() : null,
    generation_jobs: jobs.map((j) => j.toJSON()),
    queue_item: queueItem ? queueItem.toJSON() : null,
  };
}

// The execution queue — every queued venture, priority-sorted, with the
// venture title + report id + decision attached for the dashboard.
async function listQueue({ lifecycleState } = {}) {
  const where = {};
  if (lifecycleState) where.lifecycleState = lifecycleState;
  const items = await ExecutionQueueItem.findAll({
    where,
    order: [['priority_score', 'DESC']],
  });
  const ventureIds = items.map((i) => i.ventureIdeaId);
  if (ventureIds.length === 0) return { items: [] };
  const [ventures, erRows] = await Promise.all([
    VentureIdea.findAll({ where: { id: { [Op.in]: ventureIds } } }),
    ExecutionReadiness.findAll({ where: { ventureIdeaId: { [Op.in]: ventureIds } } }),
  ]);
  const ventureMap = new Map(ventures.map((v) => [v.id, v]));
  const erMap = new Map(erRows.map((e) => [e.ventureIdeaId, e]));
  return {
    items: items.map((i) => {
      const v = ventureMap.get(i.ventureIdeaId);
      const er = erMap.get(i.ventureIdeaId);
      return {
        ...i.toJSON(),
        venture_title: v ? v.title : null,
        report_id: v ? v.reportId : null,
        composite_score: v && v.compositeScore != null ? Number(v.compositeScore) : null,
        recommendation_level: v ? v.recommendationLevel : null,
        execution_readiness_score: er ? Number(er.executionReadinessScore) : null,
        decision: er && er.breakdown && er.breakdown.decision ? er.breakdown.decision.decision : null,
      };
    }),
  };
}

// The pipeline — ventures grouped by lifecycle stage, in canonical order.
async function getPipeline() {
  const ventures = await VentureIdea.findAll({ order: [['composite_score', 'DESC']] });
  const stages = {};
  for (const state of ventureLifecycle.STATES) stages[state] = [];
  for (const v of ventures) {
    const state = v.lifecycleState || 'discovered';
    if (!stages[state]) stages[state] = [];
    stages[state].push({
      venture_idea_id: v.id,
      title: v.title,
      report_id: v.reportId,
      composite_score: v.compositeScore != null ? Number(v.compositeScore) : null,
      recommendation_level: v.recommendationLevel,
      owner: v.lifecycleOwner,
    });
  }
  return {
    stages: ventureLifecycle.STATES.map((state) => ({
      state, ventures: stages[state] || [],
    })),
  };
}

module.exports = {
  DECISION_PRIORITY,
  assessVenture,
  planMvp,
  getVentureExecution,
  listQueue,
  getPipeline,
};
