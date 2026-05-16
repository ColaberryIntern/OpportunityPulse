// Deep Research Intelligence Engine — HTTP controller.
//
// Thin layer: validates input, delegates to the services, maps domain
// error codes (BAD_INPUT / NOT_FOUND) to HTTP status. No business logic.

const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const deepResearch = require('./deepResearch.service');
const projectArchitectBridge = require('./projectArchitectBridge.service');
const briefingSubscription = require('./briefingSubscription.service');
const ventureLifecycle = require('./ventureLifecycle.service');
const executionQueue = require('./executionQueue.service');
const portfolioIntelligence = require('./portfolioIntelligence.service');
const resourceCapacity = require('./resourceCapacity.service');
const portfolioPrioritization = require('./portfolioPrioritization.service');
const portfolioForecasting = require('./portfolioForecasting.service');
const sharedInfrastructure = require('./sharedInfrastructure.service');
const ventureDependency = require('./ventureDependency.service');
const executionCapacityPlanner = require('./executionCapacityPlanner.service');
const ventureTemplate = require('./ventureTemplate.service');
const confidenceDecay = require('./confidenceDecay.service');
const observatoryIntelligence = require('./observatoryIntelligence.service');
const ecosystemEvolution = require('./ecosystemEvolution.service');
const ventureTrajectory = require('./ventureTrajectory.service');
const decisionAccuracy = require('./decisionAccuracy.service');
const predictiveCapacity = require('./predictiveCapacity.service');
const strategicDrift = require('./strategicDrift.service');
const signalHistory = require('./signalHistory.service');
const historicalPortfolio = require('./historicalPortfolio.service');
// Phase 6 — adaptive strategic operations.
const adaptiveRefresh = require('./adaptiveRefresh.service');
const refreshHistory = require('./refreshHistory.service');
const executiveIntervention = require('./executiveIntervention.service');
const strategicRecommendation = require('./strategicRecommendation.service');
const adaptiveAnalytics = require('./adaptiveAnalytics.service');
const ventureHealth = require('./ventureHealth.service');
const forecastReality = require('./forecastReality.service');
const operationalDrift = require('./operationalDrift.service');
const dependencyReview = require('./dependencyReview.service');
const planningWorkspace = require('./planningWorkspace.service');
// Phase 7 — traceability + opportunity action intelligence.
const opportunityTraceability = require('./opportunityTraceability.service');
const opportunityRelationships = require('./opportunityRelationships.service');
const opportunityGraph = require('./opportunityGraph.service');
const clusterDrilldown = require('./clusterDrilldown.service');
const opportunityJustification = require('./opportunityJustification.service');
const customResearchRun = require('./customResearchRun.service');
const proposalAcceleration = require('./proposalAcceleration.service');
const pursuitWorkspace = require('./pursuitWorkspace.service');
const actionIntelligence = require('./actionIntelligence.service');
// Phase 7.5 — strategic context bridge into My Opportunities.
const deepResearchContext = require('./deepResearchContext.service');
// Phase 8 — pursuit activation + strategic capture intelligence.
const pursuitActivation = require('./pursuitActivation.service');
const reviewQueueBridge = require('./reviewQueueBridge.service');
const proposalReadiness = require('./proposalReadiness.service');
const opportunityExpansion = require('./opportunityExpansion.service');
const ventureConflict = require('./ventureConflict.service');
const researchRevenue = require('./researchRevenue.service');
const captureStrategy = require('./captureStrategy.service');
const submissionReadiness = require('./submissionReadiness.service');
// Phase 9 — submission readiness + compliance intelligence.
const rfpAttachment = require('./rfpAttachment.service');
const proposalArtifact = require('./proposalArtifact.service');
const complianceMatrix = require('./complianceMatrix.service');
const submissionPackage = require('./submissionPackage.service');
const proposalTimeline = require('./proposalTimeline.service');
const complianceGap = require('./complianceGap.service');
const submissionReadinessEngine = require('./submissionReadinessEngine.service');
const parallelDraftQueue = require('./parallelDraftQueue.service');
const pursuitContextInjector = require('./pursuitContextInjector.service');
const captureOps = require('./captureOps.service');
// Phase 10 — operational scalability + execution infrastructure.
const storage = require('./storage.service');
const captureWorker = require('./captureWorker.service');
const proposalExecutionQueue = require('./proposalExecutionQueue.service');
const slaIntelligence = require('./slaIntelligence.service');
const artifactLifecycle = require('./artifactLifecycle.service');
const queueObservability = require('./queueObservability.service');
const pursuitContextWiring = require('./pursuitContextWiring.service');
const durableDraftGeneration = require('./durableDraftGeneration.service');
const complianceMatrixLlm = require('./complianceMatrixLlm.service');
const captureInfra = require('./captureInfra.service');
// Phase 11 — multi-tenant governance + operational auditability.
const tenantIsolation = require('./tenantIsolation.service');
const rbac = require('./rbac.service');
const auditTrail = require('./auditTrail.service');
const eventLineage = require('./eventLineage.service');
const slaEscalation = require('./slaEscalation.service');
const workflowGovernance = require('./workflowGovernance.service');
const storageProviders = require('./storageProviders.service');
const observabilityStream = require('./observabilityStream.service');
const pursuitContextPrompt = require('./pursuitContextPrompt.service');
const governanceDashboard = require('./governanceDashboard.service');
// Phase 12 — cross-phase tenant backfill + LLM provenance hardening.
const promptProvenance = require('./promptProvenance.service');
const rbacCoverage = require('./rbacCoverage.service');
const slaDigest = require('./slaDigest.service');
const sseHotPaths = require('./sseHotPaths.service');
const assetMigration = require('./assetMigration.service');
const auditRetention = require('./auditRetention.service');
const governanceIntegrity = require('./governanceIntegrity.service');
const { sequelize: dbSequelize } = require('../models');
// Phase 13 — cross-phase provenance completion + governance consistency.
const crossProvenance = require('./crossProvenance.service');
const operationalLineage = require('./operationalLineage.service');
const permissionIntegrity = require('./permissionIntegrity.service');
const governanceConsistency = require('./governanceConsistency.service');
const proposalExplainability = require('./proposalExplainability.service');
const governanceDrift = require('./governanceDrift.service');
const approvalProvenance = require('./approvalProvenance.service');
const operationalReplay = require('./operationalReplay.service');
const streamIntegrity = require('./streamIntegrity.service');
const governanceAssurance = require('./governanceAssurance.service');

function mapError(res, e, context, fallbackMsg) {
  if (e.code === 'BAD_INPUT') return errorResponse(res, e.message, 400);
  if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
  logger.error(`deepResearch.${context} failed`, { error: e.message });
  return errorResponse(res, `${fallbackMsg}: ${e.message}`, 500);
}

// ---- reports --------------------------------------------------------------

// POST /api/v1/deep-research/run
async function run(req, res) {
  try {
    const { searchTerm, opportunityIds } = req.body || {};
    const report = await deepResearch.runDeepResearch({
      searchTerm,
      opportunityIds,
      userId: req.user ? req.user.id : null,
      origin: 'manual',
    });
    return successResponse(res, report, 'Deep research report generated', 201);
  } catch (e) {
    return mapError(res, e, 'run', 'Deep research run failed');
  }
}

// GET /api/v1/deep-research  — the reports index
async function listReports(req, res) {
  try {
    const out = await deepResearch.listReports({
      search: req.query.search,
      marketStage: req.query.marketStage,
      minConfidence: req.query.minConfidence,
      favorite: req.query.favorite,
      archived: req.query.archived,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return successResponse(res, out);
  } catch (e) {
    return mapError(res, e, 'listReports', 'Failed to list reports');
  }
}

// GET /api/v1/deep-research/:id
async function getReport(req, res) {
  try {
    const report = await deepResearch.getReport(req.params.id);
    return successResponse(res, report);
  } catch (e) {
    return mapError(res, e, 'getReport', 'Failed to load deep research report');
  }
}

// GET /api/v1/deep-research/:id/status
async function getStatus(req, res) {
  try {
    const status = await deepResearch.getReportStatus(req.params.id);
    return successResponse(res, status);
  } catch (e) {
    return mapError(res, e, 'getStatus', 'Failed to load report status');
  }
}

// GET /api/v1/deep-research/:id/versions
async function getVersions(req, res) {
  try {
    const versions = await deepResearch.getReportVersions(req.params.id);
    return successResponse(res, { versions });
  } catch (e) {
    return mapError(res, e, 'getVersions', 'Failed to load report versions');
  }
}

// POST /api/v1/deep-research/:id/rerun
async function reRun(req, res) {
  try {
    const report = await deepResearch.reRunReport(req.params.id, {
      userId: req.user ? req.user.id : null,
    });
    return successResponse(res, report, 'Report re-run complete');
  } catch (e) {
    return mapError(res, e, 'reRun', 'Report re-run failed');
  }
}

// PATCH /api/v1/deep-research/:id/flags  { favorite?, archived? }
async function setFlags(req, res) {
  try {
    const { favorite, archived } = req.body || {};
    let result = { id: Number(req.params.id) };
    if (favorite !== undefined) {
      result = { ...result, ...await deepResearch.setReportFlag(req.params.id, 'favorite', favorite) };
    }
    if (archived !== undefined) {
      result = { ...result, ...await deepResearch.setReportFlag(req.params.id, 'archived', archived) };
    }
    return successResponse(res, result, 'Report updated');
  } catch (e) {
    return mapError(res, e, 'setFlags', 'Failed to update report');
  }
}

// ---- requirements generation ----------------------------------------------

// POST /api/v1/deep-research/:id/generate-requirements  { ventureIdeaId }
async function generateRequirements(req, res) {
  try {
    const { ventureIdeaId } = req.body || {};
    const job = await projectArchitectBridge.createJob({
      ventureIdeaId,
      userId: req.user ? req.user.id : null,
    });
    return successResponse(res, {
      job_id: job.id,
      venture_idea_id: job.ventureIdeaId,
      status: job.status,
      progress_percent: job.progressPercent,
    }, 'Requirements generation started', 202);
  } catch (e) {
    return mapError(res, e, 'generateRequirements', 'Failed to start requirements generation');
  }
}

// GET /api/v1/deep-research/jobs/:id/status
async function getJobStatus(req, res) {
  try {
    const status = await projectArchitectBridge.getJobStatus(req.params.id);
    return successResponse(res, status);
  } catch (e) {
    return mapError(res, e, 'getJobStatus', 'Failed to load job status');
  }
}

// ---- briefing center ------------------------------------------------------

// GET /api/v1/deep-research/briefings
async function listBriefings(req, res) {
  try {
    const subscriptions = await briefingSubscription.listSubscriptions();
    return successResponse(res, { subscriptions });
  } catch (e) {
    return mapError(res, e, 'listBriefings', 'Failed to load briefing subscriptions');
  }
}

// POST /api/v1/deep-research/briefings
async function createBriefing(req, res) {
  try {
    const { scanTopic, frequency, recipients } = req.body || {};
    const sub = await briefingSubscription.createSubscription({
      scanTopic, frequency, recipients, createdBy: req.user ? req.user.id : null,
    });
    return successResponse(res, sub, 'Briefing subscription created', 201);
  } catch (e) {
    return mapError(res, e, 'createBriefing', 'Failed to create briefing subscription');
  }
}

// PATCH /api/v1/deep-research/briefings/:id
async function updateBriefing(req, res) {
  try {
    const sub = await briefingSubscription.updateSubscription(req.params.id, req.body || {});
    return successResponse(res, sub, 'Briefing subscription updated');
  } catch (e) {
    return mapError(res, e, 'updateBriefing', 'Failed to update briefing subscription');
  }
}

// DELETE /api/v1/deep-research/briefings/:id
async function deleteBriefing(req, res) {
  try {
    const result = await briefingSubscription.deleteSubscription(req.params.id);
    return successResponse(res, result, 'Briefing subscription deleted');
  } catch (e) {
    return mapError(res, e, 'deleteBriefing', 'Failed to delete briefing subscription');
  }
}

// GET /api/v1/deep-research/briefings/preview
async function previewBriefing(req, res) {
  try {
    const preview = await briefingSubscription.previewBriefing();
    return successResponse(res, preview);
  } catch (e) {
    return mapError(res, e, 'previewBriefing', 'Failed to render briefing preview');
  }
}

// GET /api/v1/deep-research/briefings/history
async function briefingHistory(req, res) {
  try {
    const history = await briefingSubscription.listPreviousBriefings({ limit: req.query.limit });
    return successResponse(res, { history });
  } catch (e) {
    return mapError(res, e, 'briefingHistory', 'Failed to load briefing history');
  }
}

// ---- Phase 3 — execution intelligence ------------------------------------

// GET /api/v1/deep-research/ventures/:id/lifecycle
async function getLifecycle(req, res) {
  try {
    const lifecycle = await ventureLifecycle.getLifecycle(req.params.id);
    return successResponse(res, lifecycle);
  } catch (e) {
    return mapError(res, e, 'getLifecycle', 'Failed to load venture lifecycle');
  }
}

// POST /api/v1/deep-research/ventures/:id/lifecycle  { toState, note }
async function transitionLifecycle(req, res) {
  try {
    const { toState, note } = req.body || {};
    const lifecycle = await ventureLifecycle.transition(req.params.id, toState, {
      actor: req.user ? (req.user.email || `user:${req.user.id}`) : null,
      note,
    });
    return successResponse(res, lifecycle, 'Lifecycle transitioned');
  } catch (e) {
    return mapError(res, e, 'transitionLifecycle', 'Lifecycle transition failed');
  }
}

// PATCH /api/v1/deep-research/ventures/:id/owner  { owner }
async function setVentureOwner(req, res) {
  try {
    const out = await ventureLifecycle.setOwner(req.params.id, (req.body || {}).owner);
    return successResponse(res, out, 'Owner updated');
  } catch (e) {
    return mapError(res, e, 'setVentureOwner', 'Failed to set owner');
  }
}

// POST /api/v1/deep-research/ventures/:id/assess
async function assessVenture(req, res) {
  try {
    const out = await executionQueue.assessVenture(req.params.id);
    return successResponse(res, out, 'Venture assessed');
  } catch (e) {
    return mapError(res, e, 'assessVenture', 'Venture assessment failed');
  }
}

// POST /api/v1/deep-research/ventures/:id/mvp-plan
async function planMvp(req, res) {
  try {
    const out = await executionQueue.planMvp(req.params.id);
    const status = out.errors && out.errors.length ? 'MVP planning completed with partial errors' : 'MVP plan generated';
    return successResponse(res, out, status);
  } catch (e) {
    return mapError(res, e, 'planMvp', 'MVP planning failed');
  }
}

// GET /api/v1/deep-research/ventures/:id/execution
async function getVentureExecution(req, res) {
  try {
    const out = await executionQueue.getVentureExecution(req.params.id);
    return successResponse(res, out);
  } catch (e) {
    return mapError(res, e, 'getVentureExecution', 'Failed to load venture execution intelligence');
  }
}

// GET /api/v1/deep-research/execution/queue
async function getExecutionQueue(req, res) {
  try {
    const out = await executionQueue.listQueue({ lifecycleState: req.query.lifecycleState });
    return successResponse(res, out);
  } catch (e) {
    return mapError(res, e, 'getExecutionQueue', 'Failed to load execution queue');
  }
}

// GET /api/v1/deep-research/execution/pipeline
async function getPipeline(req, res) {
  try {
    const out = await executionQueue.getPipeline();
    return successResponse(res, out);
  } catch (e) {
    return mapError(res, e, 'getPipeline', 'Failed to load opportunity pipeline');
  }
}

// ---- Phase 4 — portfolio intelligence ------------------------------------

async function refreshPortfolio(req, res) {
  try {
    const out = await portfolioIntelligence.refreshPortfolio();
    return successResponse(res, out, out.ok ? 'Portfolio refreshed' : 'Portfolio refreshed with errors');
  } catch (e) { return mapError(res, e, 'refreshPortfolio', 'Portfolio refresh failed'); }
}
async function getPortfolioDashboard(req, res) {
  try { return successResponse(res, await portfolioIntelligence.getPortfolioDashboard()); }
  catch (e) { return mapError(res, e, 'getPortfolioDashboard', 'Failed to load portfolio dashboard'); }
}
async function getCapacity(req, res) {
  try { return successResponse(res, await resourceCapacity.getLatestSnapshot()); }
  catch (e) { return mapError(res, e, 'getCapacity', 'Failed to load capacity snapshot'); }
}
async function getPortfolioRanking(req, res) {
  try { return successResponse(res, await portfolioPrioritization.getLatestRanking()); }
  catch (e) { return mapError(res, e, 'getPortfolioRanking', 'Failed to load portfolio ranking'); }
}
async function getForecasts(req, res) {
  try { return successResponse(res, await portfolioForecasting.getLatestForecast()); }
  catch (e) { return mapError(res, e, 'getForecasts', 'Failed to load ROI forecasts'); }
}
async function getOverlaps(req, res) {
  try { return successResponse(res, { overlaps: await sharedInfrastructure.listOverlaps() }); }
  catch (e) { return mapError(res, e, 'getOverlaps', 'Failed to load infrastructure overlaps'); }
}
async function getDependencies(req, res) {
  try { return successResponse(res, await ventureDependency.getDependencyGraph()); }
  catch (e) { return mapError(res, e, 'getDependencies', 'Failed to load dependency graph'); }
}
async function getCapacityPlan(req, res) {
  try { return successResponse(res, await executionCapacityPlanner.planCapacity()); }
  catch (e) { return mapError(res, e, 'getCapacityPlan', 'Failed to load capacity plan'); }
}
async function getTemplates(req, res) {
  try { return successResponse(res, { templates: await ventureTemplate.listTemplates() }); }
  catch (e) { return mapError(res, e, 'getTemplates', 'Failed to load venture templates'); }
}
async function getRecommendations(req, res) {
  try { return successResponse(res, { recommendations: await confidenceDecay.listPendingRecommendations() }); }
  catch (e) { return mapError(res, e, 'getRecommendations', 'Failed to load recommendations'); }
}
async function acknowledgeRecommendation(req, res) {
  try {
    const actor = req.user ? (req.user.email || `user:${req.user.id}`) : null;
    return successResponse(res, await confidenceDecay.acknowledgeRecommendation(req.params.id, actor), 'Acknowledged');
  } catch (e) { return mapError(res, e, 'acknowledgeRecommendation', 'Failed to acknowledge'); }
}
async function dismissRecommendation(req, res) {
  try {
    const actor = req.user ? (req.user.email || `user:${req.user.id}`) : null;
    return successResponse(res, await confidenceDecay.dismissRecommendation(req.params.id, actor), 'Dismissed');
  } catch (e) { return mapError(res, e, 'dismissRecommendation', 'Failed to dismiss'); }
}
async function getOperationalMetrics(req, res) {
  try { return successResponse(res, await portfolioIntelligence.computeOperationalMetrics()); }
  catch (e) { return mapError(res, e, 'getOperationalMetrics', 'Failed to load operational metrics'); }
}

// ---- Phase 5 — observatory + temporal intelligence -----------------------

async function refreshObservatory(req, res) {
  try {
    const out = await observatoryIntelligence.refreshObservatory();
    return successResponse(res, out, out.ok ? 'Observatory refreshed' : 'Observatory refreshed with errors');
  } catch (e) { return mapError(res, e, 'refreshObservatory', 'Observatory refresh failed'); }
}
async function getObservatoryDashboard(req, res) {
  try { return successResponse(res, await observatoryIntelligence.getObservatoryDashboard({
    days: Number(req.query.days) || 90,
  })); } catch (e) { return mapError(res, e, 'getObservatoryDashboard', 'Failed to load observatory'); }
}
async function getEcosystems(req, res) {
  try { return successResponse(res, { ecosystems: await ecosystemEvolution.getLatestEcosystems() }); }
  catch (e) { return mapError(res, e, 'getEcosystems', 'Failed to load ecosystems'); }
}
async function getTrajectories(req, res) {
  try { return successResponse(res, { trajectories: await ventureTrajectory.getLatestTrajectories() }); }
  catch (e) { return mapError(res, e, 'getTrajectories', 'Failed to load trajectories'); }
}
async function getDecisionAccuracy(req, res) {
  try { return successResponse(res, { accuracy: await decisionAccuracy.getLatestAccuracy() }); }
  catch (e) { return mapError(res, e, 'getDecisionAccuracy', 'Failed to load decision accuracy'); }
}
async function getPredictiveCapacity(req, res) {
  try { return successResponse(res, await predictiveCapacity.getLatestForecasts()); }
  catch (e) { return mapError(res, e, 'getPredictiveCapacity', 'Failed to load predictive capacity'); }
}
async function getDriftAlerts(req, res) {
  try { return successResponse(res, { alerts: await strategicDrift.listPendingAlerts() }); }
  catch (e) { return mapError(res, e, 'getDriftAlerts', 'Failed to load drift alerts'); }
}
async function acknowledgeDrift(req, res) {
  try {
    const actor = req.user ? (req.user.email || `user:${req.user.id}`) : null;
    return successResponse(res, await strategicDrift.acknowledgeAlert(req.params.id, actor), 'Acknowledged');
  } catch (e) { return mapError(res, e, 'acknowledgeDrift', 'Failed to acknowledge'); }
}
async function dismissDrift(req, res) {
  try {
    const actor = req.user ? (req.user.email || `user:${req.user.id}`) : null;
    return successResponse(res, await strategicDrift.dismissAlert(req.params.id, actor), 'Dismissed');
  } catch (e) { return mapError(res, e, 'dismissDrift', 'Failed to dismiss'); }
}
async function getDirectedDependencyGraph(req, res) {
  try { return successResponse(res, await ventureDependency.getDirectedGraph()); }
  catch (e) { return mapError(res, e, 'getDirectedDependencyGraph', 'Failed to load directional dependencies'); }
}
async function setDependencyEdgeStatus(req, res) {
  try {
    const actor = req.user ? (req.user.email || `user:${req.user.id}`) : null;
    const status = (req.body || {}).status;
    if (!['proposed', 'confirmed', 'resolved', 'dismissed'].includes(status)) {
      return errorResponse(res, 'Invalid status', 400);
    }
    return successResponse(res, await ventureDependency.setEdgeStatus(req.params.id, status, actor), 'Updated');
  } catch (e) { return mapError(res, e, 'setDependencyEdgeStatus', 'Failed to update edge'); }
}
async function getHistoricalAnalytics(req, res) {
  try {
    return successResponse(res, await historicalPortfolio.getHistoricalAnalytics({
      days: Number(req.query.days) || 90,
    }));
  } catch (e) { return mapError(res, e, 'getHistoricalAnalytics', 'Failed to load historical analytics'); }
}
async function getSignalTimelines(req, res) {
  try {
    return successResponse(res, await signalHistory.getPortfolioTimelines({
      days: Number(req.query.days) || 90,
    }));
  } catch (e) { return mapError(res, e, 'getSignalTimelines', 'Failed to load signal timelines'); }
}

// ---- Phase 6 — adaptive strategic operations ------------------------------

// Planning workspace — read-only dashboard payload.
async function getPlanningWorkspace(req, res) {
  try {
    return successResponse(res, await planningWorkspace.getPlanningWorkspace({
      days: Number(req.query.days) || 30,
      accuracyDays: Number(req.query.accuracyDays) || 90,
    }));
  } catch (e) { return mapError(res, e, 'getPlanningWorkspace', 'Failed to load planning workspace'); }
}

// Adaptive refresh — manual trigger.
async function runAdaptiveRefresh(req, res) {
  try {
    const { runType } = req.body || {};
    const allowed = ['full', 'portfolio', 'observatory', 'decay'];
    const safeType = allowed.includes(runType) ? runType : 'full';
    const result = await adaptiveRefresh.runRefresh({ runType: safeType, trigger: 'manual' });
    return successResponse(res, result, 'Adaptive refresh complete');
  } catch (e) { return mapError(res, e, 'runAdaptiveRefresh', 'Adaptive refresh failed'); }
}

async function listRefreshRuns(req, res) {
  try {
    return successResponse(res, await refreshHistory.listRecentRuns({
      limit: Number(req.query.limit) || 25,
    }));
  } catch (e) { return mapError(res, e, 'listRefreshRuns', 'Failed to list refresh runs'); }
}

async function getRefreshRun(req, res) {
  try {
    const detail = await refreshHistory.getRunDetail(Number(req.params.id));
    if (!detail) return errorResponse(res, 'Refresh run not found', 404);
    return successResponse(res, detail);
  } catch (e) { return mapError(res, e, 'getRefreshRun', 'Failed to load refresh run'); }
}

// Executive interventions.
async function listInterventions(req, res) {
  try {
    const pendingOnly = req.query.pendingOnly === 'true';
    const rows = pendingOnly
      ? await executiveIntervention.listPending()
      : await executiveIntervention.listAll({ limit: Number(req.query.limit) || 200 });
    return successResponse(res, rows);
  } catch (e) { return mapError(res, e, 'listInterventions', 'Failed to list interventions'); }
}

async function acknowledgeIntervention(req, res) {
  try {
    const row = await executiveIntervention.updateStatus(
      Number(req.params.id), 'acknowledged',
      req.user ? req.user.email : null,
    );
    return successResponse(res, row, 'Intervention acknowledged');
  } catch (e) { return mapError(res, e, 'acknowledgeIntervention', 'Failed to acknowledge intervention'); }
}

async function dismissIntervention(req, res) {
  try {
    const row = await executiveIntervention.updateStatus(
      Number(req.params.id), 'dismissed',
      req.user ? req.user.email : null,
    );
    return successResponse(res, row, 'Intervention dismissed');
  } catch (e) { return mapError(res, e, 'dismissIntervention', 'Failed to dismiss intervention'); }
}

// Strategic recommendations.
async function listStrategicRecommendations(req, res) {
  try {
    const pendingOnly = req.query.pendingOnly === 'true';
    const rows = pendingOnly
      ? await strategicRecommendation.listPending()
      : await strategicRecommendation.listAll({ limit: Number(req.query.limit) || 200 });
    return successResponse(res, rows);
  } catch (e) { return mapError(res, e, 'listStrategicRecommendations', 'Failed to list strategic recommendations'); }
}

async function acknowledgeStrategicRecommendation(req, res) {
  try {
    const row = await strategicRecommendation.updateStatus(
      Number(req.params.id), 'acknowledged',
      req.user ? req.user.email : null,
    );
    return successResponse(res, row, 'Strategic recommendation acknowledged');
  } catch (e) { return mapError(res, e, 'acknowledgeStrategicRecommendation', 'Failed to acknowledge strategic recommendation'); }
}

async function dismissStrategicRecommendation(req, res) {
  try {
    const row = await strategicRecommendation.updateStatus(
      Number(req.params.id), 'dismissed',
      req.user ? req.user.email : null,
    );
    return successResponse(res, row, 'Strategic recommendation dismissed');
  } catch (e) { return mapError(res, e, 'dismissStrategicRecommendation', 'Failed to dismiss strategic recommendation'); }
}

// Venture health.
async function getVentureHealth(req, res) {
  try {
    return successResponse(res, await ventureHealth.getLatestHealth());
  } catch (e) { return mapError(res, e, 'getVentureHealth', 'Failed to load venture health'); }
}

async function getVentureHealthHistory(req, res) {
  try {
    const rows = await ventureHealth.getHealthHistory(
      Number(req.params.id),
      { limit: Number(req.query.limit) || 50 },
    );
    return successResponse(res, rows);
  } catch (e) { return mapError(res, e, 'getVentureHealthHistory', 'Failed to load venture health history'); }
}

// Adaptive analytics.
async function getAdaptiveAnalytics(req, res) {
  try {
    return successResponse(res, await adaptiveAnalytics.getAdaptiveAnalytics({
      days: Number(req.query.days) || 30,
    }));
  } catch (e) { return mapError(res, e, 'getAdaptiveAnalytics', 'Failed to load adaptive analytics'); }
}

// Forecast accuracy.
async function getForecastAccuracy(req, res) {
  try {
    return successResponse(res, await forecastReality.getLatestAccuracy({
      days: Number(req.query.days) || 90,
    }));
  } catch (e) { return mapError(res, e, 'getForecastAccuracy', 'Failed to load forecast accuracy'); }
}

// Operational drift.
async function listOperationalDrift(req, res) {
  try {
    const pendingOnly = req.query.pendingOnly === 'true';
    const rows = pendingOnly
      ? await operationalDrift.listPending()
      : await operationalDrift.listAll({ limit: Number(req.query.limit) || 200 });
    return successResponse(res, rows);
  } catch (e) { return mapError(res, e, 'listOperationalDrift', 'Failed to list operational drift'); }
}

async function acknowledgeDriftItem(req, res) {
  try {
    const row = await operationalDrift.updateStatus(
      Number(req.params.id), 'acknowledged',
      req.user ? req.user.email : null,
    );
    return successResponse(res, row, 'Operational drift acknowledged');
  } catch (e) { return mapError(res, e, 'acknowledgeDriftItem', 'Failed to acknowledge operational drift'); }
}

async function dismissDriftItem(req, res) {
  try {
    const row = await operationalDrift.updateStatus(
      Number(req.params.id), 'dismissed',
      req.user ? req.user.email : null,
    );
    return successResponse(res, row, 'Operational drift dismissed');
  } catch (e) { return mapError(res, e, 'dismissDriftItem', 'Failed to dismiss operational drift'); }
}

// Dependency review workflow.
async function listOpenDependencyEdges(req, res) {
  try {
    return successResponse(res, await dependencyReview.listOpenForReview({
      limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listOpenDependencyEdges', 'Failed to list open dependency edges'); }
}

async function recordDependencyAction(req, res) {
  try {
    const { action, owner, note } = req.body || {};
    const result = await dependencyReview.recordAction(Number(req.params.id), {
      action, owner, note,
      actor: req.user ? req.user.email : null,
    });
    return successResponse(res, result, 'Dependency action recorded');
  } catch (e) { return mapError(res, e, 'recordDependencyAction', 'Failed to record dependency action'); }
}

async function getDependencyReviews(req, res) {
  try {
    return successResponse(res, await dependencyReview.getReviewsForEdge(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'getDependencyReviews', 'Failed to load dependency reviews'); }
}

// ---- Phase 7 — traceability + opportunity action intelligence -----------

// Evidence / traceability — generic lookup for any insight.
async function getEvidence(req, res) {
  try {
    const { kind, id } = req.params;
    if (!opportunityTraceability.VALID_KINDS.includes(kind)) {
      return errorResponse(res, `Invalid insight kind ${kind}`, 400);
    }
    return successResponse(res, await opportunityTraceability.getSupportingOpportunities(
      kind, Number(id), { limit: Number(req.query.limit) || 50 },
    ));
  } catch (e) { return mapError(res, e, 'getEvidence', 'Failed to load evidence'); }
}

async function rebuildEvidence(req, res) {
  try {
    const { kind, id } = req.params;
    return successResponse(res,
      await opportunityTraceability.rebuildTraceability(kind, Number(id)),
      'Traceability rebuilt');
  } catch (e) { return mapError(res, e, 'rebuildEvidence', 'Failed to rebuild evidence'); }
}

async function getOpportunityInsights(req, res) {
  try {
    return successResponse(res, await opportunityTraceability.getInsightsForOpportunity(
      Number(req.params.id), { limit: Number(req.query.limit) || 100 },
    ));
  } catch (e) { return mapError(res, e, 'getOpportunityInsights', 'Failed to load insights for opportunity'); }
}

// Justification — explainable narrative for any insight.
async function getJustification(req, res) {
  try {
    const { kind, id } = req.params;
    return successResponse(res, await opportunityJustification.getJustification(
      kind, Number(id), { rebuild: req.query.rebuild === 'true' },
    ));
  } catch (e) { return mapError(res, e, 'getJustification', 'Failed to load justification'); }
}

// Cluster drilldown.
async function getClusterDrilldown(req, res) {
  try {
    return successResponse(res, await clusterDrilldown.getDrilldown(
      Number(req.params.id), { limit: Number(req.query.limit) || 200 },
    ));
  } catch (e) { return mapError(res, e, 'getClusterDrilldown', 'Failed to load cluster drilldown'); }
}

async function refreshClusterDrilldown(req, res) {
  try {
    return successResponse(res,
      await clusterDrilldown.refreshDrilldown(Number(req.params.id)),
      'Cluster drilldown refreshed');
  } catch (e) { return mapError(res, e, 'refreshClusterDrilldown', 'Failed to refresh cluster drilldown'); }
}

// Custom research runs.
async function listResearchRuns(req, res) {
  try {
    return successResponse(res, await customResearchRun.listRuns({
      limit: Number(req.query.limit) || 50,
    }));
  } catch (e) { return mapError(res, e, 'listResearchRuns', 'Failed to list research runs'); }
}

async function createResearchRun(req, res) {
  try {
    const { name, query, filters, pinned } = req.body || {};
    return successResponse(res, await customResearchRun.createRun({
      name, query, filters, pinned,
      createdBy: req.user ? req.user.email : null,
    }), 'Research run created', 201);
  } catch (e) { return mapError(res, e, 'createResearchRun', 'Failed to create research run'); }
}

async function getResearchRun(req, res) {
  try {
    const row = await customResearchRun.getRun(Number(req.params.id));
    if (!row) return errorResponse(res, 'Research run not found', 404);
    return successResponse(res, row);
  } catch (e) { return mapError(res, e, 'getResearchRun', 'Failed to load research run'); }
}

async function updateResearchRun(req, res) {
  try {
    return successResponse(res, await customResearchRun.updateRun(
      Number(req.params.id), req.body || {},
    ), 'Research run updated');
  } catch (e) { return mapError(res, e, 'updateResearchRun', 'Failed to update research run'); }
}

async function rerunResearchRun(req, res) {
  try {
    return successResponse(res, await customResearchRun.rerunRun(Number(req.params.id)),
      'Research run executed');
  } catch (e) { return mapError(res, e, 'rerunResearchRun', 'Research run failed'); }
}

async function deleteResearchRun(req, res) {
  try {
    return successResponse(res, await customResearchRun.deleteRun(Number(req.params.id)),
      'Research run deleted');
  } catch (e) { return mapError(res, e, 'deleteResearchRun', 'Failed to delete research run'); }
}

async function previewResearchQuery(req, res) {
  try {
    const { query, filters } = req.body || {};
    if (!query) return errorResponse(res, 'query is required', 400);
    return successResponse(res, await customResearchRun.runQuery({
      query, filters, limit: Number((req.body && req.body.limit) || 100),
    }));
  } catch (e) { return mapError(res, e, 'previewResearchQuery', 'Failed to preview research query'); }
}

// Opportunity graph.
async function getGraphNeighborhood(req, res) {
  try {
    return successResponse(res, await opportunityGraph.getNeighborhood({
      kind: req.query.kind,
      value: req.query.value,
      depth: Number(req.query.depth) || 1,
      maxEdges: Number(req.query.maxEdges) || 100,
    }));
  } catch (e) { return mapError(res, e, 'getGraphNeighborhood', 'Failed to load graph neighborhood'); }
}

async function getGraphSummary(req, res) {
  try {
    return successResponse(res, await opportunityGraph.getGraphSummary());
  } catch (e) { return mapError(res, e, 'getGraphSummary', 'Failed to load graph summary'); }
}

async function refreshGraph(req, res) {
  try {
    return successResponse(res, await opportunityGraph.refreshGraph(),
      'Opportunity graph refreshed');
  } catch (e) { return mapError(res, e, 'refreshGraph', 'Failed to refresh graph'); }
}

// Relationships.
async function listRecurringRelationships(req, res) {
  try {
    if (req.query.summary === 'true') {
      return successResponse(res, await opportunityRelationships.summarizeRecurring({
        limit: Number(req.query.limit) || 10,
      }));
    }
    return successResponse(res, await opportunityRelationships.listRecurring({
      relationshipType: req.query.type,
      limit: Number(req.query.limit) || 50,
    }));
  } catch (e) { return mapError(res, e, 'listRecurringRelationships', 'Failed to list recurring relationships'); }
}

async function refreshRelationships(req, res) {
  try {
    return successResponse(res, await opportunityRelationships.refreshRelationships({
      minOccurrence: Number((req.body && req.body.minOccurrence) || 2),
    }), 'Recurring relationships refreshed');
  } catch (e) { return mapError(res, e, 'refreshRelationships', 'Failed to refresh relationships'); }
}

// Proposal acceleration.
async function listAccelerationAssets(req, res) {
  try {
    return successResponse(res, await proposalAcceleration.listAssets({
      assetKind: req.query.kind,
      limit: Number(req.query.limit) || 50,
    }));
  } catch (e) { return mapError(res, e, 'listAccelerationAssets', 'Failed to list acceleration assets'); }
}

async function refreshAccelerationAssets(req, res) {
  try {
    return successResponse(res, await proposalAcceleration.refreshAssets(),
      'Acceleration assets refreshed');
  } catch (e) { return mapError(res, e, 'refreshAccelerationAssets', 'Failed to refresh acceleration assets'); }
}

async function suggestAccelerationForOpportunity(req, res) {
  try {
    return successResponse(res, await proposalAcceleration.suggestForOpportunity(
      Number(req.params.id),
    ));
  } catch (e) { return mapError(res, e, 'suggestAccelerationForOpportunity', 'Failed to suggest acceleration assets'); }
}

// Pursuit workspaces.
async function listPursuits(req, res) {
  try {
    return successResponse(res, await pursuitWorkspace.listPursuits({
      status: req.query.status,
      limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listPursuits', 'Failed to list pursuits'); }
}

async function createPursuit(req, res) {
  try {
    const { name, anchorKind, anchorId, summary, positioning, linkedOpportunityIds } = req.body || {};
    return successResponse(res, await pursuitWorkspace.createPursuit({
      name, anchorKind, anchorId, summary, positioning, linkedOpportunityIds,
      createdBy: req.user ? req.user.email : null,
    }), 'Pursuit created', 201);
  } catch (e) { return mapError(res, e, 'createPursuit', 'Failed to create pursuit'); }
}

async function getPursuit(req, res) {
  try {
    const out = await pursuitWorkspace.getPursuit(Number(req.params.id));
    if (!out) return errorResponse(res, 'Pursuit not found', 404);
    return successResponse(res, out);
  } catch (e) { return mapError(res, e, 'getPursuit', 'Failed to load pursuit'); }
}

async function updatePursuit(req, res) {
  try {
    return successResponse(res, await pursuitWorkspace.updatePursuit(
      Number(req.params.id), req.body || {},
    ), 'Pursuit updated');
  } catch (e) { return mapError(res, e, 'updatePursuit', 'Failed to update pursuit'); }
}

async function deletePursuit(req, res) {
  try {
    return successResponse(res, await pursuitWorkspace.deletePursuit(Number(req.params.id)),
      'Pursuit deleted');
  } catch (e) { return mapError(res, e, 'deletePursuit', 'Failed to delete pursuit'); }
}

// Action intelligence (top-level dashboard).
async function getActionIntelligence(req, res) {
  try {
    return successResponse(res, await actionIntelligence.getActionIntelligence());
  } catch (e) { return mapError(res, e, 'getActionIntelligence', 'Failed to load action intelligence'); }
}

// ---- Phase 7.5 — strategic context bridge ----------------------------------

async function getStrategicContext(req, res) {
  try {
    const { kind, id } = req.params;
    if (!deepResearchContext.VALID_KINDS.includes(kind)) {
      return errorResponse(res, `Invalid context kind ${kind}`, 400);
    }
    const summary = await deepResearchContext.getContextSummary(kind, id);
    if (!summary) return errorResponse(res, 'Context not found', 404);
    return successResponse(res, summary);
  } catch (e) { return mapError(res, e, 'getStrategicContext', 'Failed to load strategic context'); }
}

async function getOpportunityContextTrace(req, res) {
  try {
    const { kind, id } = req.query;
    const opportunityId = Number(req.params.id);
    if (!Number.isInteger(opportunityId)) {
      return errorResponse(res, 'Invalid opportunity id', 400);
    }
    if (kind && !deepResearchContext.VALID_KINDS.includes(kind)) {
      return errorResponse(res, `Invalid context kind ${kind}`, 400);
    }
    const trace = await deepResearchContext.getOpportunityTraceWithinContext(
      opportunityId, kind, id,
    );
    return successResponse(res, trace);
  } catch (e) { return mapError(res, e, 'getOpportunityContextTrace', 'Failed to load opportunity context trace'); }
}

// ---- Phase 8 — pursuit activation + strategic capture intelligence -------

async function activatePursuit(req, res) {
  try {
    const { sourceKind, sourceId, name, summary } = req.body || {};
    const result = await pursuitActivation.activate({
      sourceKind, sourceId, name, summary,
      actor: req.user ? req.user.email : null,
    });
    return successResponse(res, result, 'Pursuit activated', 201);
  } catch (e) { return mapError(res, e, 'activatePursuit', 'Failed to activate pursuit'); }
}

async function listPursuitActivations(req, res) {
  try {
    return successResponse(res, await pursuitActivation.listActivations({
      pursuitId: req.query.pursuitId, limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listPursuitActivations', 'Failed to list pursuit activations'); }
}

async function generatePursuitDrafts(req, res) {
  try {
    const { outputType, skipExisting } = req.body || {};
    return successResponse(res, await reviewQueueBridge.generateDraftsForPursuit(
      Number(req.params.id),
      {
        outputType: outputType || 'proposal',
        actor: req.user ? req.user.email : null,
        generatedBy: req.user ? req.user.id : null,
        skipExisting: skipExisting !== false,
      },
    ), 'Drafts generated');
  } catch (e) { return mapError(res, e, 'generatePursuitDrafts', 'Failed to generate proposal drafts'); }
}

async function listPursuitHandoffs(req, res) {
  try {
    return successResponse(res,
      await reviewQueueBridge.listHandoffsForPursuit(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'listPursuitHandoffs', 'Failed to list handoffs'); }
}

async function scorePursuitReadiness(req, res) {
  try {
    return successResponse(res,
      await proposalReadiness.scorePursuit(Number(req.params.id)),
      'Readiness scored');
  } catch (e) { return mapError(res, e, 'scorePursuitReadiness', 'Failed to score readiness'); }
}

async function getPursuitReadiness(req, res) {
  try {
    const row = await proposalReadiness.getLatestForPursuit(Number(req.params.id));
    return successResponse(res, row);
  } catch (e) { return mapError(res, e, 'getPursuitReadiness', 'Failed to load readiness'); }
}

async function getOpportunityExpansion(req, res) {
  try {
    const { kind, id } = req.params;
    return successResponse(res, await opportunityExpansion.getExpansion(
      kind, id, { rebuild: req.query.rebuild === 'true' },
    ));
  } catch (e) { return mapError(res, e, 'getOpportunityExpansion', 'Failed to load expansion'); }
}

async function computeVentureConflicts(req, res) {
  try {
    return successResponse(res, await ventureConflict.computeForVenture(Number(req.params.id)),
      'Venture conflicts computed');
  } catch (e) { return mapError(res, e, 'computeVentureConflicts', 'Failed to compute venture conflicts'); }
}

async function listVentureConflicts(req, res) {
  try {
    return successResponse(res, await ventureConflict.listForVenture(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'listVentureConflicts', 'Failed to list venture conflicts'); }
}

async function refreshResearchRevenue(req, res) {
  try {
    return successResponse(res, await researchRevenue.refreshFromRecurringRelationships({
      minOccurrence: Number((req.body && req.body.minOccurrence) || 4),
    }), 'Research-to-revenue mapping refreshed');
  } catch (e) { return mapError(res, e, 'refreshResearchRevenue', 'Failed to refresh research-to-revenue'); }
}

async function listResearchRevenue(req, res) {
  try {
    return successResponse(res, await researchRevenue.listLinks({
      signalKind: req.query.signalKind || null,
      limit: Number(req.query.limit) || 50,
    }));
  } catch (e) { return mapError(res, e, 'listResearchRevenue', 'Failed to list research-revenue links'); }
}

async function buildCaptureForPursuit(req, res) {
  try {
    return successResponse(res, await captureStrategy.buildForPursuit(Number(req.params.id)),
      'Capture strategy built');
  } catch (e) { return mapError(res, e, 'buildCaptureForPursuit', 'Failed to build capture strategy'); }
}

async function getCaptureForPursuit(req, res) {
  try {
    return successResponse(res, await captureStrategy.getLatestForPursuit(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'getCaptureForPursuit', 'Failed to load capture strategy'); }
}

async function listSubmissionArtifactsForPursuit(req, res) {
  try {
    const [list, summary] = await Promise.all([
      submissionReadiness.listForPursuit(Number(req.params.id)),
      submissionReadiness.summarizeForPursuit(Number(req.params.id)),
    ]);
    return successResponse(res, { summary, artifacts: list });
  } catch (e) { return mapError(res, e, 'listSubmissionArtifactsForPursuit', 'Failed to load submission artifacts'); }
}

async function addSubmissionArtifact(req, res) {
  try {
    const { artifactKind, label, required, status, contentRef, metadata, opportunityId } = req.body || {};
    return successResponse(res, await submissionReadiness.addArtifact({
      pursuitId: Number(req.params.id),
      opportunityId: opportunityId == null ? null : Number(opportunityId),
      artifactKind, label, required, status, contentRef, metadata,
    }), 'Artifact added', 201);
  } catch (e) { return mapError(res, e, 'addSubmissionArtifact', 'Failed to add submission artifact'); }
}

async function updateSubmissionArtifact(req, res) {
  try {
    return successResponse(res, await submissionReadiness.updateArtifact(
      Number(req.params.id), req.body || {},
    ), 'Artifact updated');
  } catch (e) { return mapError(res, e, 'updateSubmissionArtifact', 'Failed to update submission artifact'); }
}

async function deleteSubmissionArtifact(req, res) {
  try {
    return successResponse(res, await submissionReadiness.deleteArtifact(Number(req.params.id)),
      'Artifact deleted');
  } catch (e) { return mapError(res, e, 'deleteSubmissionArtifact', 'Failed to delete submission artifact'); }
}

async function applySubmissionTemplate(req, res) {
  try {
    return successResponse(res, await submissionReadiness.applyDefaultTemplate(Number(req.params.id)),
      'Default submission template applied');
  } catch (e) { return mapError(res, e, 'applySubmissionTemplate', 'Failed to apply submission template'); }
}

// ---- Phase 9 — submission readiness + compliance intelligence -----------

async function listRfpAttachments(req, res) {
  try {
    return successResponse(res, await rfpAttachment.listForPursuit(
      Number(req.params.id), { kind: req.query.kind || null },
    ));
  } catch (e) { return mapError(res, e, 'listRfpAttachments', 'Failed to list RFP attachments'); }
}
async function addRfpAttachment(req, res) {
  try {
    return successResponse(res, await rfpAttachment.addAttachment({
      pursuitId: Number(req.params.id),
      ...(req.body || {}),
      uploadedBy: req.user ? req.user.email : null,
    }), 'Attachment added', 201);
  } catch (e) { return mapError(res, e, 'addRfpAttachment', 'Failed to add RFP attachment'); }
}
async function updateRfpAttachment(req, res) {
  try {
    return successResponse(res, await rfpAttachment.updateAttachment(
      Number(req.params.id), req.body || {},
    ), 'Attachment updated');
  } catch (e) { return mapError(res, e, 'updateRfpAttachment', 'Failed to update RFP attachment'); }
}
async function deleteRfpAttachment(req, res) {
  try {
    return successResponse(res, await rfpAttachment.deleteAttachment(Number(req.params.id)),
      'Attachment deleted');
  } catch (e) { return mapError(res, e, 'deleteRfpAttachment', 'Failed to delete attachment'); }
}
async function summarizeRfpAttachments(req, res) {
  try {
    return successResponse(res, await rfpAttachment.summarizeForPursuit(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'summarizeRfpAttachments', 'Failed to summarize attachments'); }
}

async function listProposalArtifacts(req, res) {
  try {
    return successResponse(res, await proposalArtifact.listArtifacts({
      artifactKind: req.query.kind || null,
      status: req.query.status || null,
      q: req.query.q || null,
      limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listProposalArtifacts', 'Failed to list proposal artifacts'); }
}
async function addProposalArtifact(req, res) {
  try {
    return successResponse(res, await proposalArtifact.addArtifact({
      ...(req.body || {}),
      uploadedBy: req.user ? req.user.email : null,
    }), 'Artifact added', 201);
  } catch (e) { return mapError(res, e, 'addProposalArtifact', 'Failed to add proposal artifact'); }
}
async function updateProposalArtifact(req, res) {
  try {
    return successResponse(res, await proposalArtifact.updateArtifact(
      Number(req.params.id), req.body || {},
    ), 'Artifact updated');
  } catch (e) { return mapError(res, e, 'updateProposalArtifact', 'Failed to update proposal artifact'); }
}
async function deleteProposalArtifact(req, res) {
  try {
    return successResponse(res, await proposalArtifact.deleteArtifact(Number(req.params.id)),
      'Artifact deleted');
  } catch (e) { return mapError(res, e, 'deleteProposalArtifact', 'Failed to delete proposal artifact'); }
}
async function refreshArtifactExpirations(req, res) {
  try {
    return successResponse(res, await proposalArtifact.refreshExpirationStatuses(),
      'Expiration statuses refreshed');
  } catch (e) { return mapError(res, e, 'refreshArtifactExpirations', 'Failed to refresh expirations'); }
}

async function buildComplianceMatrix(req, res) {
  try {
    const { rfpText, sourceAttachmentId } = req.body || {};
    return successResponse(res, await complianceMatrix.buildForPursuit(
      Number(req.params.id),
      { rfpText, sourceAttachmentId },
    ), 'Compliance matrix built');
  } catch (e) { return mapError(res, e, 'buildComplianceMatrix', 'Failed to build compliance matrix'); }
}
async function getComplianceMatrix(req, res) {
  try {
    const out = await complianceMatrix.getMatrixForPursuit(Number(req.params.id));
    return successResponse(res, out);
  } catch (e) { return mapError(res, e, 'getComplianceMatrix', 'Failed to load compliance matrix'); }
}
async function updateComplianceMatrixItem(req, res) {
  try {
    return successResponse(res, await complianceMatrix.updateMatrixItem(
      Number(req.params.id), req.body || {},
    ), 'Matrix item updated');
  } catch (e) { return mapError(res, e, 'updateComplianceMatrixItem', 'Failed to update matrix item'); }
}

async function assembleSubmissionPackage(req, res) {
  try {
    return successResponse(res, await submissionPackage.assemblePackage({
      pursuitId: Number(req.params.id),
      ...(req.body || {}),
      assembledBy: req.user ? req.user.email : null,
    }), 'Submission package assembled', 201);
  } catch (e) { return mapError(res, e, 'assembleSubmissionPackage', 'Failed to assemble package'); }
}
async function listSubmissionPackages(req, res) {
  try {
    return successResponse(res, await submissionPackage.listForPursuit(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'listSubmissionPackages', 'Failed to list packages'); }
}
async function getSubmissionPackage(req, res) {
  try {
    const out = await submissionPackage.getPackageDetail(Number(req.params.id));
    if (!out) return errorResponse(res, 'Package not found', 404);
    return successResponse(res, out);
  } catch (e) { return mapError(res, e, 'getSubmissionPackage', 'Failed to load package'); }
}
async function updateSubmissionPackage(req, res) {
  try {
    return successResponse(res, await submissionPackage.updatePackage(
      Number(req.params.id), req.body || {},
    ), 'Package updated');
  } catch (e) { return mapError(res, e, 'updateSubmissionPackage', 'Failed to update package'); }
}

async function listProposalTimeline(req, res) {
  try {
    return successResponse(res, await proposalTimeline.listForPursuit(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'listProposalTimeline', 'Failed to load timeline'); }
}
async function addTimelineEvent(req, res) {
  try {
    return successResponse(res, await proposalTimeline.addEvent({
      pursuitId: Number(req.params.id), ...(req.body || {}),
    }), 'Timeline event added', 201);
  } catch (e) { return mapError(res, e, 'addTimelineEvent', 'Failed to add timeline event'); }
}
async function updateTimelineEvent(req, res) {
  try {
    return successResponse(res, await proposalTimeline.updateEvent(
      Number(req.params.id), req.body || {},
    ), 'Timeline event updated');
  } catch (e) { return mapError(res, e, 'updateTimelineEvent', 'Failed to update timeline event'); }
}
async function seedDefaultTimeline(req, res) {
  try {
    const { dueAt } = req.body || {};
    return successResponse(res, await proposalTimeline.seedDefaultTimeline(
      Number(req.params.id), { dueAt },
    ), 'Default timeline seeded');
  } catch (e) { return mapError(res, e, 'seedDefaultTimeline', 'Failed to seed timeline'); }
}

async function listComplianceGaps(req, res) {
  try {
    return successResponse(res, await complianceGap.listForPursuit(
      Number(req.params.id), { status: req.query.status || null },
    ));
  } catch (e) { return mapError(res, e, 'listComplianceGaps', 'Failed to list compliance gaps'); }
}
async function refreshComplianceGaps(req, res) {
  try {
    return successResponse(res, await complianceGap.refreshForPursuit(Number(req.params.id)),
      'Compliance gaps refreshed');
  } catch (e) { return mapError(res, e, 'refreshComplianceGaps', 'Failed to refresh compliance gaps'); }
}
async function updateComplianceGap(req, res) {
  try {
    const { status } = req.body || {};
    return successResponse(res, await complianceGap.updateGapStatus(
      Number(req.params.id), status, req.user ? req.user.email : null,
    ), 'Gap status updated');
  } catch (e) { return mapError(res, e, 'updateComplianceGap', 'Failed to update compliance gap'); }
}

async function scoreSubmissionReadiness(req, res) {
  try {
    return successResponse(res, await submissionReadinessEngine.scorePursuit(
      Number(req.params.id), { actor: req.user ? req.user.email : null },
    ), 'Submission readiness scored');
  } catch (e) { return mapError(res, e, 'scoreSubmissionReadiness', 'Failed to score submission readiness'); }
}

async function enqueueParallelDrafts(req, res) {
  try {
    const { outputType, concurrency, skipExisting } = req.body || {};
    return successResponse(res, await parallelDraftQueue.enqueueForPursuit(
      Number(req.params.id),
      {
        outputType: outputType || 'proposal',
        concurrency: Number(concurrency) || undefined,
        skipExisting: skipExisting !== false,
        actor: req.user ? req.user.email : null,
        generatedBy: req.user ? req.user.id : null,
      },
    ), 'Parallel draft batch processed');
  } catch (e) { return mapError(res, e, 'enqueueParallelDrafts', 'Parallel draft generation failed'); }
}
async function listParallelDraftJobs(req, res) {
  try {
    return successResponse(res, await parallelDraftQueue.listJobs({
      pursuitId: Number(req.params.id),
      batchId: req.query.batchId || null,
    }));
  } catch (e) { return mapError(res, e, 'listParallelDraftJobs', 'Failed to list draft jobs'); }
}

async function getPursuitContextBlock(req, res) {
  try {
    const block = await pursuitContextInjector.buildContextBlock(
      Number(req.params.id),
      req.query.opportunityId ? Number(req.query.opportunityId) : null,
    );
    return successResponse(res, { block });
  } catch (e) { return mapError(res, e, 'getPursuitContextBlock', 'Failed to build context block'); }
}

async function getCaptureOps(req, res) {
  try {
    return successResponse(res, await captureOps.getCaptureOps());
  } catch (e) { return mapError(res, e, 'getCaptureOps', 'Failed to load capture operations'); }
}

// ---- Phase 10 — operational scalability + execution infrastructure -----

async function getCaptureInfra(req, res) {
  try {
    return successResponse(res, await captureInfra.getCaptureInfra());
  } catch (e) { return mapError(res, e, 'getCaptureInfra', 'Failed to load capture infrastructure'); }
}

// Worker jobs
async function listWorkerJobs(req, res) {
  try {
    return successResponse(res, await captureWorker.listJobs({
      status: req.query.status || null,
      jobKind: req.query.jobKind || null,
      batchId: req.query.batchId || null,
      pursuitId: req.query.pursuitId,
      limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listWorkerJobs', 'Failed to list worker jobs'); }
}
async function getWorkerJob(req, res) {
  try {
    const row = await captureWorker.getJob(Number(req.params.id));
    if (!row) return errorResponse(res, 'Job not found', 404);
    return successResponse(res, row);
  } catch (e) { return mapError(res, e, 'getWorkerJob', 'Failed to load worker job'); }
}
async function cancelWorkerJob(req, res) {
  try {
    return successResponse(res, await captureWorker.cancelJob(
      Number(req.params.id), req.user ? req.user.email : null,
    ), 'Job cancelled');
  } catch (e) { return mapError(res, e, 'cancelWorkerJob', 'Failed to cancel job'); }
}
async function drainWorkerOnce(req, res) {
  try {
    const concurrency = Number((req.body && req.body.concurrency) || 0) || undefined;
    return successResponse(res, await captureWorker.drainOnce({ concurrency }),
      'Drain pass complete');
  } catch (e) { return mapError(res, e, 'drainWorkerOnce', 'Drain failed'); }
}

// Proposal execution queue
async function enqueueExecutionDraftBatch(req, res) {
  try {
    const { opportunityIds, priority, slaDueAt } = req.body || {};
    return successResponse(res, await proposalExecutionQueue.enqueueDraftBatch({
      pursuitId: Number(req.params.id),
      opportunityIds, priority, slaDueAt,
      actor: req.user ? req.user.email : null,
    }), 'Draft batch enqueued', 201);
  } catch (e) { return mapError(res, e, 'enqueueExecutionDraftBatch', 'Failed to enqueue draft batch'); }
}
async function enqueueExecutionSingleJob(req, res) {
  try {
    const { queueKind, payload, priority, slaDueAt } = req.body || {};
    return successResponse(res, await proposalExecutionQueue.enqueueSingleJob({
      pursuitId: Number(req.params.id),
      queueKind, payload, priority, slaDueAt,
      actor: req.user ? req.user.email : null,
    }), 'Job enqueued', 201);
  } catch (e) { return mapError(res, e, 'enqueueExecutionSingleJob', 'Failed to enqueue job'); }
}
async function listExecutionQueue(req, res) {
  try {
    return successResponse(res, await proposalExecutionQueue.listEntries({
      pursuitId: req.query.pursuitId,
      status: req.query.status || null,
      queueKind: req.query.queueKind || null,
      limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listExecutionQueue', 'Failed to list execution queue'); }
}
async function getExecutionQueueEntry(req, res) {
  try {
    const out = await proposalExecutionQueue.getEntryDetail(Number(req.params.id));
    if (!out) return errorResponse(res, 'Queue entry not found', 404);
    return successResponse(res, out);
  } catch (e) { return mapError(res, e, 'getExecutionQueueEntry', 'Failed to load queue entry'); }
}
async function refreshExecutionEntry(req, res) {
  try {
    return successResponse(res, await proposalExecutionQueue.refreshEntryFromJobs(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'refreshExecutionEntry', 'Failed to refresh queue entry'); }
}
async function cancelExecutionEntry(req, res) {
  try {
    return successResponse(res, await proposalExecutionQueue.cancelEntry(
      Number(req.params.id), req.user ? req.user.email : null,
    ), 'Queue entry cancelled');
  } catch (e) { return mapError(res, e, 'cancelExecutionEntry', 'Failed to cancel queue entry'); }
}

// SLA intelligence
async function runSlaScan(req, res) {
  try {
    return successResponse(res, await slaIntelligence.runFullScan(), 'SLA scan complete');
  } catch (e) { return mapError(res, e, 'runSlaScan', 'SLA scan failed'); }
}
async function listSlaEvents(req, res) {
  try {
    return successResponse(res, await slaIntelligence.listEvents({
      status: req.query.status || 'open',
      slaKind: req.query.slaKind || null,
      pursuitId: req.query.pursuitId,
      limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listSlaEvents', 'Failed to list SLA events'); }
}
async function updateSlaEvent(req, res) {
  try {
    const { status } = req.body || {};
    return successResponse(res, await slaIntelligence.updateEventStatus(
      Number(req.params.id), status, req.user ? req.user.email : null,
    ), 'SLA event updated');
  } catch (e) { return mapError(res, e, 'updateSlaEvent', 'Failed to update SLA event'); }
}

// Artifact lifecycle
async function runArtifactLifecycleScan(req, res) {
  try {
    return successResponse(res, await artifactLifecycle.runNightlyScan(), 'Lifecycle scan complete');
  } catch (e) { return mapError(res, e, 'runArtifactLifecycleScan', 'Lifecycle scan failed'); }
}
async function recommendArtifactRenewals(req, res) {
  try {
    return successResponse(res, await artifactLifecycle.recommendRenewals());
  } catch (e) { return mapError(res, e, 'recommendArtifactRenewals', 'Failed to load renewal recommendations'); }
}
async function listArtifactLifecycleEvents(req, res) {
  try {
    return successResponse(res, await artifactLifecycle.listEventsForArtifact(
      Number(req.params.id), { limit: Number(req.query.limit) || 50 },
    ));
  } catch (e) { return mapError(res, e, 'listArtifactLifecycleEvents', 'Failed to list lifecycle events'); }
}

// Queue observability
async function getQueueObservability(req, res) {
  try {
    return successResponse(res, await queueObservability.summarize({
      windowMinutes: Number(req.query.windowMinutes) || 60,
    }));
  } catch (e) { return mapError(res, e, 'getQueueObservability', 'Failed to load queue observability'); }
}
async function snapshotQueueMetrics(req, res) {
  try {
    return successResponse(res, await queueObservability.snapshotAll({
      windowMinutes: Number((req.body && req.body.windowMinutes) || 60),
    }), 'Queue metrics snapshot captured');
  } catch (e) { return mapError(res, e, 'snapshotQueueMetrics', 'Snapshot failed'); }
}
async function getQueueSnapshots(req, res) {
  try {
    return successResponse(res, await queueObservability.recentSnapshots({
      queueKind: req.query.queueKind || null,
      limit: Number(req.query.limit) || 24,
    }));
  } catch (e) { return mapError(res, e, 'getQueueSnapshots', 'Failed to load snapshots'); }
}

// Storage
async function registerStorageAsset(req, res) {
  try {
    return successResponse(res, await storage.registerAsset({
      ...(req.body || {}),
      uploadedBy: req.user ? req.user.email : null,
    }), 'Storage asset registered', 201);
  } catch (e) { return mapError(res, e, 'registerStorageAsset', 'Failed to register storage asset'); }
}
async function getStorageSignedUrl(req, res) {
  try {
    return successResponse(res, await storage.signedUrl(
      Number(req.params.id),
      { expiresInSeconds: Number(req.query.expiresIn) || 900 },
    ));
  } catch (e) { return mapError(res, e, 'getStorageSignedUrl', 'Failed to sign URL'); }
}
async function listStorageAssets(req, res) {
  try {
    return successResponse(res, await storage.listAssets({
      assetKind: req.query.kind || null,
      pursuitId: req.query.pursuitId,
      limit: Number(req.query.limit) || 100,
    }));
  } catch (e) { return mapError(res, e, 'listStorageAssets', 'Failed to list storage assets'); }
}
async function deleteStorageAsset(req, res) {
  try {
    return successResponse(res, await storage.deleteAsset(Number(req.params.id)),
      'Storage asset deleted');
  } catch (e) { return mapError(res, e, 'deleteStorageAsset', 'Failed to delete storage asset'); }
}

// Durable draft generation
async function enqueueDurableDrafts(req, res) {
  try {
    const { outputType, priority, useContextBlock, skipExisting } = req.body || {};
    return successResponse(res, await durableDraftGeneration.enqueueForPursuit(
      Number(req.params.id),
      {
        outputType: outputType || 'proposal',
        priority,
        useContextBlock: useContextBlock !== false,
        skipExisting: skipExisting !== false,
        actor: req.user ? req.user.email : null,
      },
    ), 'Durable draft batch enqueued');
  } catch (e) { return mapError(res, e, 'enqueueDurableDrafts', 'Failed to enqueue durable drafts'); }
}
async function listDurableDrafts(req, res) {
  try {
    return successResponse(res, await durableDraftGeneration.summarizeForPursuit(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'listDurableDrafts', 'Failed to list durable drafts'); }
}

// Pursuit context preview
async function previewPursuitContextBlock(req, res) {
  try {
    return successResponse(res, await pursuitContextWiring.previewContextBlock(
      Number(req.params.id),
      req.query.opportunityId ? Number(req.query.opportunityId) : null,
    ));
  } catch (e) { return mapError(res, e, 'previewPursuitContextBlock', 'Failed to preview pursuit context'); }
}

// LLM compliance second-pass
async function llmAugmentComplianceMatrix(req, res) {
  try {
    const { rfpText, force } = req.body || {};
    return successResponse(res, await complianceMatrixLlm.maybeAugmentMatrix(
      Number(req.params.id),
      { rfpText, force: Boolean(force), actor: req.user ? req.user.email : null },
    ), 'LLM augment attempted');
  } catch (e) { return mapError(res, e, 'llmAugmentComplianceMatrix', 'LLM augment failed'); }
}

// ---- Phase 11 — multi-tenant governance + operational auditability ----

// Governance dashboard composite
async function getGovernance(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceDashboard.getGovernance(orgId));
  } catch (e) { return mapError(res, e, 'getGovernance', 'Failed to load governance dashboard'); }
}

// Tenant settings
async function getTenantSettings(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await tenantIsolation.summarizeTenant(orgId));
  } catch (e) { return mapError(res, e, 'getTenantSettings', 'Failed to load tenant settings'); }
}
async function updateTenantSettings(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const row = await tenantIsolation.updateSettings(orgId, req.body || {});
    await auditTrail.recordFromRequest(req, {
      actionKind: 'tenant', actionVerb: 'update',
      subjectKind: 'tenant_settings', subjectId: String(row.id),
      payload: { keys: Object.keys(req.body || {}) },
    });
    return successResponse(res, row.toJSON(), 'Tenant settings updated');
  } catch (e) { return mapError(res, e, 'updateTenantSettings', 'Failed to update tenant settings'); }
}

// RBAC
async function describeMyPermissions(req, res) {
  try {
    const out = await rbac.describePermissions(
      req.user ? (req.user.userId || req.user.id) : null,
      req.user ? req.user.role : null,
    );
    return successResponse(res, out);
  } catch (e) { return mapError(res, e, 'describeMyPermissions', 'Failed to load permissions'); }
}
async function listRoleGrants(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const rows = await rbac.listGrants({
      organizationId: orgId,
      userId: req.query.userId ? Number(req.query.userId) : null,
      activeOnly: req.query.activeOnly !== 'false',
    });
    return successResponse(res, rows);
  } catch (e) { return mapError(res, e, 'listRoleGrants', 'Failed to list grants'); }
}
async function grantRole(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const { userId, roleName, permissions } = req.body || {};
    if (!userId || !roleName) return errorResponse(res, 'userId + roleName required', 400);
    const row = await rbac.grantRole(Number(userId), {
      roleName, permissions, organizationId: orgId,
      grantedBy: req.user ? req.user.email : null,
    });
    await auditTrail.recordFromRequest(req, {
      actionKind: 'rbac', actionVerb: 'grant',
      subjectKind: 'user', subjectId: String(userId),
      payload: { role: roleName, permissions },
    });
    return successResponse(res, row.toJSON(), 'Role granted', 201);
  } catch (e) { return mapError(res, e, 'grantRole', 'Failed to grant role'); }
}
async function revokeRoles(req, res) {
  try {
    const out = await rbac.revokeAll(Number(req.params.userId), {
      revokedBy: req.user ? req.user.email : null,
    });
    await auditTrail.recordFromRequest(req, {
      actionKind: 'rbac', actionVerb: 'revoke',
      subjectKind: 'user', subjectId: req.params.userId,
    });
    return successResponse(res, out, 'Roles revoked');
  } catch (e) { return mapError(res, e, 'revokeRoles', 'Failed to revoke roles'); }
}
async function listRolesAndPermissions(req, res) {
  try {
    return successResponse(res, {
      roles: rbac.ROLE_NAMES.map((r) => ({
        name: r, level: rbac.ROLE_LEVELS[r],
        default_permissions: rbac.DEFAULT_PERMISSIONS_BY_ROLE[r],
      })),
      all_permissions: rbac.PERMISSIONS,
    });
  } catch (e) { return mapError(res, e, 'listRolesAndPermissions', 'Failed'); }
}

// Audit trail
async function listAuditEvents(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const rows = await auditTrail.query({
      organizationId: orgId,
      actorUserId: req.query.actorUserId ? Number(req.query.actorUserId) : null,
      pursuitId: req.query.pursuitId ? Number(req.query.pursuitId) : null,
      actionKind: req.query.actionKind || null,
      actionVerb: req.query.actionVerb || null,
      since: req.query.since || null,
      until: req.query.until || null,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    return successResponse(res, rows);
  } catch (e) { return mapError(res, e, 'listAuditEvents', 'Failed to query audit events'); }
}
async function summarizeAuditTrail(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await auditTrail.summarize({
      organizationId: orgId,
      sinceMinutes: req.query.sinceMinutes ? Number(req.query.sinceMinutes) : 24 * 60,
    }));
  } catch (e) { return mapError(res, e, 'summarizeAuditTrail', 'Failed'); }
}
async function exportAuditCsv(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const csv = await auditTrail.exportCsv({
      organizationId: orgId,
      since: req.query.since || null,
      until: req.query.until || null,
      limit: req.query.limit ? Number(req.query.limit) : 5000,
    });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="audit_${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (e) { return mapError(res, e, 'exportAuditCsv', 'Failed to export audit CSV'); }
}

// Event lineage
async function getLineage(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const { kind, id } = req.params;
    return successResponse(res, await eventLineage.fullLineage(kind, id, {
      organizationId: orgId,
      maxDepth: req.query.depth ? Number(req.query.depth) : 3,
    }));
  } catch (e) { return mapError(res, e, 'getLineage', 'Failed to load lineage'); }
}
async function recordLineageEdge(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const row = await eventLineage.recordEdge({ organizationId: orgId, ...(req.body || {}) });
    return successResponse(res, row ? row.toJSON() : null, 'Lineage edge recorded', 201);
  } catch (e) { return mapError(res, e, 'recordLineageEdge', 'Failed to record edge'); }
}
async function getPursuitLineage(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await eventLineage.pursuitLineage(Number(req.params.id), { organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'getPursuitLineage', 'Failed to load pursuit lineage'); }
}

// SLA escalation
async function actOnSlaEvent(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const out = await slaEscalation.actOnEvent(Number(req.params.id), {
      organizationId: orgId,
      actorUserId: req.user ? (req.user.userId || req.user.id) : null,
      actorEmail: req.user ? req.user.email : null,
      action: req.body && req.body.action,
      assigneeUserId: req.body && req.body.assigneeUserId,
      assigneeEmail: req.body && req.body.assigneeEmail,
      assigneeRole: req.body && req.body.assigneeRole,
      notes: req.body && req.body.notes,
      metadata: req.body && req.body.metadata,
    });
    observabilityStream.publishers.slaAlert({
      event_id: Number(req.params.id), action: req.body && req.body.action,
      actor: req.user ? req.user.email : null,
    }, { organizationId: orgId });
    return successResponse(res, out, 'SLA action recorded');
  } catch (e) { return mapError(res, e, 'actOnSlaEvent', 'SLA action failed'); }
}
async function getSlaDigest(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await slaEscalation.generateDigest({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'getSlaDigest', 'Failed to generate digest'); }
}
async function getSlaEventHistory(req, res) {
  try {
    return successResponse(res, await slaEscalation.historyForEvent(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'getSlaEventHistory', 'Failed to load history'); }
}

// Workflow governance
async function createWorkflowAssignment(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const out = await workflowGovernance.createAssignment({
      organizationId: orgId,
      ...(req.body || {}),
      assignedBy: req.user ? req.user.email : null,
    });
    observabilityStream.publishers.workflowTransition({
      action: 'create', workflow_kind: req.body && req.body.workflowKind,
    }, { organizationId: orgId });
    return successResponse(res, out, 'Assignment created', 201);
  } catch (e) { return mapError(res, e, 'createWorkflowAssignment', 'Failed to create assignment'); }
}
async function transitionWorkflowAssignment(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const out = await workflowGovernance.transition(Number(req.params.id), {
      organizationId: orgId,
      status: req.body && req.body.status,
      notes: req.body && req.body.notes,
      actorEmail: req.user ? req.user.email : null,
      actorUserId: req.user ? (req.user.userId || req.user.id) : null,
    });
    observabilityStream.publishers.workflowTransition({
      assignment_id: Number(req.params.id), to: req.body && req.body.status,
    }, { organizationId: orgId });
    return successResponse(res, out, 'Status updated');
  } catch (e) { return mapError(res, e, 'transitionWorkflowAssignment', 'Transition failed'); }
}
async function listWorkflowAssignments(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const rows = await workflowGovernance.listAssignments({
      organizationId: orgId,
      assigneeUserId: req.query.assigneeUserId ? Number(req.query.assigneeUserId) : null,
      status: req.query.status || null,
      workflowKind: req.query.workflowKind || null,
      pursuitId: req.query.pursuitId ? Number(req.query.pursuitId) : null,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    return successResponse(res, rows);
  } catch (e) { return mapError(res, e, 'listWorkflowAssignments', 'Failed to list assignments'); }
}
async function operatorWorkloads(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await workflowGovernance.workloadByOperator({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'operatorWorkloads', 'Failed'); }
}
async function workflowBottlenecks(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await workflowGovernance.detectBottlenecks({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'workflowBottlenecks', 'Failed'); }
}

// Storage providers
async function storageProviderHealth(req, res) {
  try {
    return successResponse(res, await storageProviders.providerHealth());
  } catch (e) { return mapError(res, e, 'storageProviderHealth', 'Failed'); }
}
async function storageMigrationStatus(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await storageProviders.migrationStatus({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'storageMigrationStatus', 'Failed'); }
}

// Observability stream (SSE)
async function observabilitySubscribe(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const channels = req.query.channels ? String(req.query.channels).split(',') : [];
    await observabilityStream.subscribe(req, res, {
      channels,
      organizationId: orgId,
      userId: req.user ? (req.user.userId || req.user.id) : null,
      userEmail: req.user ? req.user.email : null,
      lastEventId: req.query.lastEventId || req.headers['last-event-id'] || null,
    });
    // No response.end here — the stream owns the connection.
    return undefined;
  } catch (e) { return mapError(res, e, 'observabilitySubscribe', 'Stream subscribe failed'); }
}
async function observabilityHealth(req, res) {
  try {
    return successResponse(res, {
      summary: observabilityStream.summarize(),
      streams: observabilityStream.activeStreams(),
    });
  } catch (e) { return mapError(res, e, 'observabilityHealth', 'Failed'); }
}
async function observabilityPublish(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const { channel, body } = req.body || {};
    const delivered = observabilityStream.publish(channel, body || {}, { organizationId: orgId });
    return successResponse(res, { channel, delivered });
  } catch (e) { return mapError(res, e, 'observabilityPublish', 'Publish failed'); }
}

// Pursuit context prompt preview
async function previewPursuitContextPrompt(req, res) {
  try {
    const opportunityId = req.query.opportunityId ? Number(req.query.opportunityId) : null;
    const maxChars = req.query.maxChars ? Number(req.query.maxChars) : undefined;
    return successResponse(res, await pursuitContextPrompt.previewBlockForPursuit(
      Number(req.params.id), { opportunityId, maxChars },
    ));
  } catch (e) { return mapError(res, e, 'previewPursuitContextPrompt', 'Failed'); }
}

// ---- Phase 12 — tenant-safe operational consistency + provenance ----

async function getGovernanceIntegrity(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceIntegrity.getDashboard({
      organizationId: orgId, sequelize: dbSequelize,
    }));
  } catch (e) { return mapError(res, e, 'getGovernanceIntegrity', 'Failed to load integrity dashboard'); }
}
async function snapshotGovernanceIntegrity(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const row = await governanceIntegrity.snapshotIntegrity({
      organizationId: orgId, sequelize: dbSequelize,
    });
    return successResponse(res, row.toJSON(), 'Snapshot recorded', 201);
  } catch (e) { return mapError(res, e, 'snapshotGovernanceIntegrity', 'Snapshot failed'); }
}
async function listGovernanceIntegrity(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceIntegrity.recentIntegrity({
      organizationId: orgId,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    }));
  } catch (e) { return mapError(res, e, 'listGovernanceIntegrity', 'Failed'); }
}

// Prompt provenance
async function listProvenanceForPursuit(req, res) {
  try {
    return successResponse(res, await promptProvenance.listForPursuit(
      Number(req.params.id),
      { limit: req.query.limit ? Number(req.query.limit) : 25 },
    ));
  } catch (e) { return mapError(res, e, 'listProvenanceForPursuit', 'Failed'); }
}
async function getProvenanceByOutput(req, res) {
  try {
    return successResponse(res, await promptProvenance.findByOutput(Number(req.params.outputId)));
  } catch (e) { return mapError(res, e, 'getProvenanceByOutput', 'Failed'); }
}
async function getProvenanceByHash(req, res) {
  try {
    return successResponse(res, await promptProvenance.findByAuditHash(req.params.hash));
  } catch (e) { return mapError(res, e, 'getProvenanceByHash', 'Failed'); }
}
async function summarizeProvenance(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await promptProvenance.summarize({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'summarizeProvenance', 'Failed'); }
}
async function buildProvenanceForPursuit(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const { opportunityId, outputType, persist } = req.body || {};
    return successResponse(res, await promptProvenance.buildAndPersist(
      Number(req.params.id),
      {
        organizationId: orgId,
        opportunityId: opportunityId == null ? null : Number(opportunityId),
        outputType, persist: persist !== false,
        generatedBy: req.user ? req.user.email : null,
      },
    ));
  } catch (e) { return mapError(res, e, 'buildProvenanceForPursuit', 'Failed'); }
}

// RBAC coverage
async function getRbacCoverage(req, res) {
  try {
    const router = req.app && req.app._router;
    let analyzed = null;
    if (router) {
      // The deepResearch sub-router is mounted at the app level; we need to
      // find it. For v1, snapshot the deepResearch router specifically.
      const deepRouter = require('./deepResearch.routes');
      analyzed = rbacCoverage.analyzeRouter(deepRouter);
    }
    return successResponse(res, {
      latest: await rbacCoverage.latestSnapshot(),
      live: analyzed,
    });
  } catch (e) { return mapError(res, e, 'getRbacCoverage', 'Failed'); }
}
async function snapshotRbacCoverage(req, res) {
  try {
    const deepRouter = require('./deepResearch.routes');
    const row = await rbacCoverage.snapshotCoverage(deepRouter);
    return successResponse(res, row ? row.toJSON() : null, 'Snapshot recorded', 201);
  } catch (e) { return mapError(res, e, 'snapshotRbacCoverage', 'Failed'); }
}

// SLA digest
async function previewSlaDigest(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await slaDigest.sendForOrg(orgId, {
      recipients: req.body && Array.isArray(req.body.recipients) ? req.body.recipients : null,
      dryRun: true,
    }));
  } catch (e) { return mapError(res, e, 'previewSlaDigest', 'Failed'); }
}
async function sendSlaDigest(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await slaDigest.sendForOrg(orgId, {
      recipients: req.body && Array.isArray(req.body.recipients) ? req.body.recipients : null,
      dryRun: false,
    }));
  } catch (e) { return mapError(res, e, 'sendSlaDigest', 'Failed'); }
}
async function listSlaEmails(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await slaDigest.listRecentEmails({
      organizationId: orgId,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    }));
  } catch (e) { return mapError(res, e, 'listSlaEmails', 'Failed'); }
}
async function summarizeSlaEmails(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await slaDigest.summarize({
      organizationId: orgId,
      sinceDays: req.query.sinceDays ? Number(req.query.sinceDays) : 7,
    }));
  } catch (e) { return mapError(res, e, 'summarizeSlaEmails', 'Failed'); }
}

// SSE hot-path metrics
async function getStreamMetrics(req, res) {
  try {
    return successResponse(res, sseHotPaths.summarize());
  } catch (e) { return mapError(res, e, 'getStreamMetrics', 'Failed'); }
}
async function snapshotStreamMetrics(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await sseHotPaths.snapshotMetrics({
      organizationId: orgId,
      windowMinutes: req.body && req.body.windowMinutes ? Number(req.body.windowMinutes) : 5,
    }));
  } catch (e) { return mapError(res, e, 'snapshotStreamMetrics', 'Failed'); }
}
async function listStreamMetrics(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await sseHotPaths.recentMetrics({
      organizationId: orgId,
      channel: req.query.channel || null,
      limit: req.query.limit ? Number(req.query.limit) : 30,
    }));
  } catch (e) { return mapError(res, e, 'listStreamMetrics', 'Failed'); }
}

// Asset migration
async function planAssetMigration(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await assetMigration.planMigration({
      organizationId: orgId,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    }));
  } catch (e) { return mapError(res, e, 'planAssetMigration', 'Failed'); }
}
async function runAssetMigration(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await assetMigration.runBatch({
      organizationId: orgId,
      limit: req.body && req.body.limit ? Number(req.body.limit) : 25,
      toProvider: req.body && req.body.toProvider || null,
      copyBytes: Boolean(req.body && req.body.copyBytes),
      actor: req.user ? req.user.email : null,
    }));
  } catch (e) { return mapError(res, e, 'runAssetMigration', 'Failed'); }
}
async function summarizeAssetMigration(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await assetMigration.summarize({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'summarizeAssetMigration', 'Failed'); }
}
async function recentAssetMigrationAttempts(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await assetMigration.recentAttempts({
      organizationId: orgId,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    }));
  } catch (e) { return mapError(res, e, 'recentAssetMigrationAttempts', 'Failed'); }
}

// Audit retention
async function getRetentionPressure(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await auditRetention.retentionPressure({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'getRetentionPressure', 'Failed'); }
}
async function recommendArchive(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await auditRetention.recommendArchive({
      organizationId: orgId,
      maxWindowDays: req.query.maxWindowDays ? Number(req.query.maxWindowDays) : 90,
    }));
  } catch (e) { return mapError(res, e, 'recommendArchive', 'Failed'); }
}
async function archiveWindow(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await auditRetention.archiveWindow({
      organizationId: orgId,
      windowStart: req.body && req.body.windowStart,
      windowEnd: req.body && req.body.windowEnd,
      archiveLocation: req.body && req.body.archiveLocation,
      actor: req.user ? req.user.email : null,
    }), 'Archive manifest recorded', 201);
  } catch (e) { return mapError(res, e, 'archiveWindow', 'Failed'); }
}
async function listArchives(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await auditRetention.listArchives({
      organizationId: orgId,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    }));
  } catch (e) { return mapError(res, e, 'listArchives', 'Failed'); }
}

// ---- Phase 13 — cross-phase provenance + governance consistency ------

// Governance Assurance dashboard
async function getGovernanceAssurance(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceAssurance.getDashboard({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'getGovernanceAssurance', 'Failed to load assurance dashboard'); }
}

// Cross-provenance
async function recordCrossProvenance(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const row = await crossProvenance.record({ organizationId: orgId, ...(req.body || {}), actorEmail: req.user ? req.user.email : null });
    return successResponse(res, row ? row.toJSON() : null, 'Recorded', 201);
  } catch (e) { return mapError(res, e, 'recordCrossProvenance', 'Failed'); }
}
async function listCrossProvenanceForSubject(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await crossProvenance.forSubject(
      req.params.kind, req.params.id, { organizationId: orgId, limit: req.query.limit ? Number(req.query.limit) : 100 },
    ));
  } catch (e) { return mapError(res, e, 'listCrossProvenanceForSubject', 'Failed'); }
}
async function listCrossProvenanceForPursuit(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await crossProvenance.forPursuit(Number(req.params.id), { organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'listCrossProvenanceForPursuit', 'Failed'); }
}
async function summarizeCrossProvenance(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await crossProvenance.summarize({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'summarizeCrossProvenance', 'Failed'); }
}

// Operational lineage
async function recordLineageEdgeV13(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await operationalLineage.recordEdge({ organizationId: orgId, ...(req.body || {}) }), 'Edge recorded', 201);
  } catch (e) { return mapError(res, e, 'recordLineageEdgeV13', 'Failed'); }
}
async function getOperationalLineage(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await operationalLineage.fullLineage(
      req.params.kind, req.params.id, { organizationId: orgId, maxDepth: req.query.depth ? Number(req.query.depth) : 3 },
    ));
  } catch (e) { return mapError(res, e, 'getOperationalLineage', 'Failed'); }
}
async function getProposalAncestry(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await operationalLineage.proposalAncestry(Number(req.params.outputId), { organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'getProposalAncestry', 'Failed'); }
}

// Permission integrity
async function getPermissionIntegrity(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await permissionIntegrity.computeIntegrity({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'getPermissionIntegrity', 'Failed'); }
}
async function snapshotPermissionIntegrity(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const row = await permissionIntegrity.snapshot({ organizationId: orgId });
    return successResponse(res, row ? row.toJSON() : null, 'Snapshot recorded', 201);
  } catch (e) { return mapError(res, e, 'snapshotPermissionIntegrity', 'Failed'); }
}
async function permissionMismatchReport(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await permissionIntegrity.mismatchReport({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'permissionMismatchReport', 'Failed'); }
}

// Governance consistency
async function runConsistencyScans(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceConsistency.runAllScans({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'runConsistencyScans', 'Failed'); }
}
async function listConsistencyFindings(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceConsistency.listFindings({
      organizationId: orgId, status: req.query.status || 'open',
      limit: req.query.limit ? Number(req.query.limit) : 100,
    }));
  } catch (e) { return mapError(res, e, 'listConsistencyFindings', 'Failed'); }
}
async function updateConsistencyFinding(req, res) {
  try {
    return successResponse(res, await governanceConsistency.updateFindingStatus(Number(req.params.id), {
      status: req.body && req.body.status, actorEmail: req.user ? req.user.email : null,
    }));
  } catch (e) { return mapError(res, e, 'updateConsistencyFinding', 'Failed'); }
}

// Proposal explainability
async function getProposalExplanation(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await proposalExplainability.buildExplanation(
      Number(req.params.outputId), { organizationId: orgId },
    ));
  } catch (e) { return mapError(res, e, 'getProposalExplanation', 'Failed'); }
}

// Governance drift
async function runDriftScans(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceDrift.runAllScans({ organizationId: orgId }));
  } catch (e) { return mapError(res, e, 'runDriftScans', 'Failed'); }
}
async function listDriftFindings(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await governanceDrift.listFindings({
      organizationId: orgId, status: req.query.status || 'open',
      limit: req.query.limit ? Number(req.query.limit) : 100,
    }));
  } catch (e) { return mapError(res, e, 'listDriftFindings', 'Failed'); }
}
async function updateDriftFinding(req, res) {
  try {
    return successResponse(res, await governanceDrift.updateFinding(Number(req.params.id), {
      status: req.body && req.body.status, actorEmail: req.user ? req.user.email : null,
    }));
  } catch (e) { return mapError(res, e, 'updateDriftFinding', 'Failed'); }
}

// Approval provenance
async function listApprovalsForWorkflow(req, res) {
  try {
    return successResponse(res, await approvalProvenance.listForWorkflow(Number(req.params.id)));
  } catch (e) { return mapError(res, e, 'listApprovalsForWorkflow', 'Failed'); }
}
async function listApprovalsForSubject(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await approvalProvenance.listForSubject(
      req.params.kind, req.params.id, { organizationId: orgId },
    ));
  } catch (e) { return mapError(res, e, 'listApprovalsForSubject', 'Failed'); }
}
async function approvalBottlenecks(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await approvalProvenance.bottlenecks({ organizationId: orgId, limit: req.query.limit ? Number(req.query.limit) : 25 }));
  } catch (e) { return mapError(res, e, 'approvalBottlenecks', 'Failed'); }
}
async function backfillApprovalProvenance(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await approvalProvenance.backfillFromWorkflows({ organizationId: orgId, limit: req.body && req.body.limit ? Number(req.body.limit) : 200 }));
  } catch (e) { return mapError(res, e, 'backfillApprovalProvenance', 'Failed'); }
}

// Operational replay
async function buildOperationalReplay(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await operationalReplay.buildReplay({
      scope: req.params.scope, scopeId: req.params.scopeId, organizationId: orgId,
    }));
  } catch (e) { return mapError(res, e, 'buildOperationalReplay', 'Failed'); }
}
async function persistOperationalReplay(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    const built = await operationalReplay.buildReplay({
      scope: req.params.scope, scopeId: req.params.scopeId, organizationId: orgId,
    });
    return successResponse(res, await operationalReplay.persistReplay(built, { organizationId: orgId }), 'Replay persisted', 201);
  } catch (e) { return mapError(res, e, 'persistOperationalReplay', 'Failed'); }
}

// Stream integrity
async function getStreamIntegrity(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await streamIntegrity.summarize({
      organizationId: orgId,
      sinceMinutes: req.query.sinceMinutes ? Number(req.query.sinceMinutes) : 60,
    }));
  } catch (e) { return mapError(res, e, 'getStreamIntegrity', 'Failed'); }
}
async function snapshotStreamIntegrity(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await streamIntegrity.snapshot({
      organizationId: orgId,
      windowMinutes: req.body && req.body.windowMinutes ? Number(req.body.windowMinutes) : 5,
    }), 'Snapshot recorded', 201);
  } catch (e) { return mapError(res, e, 'snapshotStreamIntegrity', 'Failed'); }
}
async function streamIntegrityHistory(req, res) {
  try {
    const orgId = await tenantIsolation.resolveTenantForRequest(req);
    return successResponse(res, await streamIntegrity.recentSnapshots({
      organizationId: orgId, limit: req.query.limit ? Number(req.query.limit) : 30,
    }));
  } catch (e) { return mapError(res, e, 'streamIntegrityHistory', 'Failed'); }
}

module.exports = {
  run,
  listReports,
  getReport,
  getStatus,
  getVersions,
  reRun,
  setFlags,
  generateRequirements,
  getJobStatus,
  listBriefings,
  createBriefing,
  updateBriefing,
  deleteBriefing,
  previewBriefing,
  briefingHistory,
  // Phase 3
  getLifecycle,
  transitionLifecycle,
  setVentureOwner,
  assessVenture,
  planMvp,
  getVentureExecution,
  getExecutionQueue,
  getPipeline,
  // Phase 4
  refreshPortfolio,
  getPortfolioDashboard,
  getCapacity,
  getPortfolioRanking,
  getForecasts,
  getOverlaps,
  getDependencies,
  getCapacityPlan,
  getTemplates,
  getRecommendations,
  acknowledgeRecommendation,
  dismissRecommendation,
  getOperationalMetrics,
  // Phase 5
  refreshObservatory,
  getObservatoryDashboard,
  getEcosystems,
  getTrajectories,
  getDecisionAccuracy,
  getPredictiveCapacity,
  getDriftAlerts,
  acknowledgeDrift,
  dismissDrift,
  getDirectedDependencyGraph,
  setDependencyEdgeStatus,
  getHistoricalAnalytics,
  getSignalTimelines,
  // Phase 6
  getPlanningWorkspace,
  runAdaptiveRefresh,
  listRefreshRuns,
  getRefreshRun,
  listInterventions,
  acknowledgeIntervention,
  dismissIntervention,
  listStrategicRecommendations,
  acknowledgeStrategicRecommendation,
  dismissStrategicRecommendation,
  getVentureHealth,
  getVentureHealthHistory,
  getAdaptiveAnalytics,
  getForecastAccuracy,
  listOperationalDrift,
  acknowledgeDriftItem,
  dismissDriftItem,
  listOpenDependencyEdges,
  recordDependencyAction,
  getDependencyReviews,
  // Phase 7
  getEvidence,
  rebuildEvidence,
  getOpportunityInsights,
  getJustification,
  getClusterDrilldown,
  refreshClusterDrilldown,
  listResearchRuns,
  createResearchRun,
  getResearchRun,
  updateResearchRun,
  rerunResearchRun,
  deleteResearchRun,
  previewResearchQuery,
  getGraphNeighborhood,
  getGraphSummary,
  refreshGraph,
  listRecurringRelationships,
  refreshRelationships,
  listAccelerationAssets,
  refreshAccelerationAssets,
  suggestAccelerationForOpportunity,
  listPursuits,
  createPursuit,
  getPursuit,
  updatePursuit,
  deletePursuit,
  getActionIntelligence,
  // Phase 7.5
  getStrategicContext,
  getOpportunityContextTrace,
  // Phase 8
  activatePursuit,
  listPursuitActivations,
  generatePursuitDrafts,
  listPursuitHandoffs,
  scorePursuitReadiness,
  getPursuitReadiness,
  getOpportunityExpansion,
  computeVentureConflicts,
  listVentureConflicts,
  refreshResearchRevenue,
  listResearchRevenue,
  buildCaptureForPursuit,
  getCaptureForPursuit,
  listSubmissionArtifactsForPursuit,
  addSubmissionArtifact,
  updateSubmissionArtifact,
  deleteSubmissionArtifact,
  applySubmissionTemplate,
  // Phase 9
  listRfpAttachments,
  addRfpAttachment,
  updateRfpAttachment,
  deleteRfpAttachment,
  summarizeRfpAttachments,
  listProposalArtifacts,
  addProposalArtifact,
  updateProposalArtifact,
  deleteProposalArtifact,
  refreshArtifactExpirations,
  buildComplianceMatrix,
  getComplianceMatrix,
  updateComplianceMatrixItem,
  assembleSubmissionPackage,
  listSubmissionPackages,
  getSubmissionPackage,
  updateSubmissionPackage,
  listProposalTimeline,
  addTimelineEvent,
  updateTimelineEvent,
  seedDefaultTimeline,
  listComplianceGaps,
  refreshComplianceGaps,
  updateComplianceGap,
  scoreSubmissionReadiness,
  enqueueParallelDrafts,
  listParallelDraftJobs,
  getPursuitContextBlock,
  getCaptureOps,
  // Phase 10
  getCaptureInfra,
  listWorkerJobs,
  getWorkerJob,
  cancelWorkerJob,
  drainWorkerOnce,
  enqueueExecutionDraftBatch,
  enqueueExecutionSingleJob,
  listExecutionQueue,
  getExecutionQueueEntry,
  refreshExecutionEntry,
  cancelExecutionEntry,
  runSlaScan,
  listSlaEvents,
  updateSlaEvent,
  runArtifactLifecycleScan,
  recommendArtifactRenewals,
  listArtifactLifecycleEvents,
  getQueueObservability,
  snapshotQueueMetrics,
  getQueueSnapshots,
  registerStorageAsset,
  getStorageSignedUrl,
  listStorageAssets,
  deleteStorageAsset,
  enqueueDurableDrafts,
  listDurableDrafts,
  previewPursuitContextBlock,
  llmAugmentComplianceMatrix,
  // Phase 11
  getGovernance,
  getTenantSettings,
  updateTenantSettings,
  describeMyPermissions,
  listRoleGrants,
  grantRole,
  revokeRoles,
  listRolesAndPermissions,
  listAuditEvents,
  summarizeAuditTrail,
  exportAuditCsv,
  getLineage,
  recordLineageEdge,
  getPursuitLineage,
  actOnSlaEvent,
  getSlaDigest,
  getSlaEventHistory,
  createWorkflowAssignment,
  transitionWorkflowAssignment,
  listWorkflowAssignments,
  operatorWorkloads,
  workflowBottlenecks,
  storageProviderHealth,
  storageMigrationStatus,
  observabilitySubscribe,
  observabilityHealth,
  observabilityPublish,
  previewPursuitContextPrompt,
  // Phase 12
  getGovernanceIntegrity,
  snapshotGovernanceIntegrity,
  listGovernanceIntegrity,
  listProvenanceForPursuit,
  getProvenanceByOutput,
  getProvenanceByHash,
  summarizeProvenance,
  buildProvenanceForPursuit,
  getRbacCoverage,
  snapshotRbacCoverage,
  previewSlaDigest,
  sendSlaDigest,
  listSlaEmails,
  summarizeSlaEmails,
  getStreamMetrics,
  snapshotStreamMetrics,
  listStreamMetrics,
  planAssetMigration,
  runAssetMigration,
  summarizeAssetMigration,
  recentAssetMigrationAttempts,
  getRetentionPressure,
  recommendArchive,
  archiveWindow,
  listArchives,
  // Phase 13
  getGovernanceAssurance,
  recordCrossProvenance,
  listCrossProvenanceForSubject,
  listCrossProvenanceForPursuit,
  summarizeCrossProvenance,
  recordLineageEdgeV13,
  getOperationalLineage,
  getProposalAncestry,
  getPermissionIntegrity,
  snapshotPermissionIntegrity,
  permissionMismatchReport,
  runConsistencyScans,
  listConsistencyFindings,
  updateConsistencyFinding,
  getProposalExplanation,
  runDriftScans,
  listDriftFindings,
  updateDriftFinding,
  listApprovalsForWorkflow,
  listApprovalsForSubject,
  approvalBottlenecks,
  backfillApprovalProvenance,
  buildOperationalReplay,
  persistOperationalReplay,
  getStreamIntegrity,
  snapshotStreamIntegrity,
  streamIntegrityHistory,
};
