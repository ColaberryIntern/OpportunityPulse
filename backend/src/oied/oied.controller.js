const logger = require('../logging/logger');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const myOpps = require('./myOpportunities.service');
const actions = require('./actionGenerator.service');
const events = require('./events.service');
const profileSvc = require('./profile.service');
const bundler = require('./opportunityBundler.service');
const recommendations = require('./recommendation.service');
const briefingSvc = require('./briefing.service');
const triggerSvc = require('./triggerEngine.service');
const executionQueueSvc = require('./executionQueue.service');
const revenueDashboardSvc = require('./revenueDashboard.service');
const feedbackSvc = require('./feedback.service');
const executionPlannerSvc = require('./executionPlanner.service');
const billingSvc = require('./billing.service');
const velocitySvc = require('./velocity.service');
// Phase 7.5 — strategic context resolver bridge into My Opportunities.
const deepResearchContext = require('../deepResearch/deepResearchContext.service');

// v6: helper that maps PlanLimitExceededError → 402 Payment Required.
// Other errors fall through to the caller's existing handler.
function handlePlanLimit(res, e) {
  if (e instanceof billingSvc.PlanLimitExceededError) {
    return errorResponse(res, e.message, 402, {
      tier: e.tier, used: e.used, limit: e.limit, metric: e.metric,
    });
  }
  return null;
}

// GET /api/v1/oied/opportunities/my
async function listMy(req, res) {
  try {
    // Phase 7.5: if a strategic-context query param is present, resolve it
    // to an opportunity-id set and pass it into listMyOpportunities as an
    // additive filter. When no context param is present, behavior is
    // identical to pre-Phase-7.5.
    const contextRef = deepResearchContext.pickContextFromQuery(req.query);
    let restrictToOpportunityIds = null;
    let strategicContext = null;
    if (contextRef) {
      try {
        strategicContext = await deepResearchContext.getContextSummary(
          contextRef.kind, contextRef.id,
        );
        if (strategicContext) {
          restrictToOpportunityIds = Array.isArray(strategicContext.opportunity_ids)
            ? strategicContext.opportunity_ids : [];
        } else {
          restrictToOpportunityIds = [];
        }
      } catch (ctxErr) {
        logger.warn('OIED listMy: context resolution failed', {
          kind: contextRef.kind, id: contextRef.id, error: ctxErr.message,
        });
      }
    }

    const { rows, total, profileWasDefault, organizationId, channelBuckets } = await myOpps.listMyOpportunities({
      limit: req.query.limit,
      offset: req.query.offset,
      type: req.query.type,
      channel: req.query.channel,
      sort: req.query.sort,
      q: req.query.q,
      minScore: req.query.minScore,
      userId: (req.user && req.user.id) || null,
      restrictToOpportunityIds,
    });
    // v7: attach intelligence context per row (additive — existing fields stay).
    // v9: load profile + approvedAssets once and share across rows so the
    // executionMode/partner_profile fields populate without per-row DB hits.
    const intelligence = require('./intelligence.controller');
    const v9Cache = await intelligence.loadV9Cache({
      organizationId, userId: (req.user && req.user.id) || null,
    });
    const rowsWithContext = await Promise.all(rows.map(
      (r) => intelligence.attachContextToOpportunity(r, { organizationId, v9Cache }),
    ));
    return paginatedResponse(res, rowsWithContext, {
      total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
      profileWasDefault,
      channelBuckets: channelBuckets || null,
      // Phase 7.5: when present, the banner uses this to render the
      // strategic context. Absent for default (no-context) calls.
      strategicContext: strategicContext || null,
    });
  } catch (e) {
    logger.error('OIED listMy failed', { error: e.message });
    return errorResponse(res, 'Failed to list my opportunities', 500);
  }
}

// GET /api/v1/oied/profile  — current user's profile (or default fall-back).
async function getMyProfile(req, res) {
  try {
    const userId = req.user && req.user.id;
    const real = await profileSvc.getProfile(userId);
    if (real) return successResponse(res, real);
    const def = await profileSvc.getOrDefault(userId);
    return successResponse(res, { ...def, _isDefault: true });
  } catch (e) {
    return errorResponse(res, 'Failed to load profile', 500);
  }
}

// POST /api/v1/oied/profile  — create-or-replace.
async function postMyProfile(req, res) {
  try {
    const row = await profileSvc.createProfile(req.user && req.user.id, req.body || {});
    return successResponse(res, row, 'Profile saved', 201);
  } catch (e) {
    return errorResponse(res, e.message, 400);
  }
}

// PATCH /api/v1/oied/profile  — partial update.
async function patchMyProfile(req, res) {
  try {
    const row = await profileSvc.patchProfile(req.user && req.user.id, req.body || {});
    return successResponse(res, row);
  } catch (e) {
    return errorResponse(res, e.message, 400);
  }
}

// GET /api/v1/oied/bundles
async function listBundles(req, res) {
  try {
    const rows = await bundler.listBundles({ limit: req.query.limit });
    // v7: attach intelligence context per bundle.
    const intelligence = require('./intelligence.controller');
    const rowsWithContext = await Promise.all(rows.map(
      (b) => intelligence.attachContextToBundle(b, { organizationId: b.organizationId }),
    ));
    return successResponse(res, rowsWithContext);
  } catch (e) {
    return errorResponse(res, 'Failed to list bundles', 500);
  }
}

// POST /api/v1/oied/bundles/run  (admin) — rebuilds the bundle table.
async function runBundler(req, res) {
  try {
    const result = await bundler.buildBundles();
    return successResponse(res, result, 'Bundles rebuilt');
  } catch (e) {
    return errorResponse(res, 'Bundle build failed: ' + e.message, 500);
  }
}

// POST /api/v1/oied/opportunities/:id/generate
async function generate(req, res) {
  const opportunityId = Number(req.params.id);
  const type = String(req.body && req.body.type || '').toLowerCase();
  if (!opportunityId) return errorResponse(res, 'Invalid opportunity id', 400);
  if (!actions.ALLOWED_TYPES.includes(type)) {
    return errorResponse(res, `type must be one of: ${actions.ALLOWED_TYPES.join(', ')}`, 400);
  }
  try {
    const out = await actions.generateOutput({
      opportunityId,
      type,
      generatedBy: (req.user && req.user.id) || null,
      userId: (req.user && req.user.id) || null,
    });
    // Side-effect: track 'generated' event.
    await events.recordEvent({
      opportunityId,
      eventType: 'generated',
      userId: (req.user && req.user.id) || null,
      payload: { outputType: type, outputId: out.id },
    }).catch(() => {});
    return successResponse(res, out, 'Output generated', 201);
  } catch (e) {
    const limit = handlePlanLimit(res, e);
    if (limit) return limit;
    // v7.1 lifecycle gate (also fires from /generate in v8 — proposal
    // regeneration blocked once submitted/responded/won/lost exists).
    if (e instanceof events.LifecycleViolationError) {
      return errorResponse(res, e.message, 400, {
        requires: e.requires,
        status: 'invalid_stage',
      });
    }
    // v8: missing grounding context (agency / solicitation / scope).
    if (e.name === 'MissingGroundingError') {
      return errorResponse(res, e.message, 422, {
        status: 'needs_context',
        missing_fields: e.missing_fields,
      });
    }
    logger.error('OIED generate failed', { id: opportunityId, type, error: e.message });
    return errorResponse(res, 'Generation failed: ' + e.message, 500);
  }
}

// GET /api/v1/oied/opportunity-outputs?status=draft|approved|rejected&type=&opportunityId=
async function listOutputs(req, res) {
  try {
    const { rows, total } = await actions.listOutputs(req.query);
    return paginatedResponse(res, rows, {
      total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
  } catch (e) {
    logger.error('OIED listOutputs failed', { error: e.message });
    return errorResponse(res, 'Failed to list outputs', 500);
  }
}

async function getOutput(req, res) {
  try {
    const row = await actions.getOutput(Number(req.params.id));
    if (!row) return errorResponse(res, 'Not found', 404);
    return successResponse(res, row);
  } catch (e) {
    return errorResponse(res, 'Failed to fetch output', 500);
  }
}

// PATCH /api/v1/oied/opportunity-outputs/:id/status
async function patchOutput(req, res) {
  try {
    const updated = await actions.updateOutputStatus(Number(req.params.id), {
      status: req.body && req.body.status,
      content: req.body && req.body.content,
      reviewerId: (req.user && req.user.id) || null,
      reviewNotes: req.body && req.body.reviewNotes,
    });
    if (!updated) return errorResponse(res, 'Not found', 404);

    // Track approve/reject events.
    if (req.body && (req.body.status === 'approved' || req.body.status === 'rejected')) {
      await events.recordEvent({
        opportunityId: updated.opportunityId,
        eventType: req.body.status,
        userId: (req.user && req.user.id) || null,
        payload: { outputId: updated.id, outputType: updated.type },
      }).catch(() => {});
    } else if (req.body && req.body.content) {
      await events.recordEvent({
        opportunityId: updated.opportunityId,
        eventType: 'edited',
        userId: (req.user && req.user.id) || null,
        payload: { outputId: updated.id },
      }).catch(() => {});
    }
    return successResponse(res, updated);
  } catch (e) {
    logger.error('OIED patchOutput failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Update failed: ' + e.message, 500);
  }
}

// POST /api/v1/oied/opportunity-events
// Body: { opportunityId, eventType, payload? }
async function postEvent(req, res) {
  try {
    const ev = await events.recordEvent({
      opportunityId: req.body && Number(req.body.opportunityId),
      eventType: req.body && req.body.eventType,
      userId: (req.user && req.user.id) || null,
      payload: (req.body && req.body.payload) || {},
    });
    return successResponse(res, ev, 'Event recorded', 201);
  } catch (e) {
    return errorResponse(res, e.message, 400);
  }
}

// ----- v3 endpoints --------------------------------------------------

// GET /api/v1/oied/recommendations  — top-3 actions for the calling user.
async function listRecommendations(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const limit = Math.min(Number(req.query.limit) || 3, 10);
    const data = await recommendations.getTopActions(userId, { limit });
    // v7: attach intelligence context per row. Recommendation rows
    // already carry most fields; reshape into an opp-like record so the
    // helper finds them.
    // v9: also include description in the oppLike shape so executionMode
    // can scan for blocker/support keywords. recommendation.service rows
    // already carry it via getTopActions; if absent, executionMode falls
    // back to title-only scanning.
    const intelligence = require('./intelligence.controller');
    // Single shared cache across rows. Recommendations are user-scoped,
    // so derive orgId from the first row (or fall back to the calling user).
    const orgIdForCache = (data && data[0] && data[0].organization_id) || null;
    const v9Cache = await intelligence.loadV9Cache({
      organizationId: orgIdForCache, userId,
    });
    const dataWithContext = await Promise.all((data || []).map(async (r) => {
      const oppLike = {
        id: r.opportunity_id,
        title: r.title,
        description: r.description,
        category: r.category,
        value: r.expected_value,
        fitScore: r.fit_score,
        priorityScore: r.priority_score,
        urgency: r.urgency,
        bucket: r.bucket,
        winProbability: r.win_probability,
        effortEstimate: r.effort_estimate,
        sourceData: r.sourceData || r.source_data,
      };
      const wrapped = await intelligence.attachContextToOpportunity(oppLike, {
        organizationId: r.organization_id, v9Cache,
      });
      return { ...r, context: wrapped.context };
    }));
    return successResponse(res, dataWithContext);
  } catch (e) {
    logger.error('OIED recommendations failed', { error: e.message });
    return errorResponse(res, 'Failed to compute recommendations', 500);
  }
}

// POST /api/v1/oied/opportunities/:id/mark-submitted   (v7.1)
// Records event_type='submitted'. Idempotent (each call writes a new
// audit row). Distinct from /mark-result so the consumer agent
// expresses lifecycle stages explicitly.
async function markSubmitted(req, res) {
  const opportunityId = Number(req.params.id);
  if (!opportunityId) return errorResponse(res, 'Invalid opportunity id', 400);
  try {
    const ev = await events.recordEvent({
      opportunityId,
      eventType: 'submitted',
      userId: (req.user && req.user.id) || null,
      payload: {
        notes: (req.body && req.body.notes) || null,
        source: req.user && req.user.isApiKey ? 'bridge' : 'user',
      },
    });
    return successResponse(res, {
      success: true,
      message: 'Submission recorded',
      event_type: 'submitted',
      event_id: ev.id,
      opportunity_id: opportunityId,
    }, 'Submission recorded', 201);
  } catch (e) {
    logger.error('OIED markSubmitted failed', { id: opportunityId, error: e.message });
    return errorResponse(res, e.message, 400);
  }
}

// POST /api/v1/oied/opportunities/:id/mark-result
// Body: { status: 'won' | 'lost' | 'responded' | 'response_received',
//         notes?: string, dollarAmount?: number }
//
// v7.1 lifecycle rules (strict):
//   - status='submitted' → 400 (use /mark-submitted)
//   - status='responded' → requires submitted event; else 400
//   - status='won'/'lost' → requires response_received event; else 400
async function markResult(req, res) {
  const opportunityId = Number(req.params.id);
  if (!opportunityId) return errorResponse(res, 'Invalid opportunity id', 400);
  const raw = req.body && req.body.status;
  const eventType = events.normalizeResultStatus(raw);

  // v7.1: mark-result no longer accepts 'submitted'. Submission is its
  // own first-class endpoint.
  if (eventType === 'submitted') {
    return errorResponse(
      res,
      'Use POST /api/v1/oied/opportunities/:id/mark-submitted to record a submission',
      400,
    );
  }
  if (!events.CONVERSION_TYPES.has(eventType) || eventType === 'submitted') {
    return errorResponse(
      res,
      'status must be one of: responded (alias: response_received), won, lost',
      400,
    );
  }
  try {
    // v7.1 lifecycle ordering — fail fast before any state mutation.
    if (eventType === 'response_received') {
      await events.requireSubmitted(opportunityId);
    } else if (eventType === 'won' || eventType === 'lost') {
      await events.requireResponded(opportunityId);
    }

    const ev = await events.recordEvent({
      opportunityId,
      eventType,
      userId: (req.user && req.user.id) || null,
      payload: {
        notes: (req.body && req.body.notes) || null,
        dollar_amount: (req.body && Number(req.body.dollarAmount)) || null,
      },
    });
    return successResponse(res, ev, 'Result recorded', 201);
  } catch (e) {
    if (e instanceof events.LifecycleViolationError) {
      return errorResponse(res, e.message, 400, { requires: e.requires });
    }
    logger.error('OIED markResult failed', { id: opportunityId, status: raw, error: e.message });
    return errorResponse(res, e.message, 400);
  }
}

// POST /api/v1/oied/bundles/:id/strategy   (admin)
async function generateBundleStrategy(req, res) {
  const bundleId = Number(req.params.id);
  if (!bundleId) return errorResponse(res, 'Invalid bundle id', 400);
  try {
    const force = req.body && req.body.force === true;
    const out = await bundler.generateBundleStrategy(bundleId, { force });
    return successResponse(res, out, out.cached ? 'Cached strategy' : 'Strategy generated');
  } catch (e) {
    const limit = handlePlanLimit(res, e);
    if (limit) return limit;
    logger.error('OIED bundle strategy failed', { bundleId, error: e.message });
    return errorResponse(res, 'Strategy generation failed: ' + e.message, 500);
  }
}

// GET /api/v1/oied/conversion-stats — small summary for dashboards.
async function getConversionStats(req, res) {
  try {
    const since = req.query.since ? new Date(req.query.since) : null;
    const data = await events.getConversionStats({ since });
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, 'Failed to compute conversion stats', 500);
  }
}

// ----- v4 endpoints --------------------------------------------------

// GET  /api/v1/oied/briefing — today's structured payload (no email).
async function getBriefing(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await briefingSvc.buildBriefing({ userId });
    return successResponse(res, data);
  } catch (e) {
    logger.error('OIED briefing failed', { error: e.message });
    return errorResponse(res, 'Failed to build briefing', 500);
  }
}

// POST /api/v1/oied/briefing/send  (admin) — composes + emails.
async function sendBriefing(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const to = (req.body && req.body.to) || process.env.OIED_BRIEFING_TO;
    const out = await briefingSvc.deliverBriefing({ userId, to });
    return successResponse(res, out, out.sent ? 'Briefing sent' : 'Briefing skipped');
  } catch (e) {
    const limit = handlePlanLimit(res, e);
    if (limit) return limit;
    logger.error('OIED briefing send failed', { error: e.message });
    return errorResponse(res, 'Failed to send briefing: ' + e.message, 500);
  }
}

// POST /api/v1/oied/triggers/run  (admin) — runs the engine; body
// { dryRun?: bool, maxProposals?: int, maxStrategies?: int }.
async function runTriggers(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const dryRun = req.body && req.body.dryRun === true;
    const out = await triggerSvc.runTriggers({
      userId,
      dryRun,
      maxProposals: req.body && Number(req.body.maxProposals) || undefined,
      maxStrategies: req.body && Number(req.body.maxStrategies) || undefined,
    });
    return successResponse(res, out, dryRun ? 'Trigger dry-run complete' : 'Triggers run');
  } catch (e) {
    logger.error('OIED triggers run failed', { error: e.message });
    return errorResponse(res, 'Triggers failed: ' + e.message, 500);
  }
}

// GET /api/v1/oied/triggers/logs (admin) — paginated log read.
async function listTriggerLogs(req, res) {
  try {
    const { rows, total } = await triggerSvc.listLogs({
      limit: req.query.limit, offset: req.query.offset,
    });
    return paginatedResponse(res, rows, {
      total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
  } catch (e) {
    return errorResponse(res, 'Failed to list trigger logs', 500);
  }
}

// POST /api/v1/oied/bundles/:id/blueprint  (admin)
async function generateBundleBlueprint(req, res) {
  const bundleId = Number(req.params.id);
  if (!bundleId) return errorResponse(res, 'Invalid bundle id', 400);
  try {
    const force = req.body && req.body.force === true;
    const out = await bundler.generateProductBlueprint(bundleId, { force });
    return successResponse(res, out, out.cached ? 'Cached blueprint' : 'Blueprint generated');
  } catch (e) {
    const limit = handlePlanLimit(res, e);
    if (limit) return limit;
    logger.error('OIED bundle blueprint failed', { bundleId, error: e.message });
    return errorResponse(res, 'Blueprint generation failed: ' + e.message, 500);
  }
}

// ----- v5 endpoints --------------------------------------------------

// GET /api/v1/oied/execution-queue — drafts ranked by ROI/hour.
async function listExecutionQueue(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await executionQueueSvc.listExecutionQueue({
      userId,
      limit: req.query.limit,
      offset: req.query.offset,
      minRoi: req.query.minRoi,
    });
    return paginatedResponse(res, data.rows, {
      total: data.total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
      organizationId: data.organization_id,
    });
  } catch (e) {
    logger.error('OIED execution-queue failed', { error: e.message });
    return errorResponse(res, 'Failed to load execution queue', 500);
  }
}

// GET /api/v1/oied/revenue/dashboard
async function getRevenueDashboard(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await revenueDashboardSvc.getDashboard({ userId });
    return successResponse(res, data);
  } catch (e) {
    logger.error('OIED revenue dashboard failed', { error: e.message });
    return errorResponse(res, 'Failed to load revenue dashboard', 500);
  }
}

// GET /api/v1/oied/feedback/pending-outcomes
async function getPendingOutcomes(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await feedbackSvc.getPendingOutcomes({ userId });
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, 'Failed to load pending outcomes', 500);
  }
}

// GET /api/v1/oied/feedback/weekly-summary
async function getWeeklySummary(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await feedbackSvc.buildWeeklySummary({ userId });
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, 'Failed to build weekly summary', 500);
  }
}

// POST /api/v1/oied/feedback/weekly-summary/send (admin)
async function sendWeeklySummary(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const to = (req.body && req.body.to) || process.env.OIED_WEEKLY_SUMMARY_TO;
    const out = await feedbackSvc.deliverWeeklySummary({ userId, to });
    return successResponse(res, out, out.sent ? 'Weekly summary sent' : 'Skipped');
  } catch (e) {
    return errorResponse(res, 'Failed to send weekly summary: ' + e.message, 500);
  }
}

// POST /api/v1/oied/bundles/:id/execution-plan (admin)
async function generateExecutionPlan(req, res) {
  const bundleId = Number(req.params.id);
  if (!bundleId) return errorResponse(res, 'Invalid bundle id', 400);
  try {
    const userId = (req.user && req.user.id) || null;
    const force = req.body && req.body.force === true;
    const out = await executionPlannerSvc.generateExecutionPlan(bundleId, { userId, force });
    return successResponse(res, out, out.cached ? 'Cached plan' : 'Plan generated');
  } catch (e) {
    logger.error('OIED execution-plan generate failed', { bundleId, error: e.message });
    return errorResponse(res, 'Plan generation failed: ' + e.message, 500);
  }
}

// GET /api/v1/oied/bundles/:id/execution-plan
async function getExecutionPlan(req, res) {
  const bundleId = Number(req.params.id);
  if (!bundleId) return errorResponse(res, 'Invalid bundle id', 400);
  try {
    const plan = await executionPlannerSvc.getExecutionPlan(bundleId);
    if (!plan) return errorResponse(res, 'Not found', 404);
    return successResponse(res, plan);
  } catch (e) {
    return errorResponse(res, 'Failed to fetch plan', 500);
  }
}

// POST /api/v1/oied/bundles/:id/execution-plan/start (admin)
async function startBuild(req, res) {
  const bundleId = Number(req.params.id);
  if (!bundleId) return errorResponse(res, 'Invalid bundle id', 400);
  try {
    const out = await executionPlannerSvc.startBuild(bundleId);
    return successResponse(res, out, out.alreadyStarted ? 'Already in progress' : 'Build started');
  } catch (e) {
    logger.error('OIED start-build failed', { bundleId, error: e.message });
    return errorResponse(res, 'Start failed: ' + e.message, 400);
  }
}

// GET /api/v1/oied/billing/usage — current org usage this month.
async function getBillingUsage(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const profileSvc = require('./profile.service');
    const orgId = await profileSvc.resolveOrgId(userId);
    const data = await billingSvc.getUsageSummary({ organizationId: orgId });
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, 'Failed to load usage', 500);
  }
}

// GET /api/v1/oied/billing/plan
async function getBillingPlan(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const profileSvc = require('./profile.service');
    const orgId = await profileSvc.resolveOrgId(userId);
    const tier = await billingSvc.getOrgTier(orgId);
    return successResponse(res, {
      organization_id: orgId,
      tier,
      limits: billingSvc.getPlanLimits(tier),
      enforcing: billingSvc.isEnforcing(),
    });
  } catch (e) {
    return errorResponse(res, 'Failed to load plan', 500);
  }
}

// PATCH /api/v1/oied/billing/plan (admin) — body: { tier }
async function changeBillingPlan(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const profileSvc = require('./profile.service');
    const orgId = await profileSvc.resolveOrgId(userId);
    const tier = (req.body && req.body.tier);
    const org = await billingSvc.changePlanTier({ organizationId: orgId, tier });
    return successResponse(res, org, 'Plan updated');
  } catch (e) {
    return errorResponse(res, e.message, 400);
  }
}

// ----- v6 endpoints --------------------------------------------------

// GET /api/v1/oied/velocity — pipeline durations (submit/response/win).
async function getVelocity(req, res) {
  try {
    const userId = (req.user && req.user.id) || null;
    const data = await velocitySvc.getVelocity({ userId });
    return successResponse(res, data);
  } catch (e) {
    logger.error('OIED velocity failed', { error: e.message });
    return errorResponse(res, 'Failed to load velocity', 500);
  }
}

module.exports = {
  listMy,
  generate,
  listOutputs,
  getOutput,
  patchOutput,
  postEvent,
  getMyProfile,
  postMyProfile,
  patchMyProfile,
  listBundles,
  runBundler,
  // v3
  listRecommendations,
  markResult,
  generateBundleStrategy,
  getConversionStats,
  // v7.1
  markSubmitted,
  // v4
  getBriefing,
  sendBriefing,
  runTriggers,
  listTriggerLogs,
  generateBundleBlueprint,
  // v5
  listExecutionQueue,
  getRevenueDashboard,
  getPendingOutcomes,
  getWeeklySummary,
  sendWeeklySummary,
  generateExecutionPlan,
  getExecutionPlan,
  startBuild,
  getBillingUsage,
  getBillingPlan,
  changeBillingPlan,
  // v6
  getVelocity,
};
