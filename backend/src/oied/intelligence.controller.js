// OIED → External AI Bridge controllers.
//
// Wraps existing services with the standardized context envelope so a
// companion Claude-based system can consume OIED via stable URLs and a
// uniform per-row contract.
//
// New routes (all under /api/v1/oied):
//   GET /opportunities/:id           — single-opportunity intelligence
//   GET /opportunities/execution     — alias of /execution-queue
//   GET /bundles/:id/blueprint       — bundle blueprint with envelope
//   GET /revenue                     — alias of /revenue/dashboard
//
// Augmentation helpers (used by oied.controller.js to attach `context`
// to existing list responses):
//   attachContextToOpportunity(opp, opts)
//   attachContextToBundle(bundle, opts)

const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { Opportunity, Bundle, OpportunityOutput, ExecutionPlan, OpportunityEvent } = require('../models');
const { Op } = require('sequelize');
const myOppsSvc = require('./myOpportunities.service');
const profileSvc = require('./profile.service');
const executionQueueSvc = require('./executionQueue.service');
const revenueDashboardSvc = require('./revenueDashboard.service');
const ctx = require('./intelligence.context');

// ---- Helpers exported for use by oied.controller list endpoints --------

// Find the most-recent draft (or approved-but-unsubmitted) output for an
// opp, along with the most-recent submitted/won/lost event so the
// envelope can pick the right recommended_action.
async function loadOppOutcomeContext(opportunityId) {
  let latestDraft = null;
  let outcome = null;
  let submittedDaysAgo = null;
  try {
    const out = await OpportunityOutput.findOne({
      where: { opportunityId, type: 'proposal' },
      order: [['createdAt', 'DESC']],
    });
    if (out) {
      latestDraft = {
        id: out.id, status: out.status, type: out.type,
        personalization_score: (out.metadata && out.metadata.personalization_score) || 0,
      };
    }
    const events = await OpportunityEvent.findAll({
      where: {
        opportunityId,
        eventType: { [Op.in]: ['submitted', 'won', 'lost', 'response_received'] },
      },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });
    const won  = events.find((e) => e.eventType === 'won');
    const lost = events.find((e) => e.eventType === 'lost');
    const submitted = events.find((e) => e.eventType === 'submitted');
    if (won)  outcome = 'won';
    else if (lost) outcome = 'lost';
    else if (submitted) {
      outcome = 'submitted_pending';
      submittedDaysAgo = Math.floor(
        (Date.now() - new Date(submitted.createdAt).getTime()) / 86_400_000,
      );
    }
  } catch (e) {
    logger.warn('intelligence: opp outcome lookup failed', {
      opportunityId, error: e.message,
    });
  }
  return { latestDraft, outcome, submittedDaysAgo };
}

// Attach `context` to one opportunity row (already enriched with
// fitScore/priorityScore/bucket/effortEstimate/winProbability).
async function attachContextToOpportunity(opp, { organizationId } = {}) {
  const { latestDraft, outcome, submittedDaysAgo } = await loadOppOutcomeContext(opp.id);
  const enriched = submittedDaysAgo != null
    ? { ...opp, _submittedDaysAgo: submittedDaysAgo }
    : opp;
  return {
    ...opp,
    context: ctx.buildContextForOpportunity({
      opp: enriched,
      organizationId,
      latestDraft,
      outcome,
    }),
  };
}

// Attach `context` to a bundle row, looking up its execution plan if any.
async function attachContextToBundle(bundle, { organizationId } = {}) {
  let plan = null;
  try {
    const planRow = await ExecutionPlan.findOne({ where: { bundleId: bundle.id } });
    if (planRow) plan = planRow.toJSON ? planRow.toJSON() : planRow;
  } catch (e) {
    logger.warn('intelligence: plan lookup failed', { bundleId: bundle.id, error: e.message });
  }
  return {
    ...bundle,
    context: ctx.buildContextForBundle({
      bundle, plan, organizationId: organizationId || bundle.organizationId,
    }),
  };
}

// ---- New endpoints ------------------------------------------------------

// GET /api/v1/oied/opportunities/:id
async function getOpportunityIntelligence(req, res) {
  const id = Number(req.params.id);
  if (!id) return errorResponse(res, 'Invalid opportunity id', 400);
  try {
    const opp = await Opportunity.findByPk(id);
    if (!opp) return errorResponse(res, 'Not found', 404);
    const orgId = await profileSvc.resolveOrgId(req.user && req.user.id);
    const enriched = await myOppsSvc.enrichOpportunity({
      opportunity: opp, organizationId: orgId, userId: (req.user && req.user.id) || null,
    });
    const wrapped = await attachContextToOpportunity(enriched, { organizationId: orgId });
    return successResponse(res, wrapped);
  } catch (e) {
    logger.error('intelligence.getOpportunity failed', { id, error: e.message });
    return errorResponse(res, 'Failed to load opportunity intelligence: ' + e.message, 500);
  }
}

// GET /api/v1/oied/opportunities/execution  — alias of /execution-queue.
// We hand-roll the controller (rather than call the existing one) so we
// can attach `context` to each row without monkey-patching the v5
// controller's response shape.
async function listExecutionQueueIntelligence(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await executionQueueSvc.listExecutionQueue({
      userId,
      limit: req.query.limit,
      offset: req.query.offset,
      minRoi: req.query.minRoi,
    });
    const orgId = data.organization_id;
    const rowsWithContext = await Promise.all(
      (data.rows || []).map(async (row) => {
        // executionQueue rows are draft-output-shaped (output_id, opportunity_id,
        // value, win_probability, effort_estimate). Reshape into an opp-like
        // record before envelope-wrapping so the helpers find the fields.
        const oppLike = {
          id: row.opportunity_id,
          title: row.title,
          category: row.category,
          value: row.value,
          fitScore: 0, // execution-queue rows don't carry fitScore directly
          priorityScore: 0,
          urgency: 0,
          bucket: 'standard',
          winProbability: row.win_probability,
          effortEstimate: row.effort_estimate,
        };
        const wrapped = await attachContextToOpportunity(oppLike, { organizationId: orgId });
        return { ...row, context: wrapped.context };
      }),
    );
    return successResponse(res, rowsWithContext, 'Execution queue (with intelligence context)', 200, {
      organization_id: orgId,
      total: data.total,
    });
  } catch (e) {
    logger.error('intelligence.executionQueue failed', { error: e.message });
    return errorResponse(res, 'Failed to load execution queue', 500);
  }
}

// GET /api/v1/oied/bundles/:id/blueprint
async function getBundleBlueprintIntelligence(req, res) {
  const id = Number(req.params.id);
  if (!id) return errorResponse(res, 'Invalid bundle id', 400);
  try {
    const bundle = await Bundle.findByPk(id);
    if (!bundle) return errorResponse(res, 'Not found', 404);
    const blueprint = bundle.blueprint || {};
    if (!blueprint.mvp_scope) {
      return errorResponse(
        res,
        'Blueprint not generated yet — POST /api/v1/oied/bundles/:id/blueprint first',
        404,
      );
    }
    const wrapped = await attachContextToBundle(bundle.toJSON(), {
      organizationId: bundle.organizationId,
    });
    return successResponse(res, {
      bundle_id: bundle.id,
      theme: bundle.theme,
      blueprint,
      suggested_solution: bundle.suggestedSolution,
      estimated_build_time_days: bundle.estimatedBuildTimeDays,
      blueprint_hash: bundle.blueprintHash,
      context: wrapped.context,
    });
  } catch (e) {
    logger.error('intelligence.getBundleBlueprint failed', { id, error: e.message });
    return errorResponse(res, 'Failed to load bundle blueprint: ' + e.message, 500);
  }
}

// GET /api/v1/oied/revenue — alias of /revenue/dashboard. No envelope —
// the response is a structured aggregate, not row-shaped.
async function getRevenueAlias(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await revenueDashboardSvc.getDashboard({ userId });
    return successResponse(res, data);
  } catch (e) {
    logger.error('intelligence.revenue failed', { error: e.message });
    return errorResponse(res, 'Failed to load revenue', 500);
  }
}

module.exports = {
  // New endpoints
  getOpportunityIntelligence,
  listExecutionQueueIntelligence,
  getBundleBlueprintIntelligence,
  getRevenueAlias,
  // Helpers (used by oied.controller list endpoints)
  attachContextToOpportunity,
  attachContextToBundle,
  loadOppOutcomeContext,
};
