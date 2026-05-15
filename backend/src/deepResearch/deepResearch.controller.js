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
};
