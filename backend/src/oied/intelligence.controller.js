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
    // v7.1: 4-way lifecycle classification. Replaces the v7 3-way that
    // collapsed "submitted, no response yet" with "responded, no outcome
    // yet" under one `submitted_pending` label.
    const won       = events.find((e) => e.eventType === 'won');
    const lost      = events.find((e) => e.eventType === 'lost');
    const responded = events.find((e) => e.eventType === 'response_received');
    const submitted = events.find((e) => e.eventType === 'submitted');
    if (won)       outcome = 'won';
    else if (lost) outcome = 'lost';
    else if (responded) {
      outcome = 'responded_no_outcome';
    } else if (submitted) {
      outcome = 'submitted_no_response';
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

// v9: load org profile + approvedAssets once per request and pass to
// per-row envelope builders. These are cheap (one DB read each) but on a
// 50-row list we'd make 100 reads if we didn't cache. Callers should
// build this once and thread it through all attachContextToOpportunity
// calls in the same request.
async function loadV9Cache({ organizationId, userId } = {}) {
  // eslint-disable-next-line global-require
  const profileSvcLocal = require('./profile.service');
  // eslint-disable-next-line global-require
  const approvedAssetsSvc = require('./approvedAssets.service');
  let profile = null;
  let approvedAssets = null;
  try {
    const orgId = organizationId || (await profileSvcLocal.resolveOrgId(userId));
    profile = await profileSvcLocal.getOrDefaultByOrg(orgId);
    approvedAssets = await approvedAssetsSvc.getApprovedAssets({ organizationId: orgId });
  } catch (e) {
    logger.warn('intelligence: v9 cache load failed', { error: e.message });
  }
  return { profile, approvedAssets };
}

// Attach `context` to one opportunity row (already enriched with
// fitScore/priorityScore/bucket/effortEstimate/winProbability).
//
// v8: optional `grounding` opt — passed by the single-row endpoint so
// the consumer agent can read `context.grounding.agency_name` /
// `solicitation_id` / `missing_fields[]` before deciding whether to
// call POST /generate. List endpoints omit grounding (per-row DB hit
// would be expensive); they expect callers to fetch /opportunities/:id
// for detail.
//
// v9: optional `v9Cache = {profile, approvedAssets}` — when supplied,
// computes execution_mode + partner_profile + outreach_ready and embeds
// in the envelope. Pure-function on top of already-loaded data, so no
// per-row DB cost.
async function attachContextToOpportunity(
  opp,
  { organizationId, grounding = null, v9Cache = null } = {},
) {
  const { latestDraft, outcome, submittedDaysAgo } = await loadOppOutcomeContext(opp.id);
  const enriched = submittedDaysAgo != null
    ? { ...opp, _submittedDaysAgo: submittedDaysAgo }
    : opp;
  let executionMode = null;
  if (v9Cache) {
    // eslint-disable-next-line global-require
    const emSvc = require('./executionMode.service');
    executionMode = emSvc.computeExecutionMode({
      opp: enriched,
      profile: v9Cache.profile,
      approvedAssets: v9Cache.approvedAssets,
      grounding,
    });
  }
  return {
    ...opp,
    context: ctx.buildContextForOpportunity({
      opp: enriched,
      organizationId,
      latestDraft,
      outcome,
      grounding,
      executionMode,
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
    // v8: load grounding inline for the single-row endpoint so the
    // consumer agent can read context.grounding.{agency_name,
    // solicitation_id, missing_fields} before calling POST /generate.
    // v9: load profile + approvedAssets in parallel so executionMode
    // computes inline.
    // eslint-disable-next-line global-require
    const groundingSvc = require('./grounding.service');
    const [groundingResult, v9CacheResult] = await Promise.all([
      groundingSvc.getOpportunityGrounding(id).catch((e) => {
        logger.warn('intelligence: grounding lookup failed', { id, error: e.message });
        return null;
      }),
      loadV9Cache({ organizationId: orgId, userId: req.user && req.user.id }),
    ]);
    const wrapped = await attachContextToOpportunity(enriched, {
      organizationId: orgId,
      grounding: groundingResult,
      v9Cache: v9CacheResult,
    });
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
    // v9: load once per request, share across rows.
    const v9Cache = await loadV9Cache({ organizationId: orgId, userId });
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
        const wrapped = await attachContextToOpportunity(oppLike, {
          organizationId: orgId, v9Cache,
        });
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

// GET /api/v1/oied/news/word-cloud — per-word frequency + sentiment + age
// over recent ai_news rows. Powers the word-cloud at the top of Mission
// Control. Each entry: { word, count, avg_age_days, sentiment }.
async function getNewsWordCloudHandler(req, res) {
  try {
    // eslint-disable-next-line global-require
    const newsSvc = require('./newsWordCloud.service');
    const max = Math.min(Number(req.query.max) || 40, 100);
    const out = await newsSvc.getNewsWordCloud({ max });
    return successResponse(res, out);
  } catch (e) {
    logger.error('intelligence.news.wordCloud failed', { error: e.message });
    return errorResponse(res, 'Failed to load news word cloud: ' + e.message, 500);
  }
}

// GET /api/v1/oied/keywords/cloud — read path for the validated keyword
// cloud. v9.7+: prefers the persisted keyword_trends table (twice-daily
// cron-computed, every word verified to have at least one matching opp
// or AI tool). Falls back to the live aggregator if the table is empty
// or the last compute is > 36h stale.
//
// Query params:
//   max=40                 cap on returned words
//   industries_only=true   filter to is_industry rows only
//   sources=...            (legacy live mode only)
//   lookback=14            (legacy live mode only)
async function getKeywordCloudHandler(req, res) {
  try {
    const max = Math.min(Number(req.query.max) || 40, 100);
    const industriesOnly = String(req.query.industries_only || '').toLowerCase() === 'true';

    // eslint-disable-next-line global-require
    const { KeywordTrend } = require('../models');

    // Try the persisted table first. Wrapped in its own try/catch so that
    // a missing table (pre-migration) or schema drift falls through to
    // the live aggregator below instead of 500-ing the whole endpoint.
    if (KeywordTrend) {
      try {
        const where = { matchCount: { [Op.gt]: 0 } };
        if (industriesOnly) where.isIndustry = true;
        const rows = await KeywordTrend.findAll({
          where,
          order: [['matchCount', 'DESC'], ['totalMentions', 'DESC']],
          limit: max,
        });
        if (rows.length > 0) {
          const newest = rows.reduce((a, r) => {
            const t = new Date(r.lastComputedAt).getTime();
            return t > a ? t : a;
          }, 0);
          const ageHours = (Date.now() - newest) / 3_600_000;
          if (ageHours <= 36) {
            const words = rows.map((r) => {
              const data = r.toJSON ? r.toJSON() : r;
              const channelCounts = data.channelCounts || {};
              const channels = Object.entries(channelCounts)
                .map(([key, count]) => ({ key, count: Number(count) || 0 }))
                .sort((a, b) => b.count - a.count);
              return {
                word: data.word,
                display_word: data.displayWord || data.word,
                count: Number(data.totalMentions) || 0,
                match_count: Number(data.matchCount) || 0,
                tool_count: Number(data.toolCount) || 0,
                sentiment_score: data.sentimentScore != null ? Number(data.sentimentScore) : 0,
                sentiment_label: data.sentimentLabel || 'neutral',
                avg_age_days: data.avgAgeDays != null ? Number(data.avgAgeDays) : null,
                is_industry: !!data.isIndustry,
                channels,
              };
            });
            return successResponse(res, {
              words,
              source: 'keyword_trends',
              last_computed_at: new Date(newest).toISOString(),
              industries_only: industriesOnly,
            });
          }
          logger.warn('intelligence.keywords.cloud: persisted snapshot stale, falling back', {
            ageHours: Math.round(ageHours),
          });
        }
      } catch (persistedErr) {
        logger.warn('intelligence.keywords.cloud: KeywordTrend read failed, falling back to live', {
          error: persistedErr.message,
        });
      }
    }

    // Fallback: live aggregation. Logged so we can monitor reliance on it.
    // eslint-disable-next-line global-require
    const svc = require('./keywordCloud.service');
    const lookbackDays = Math.min(Number(req.query.lookback) || 14, 60);
    const sources = req.query.sources
      ? String(req.query.sources).split(',').map((s) => s.trim()).filter(Boolean)
      : svc.ALL_SOURCES;
    const out = await svc.getKeywordCloud({ max, lookbackDays, sources });
    return successResponse(res, { ...out, source: 'live_fallback' });
  } catch (e) {
    logger.error('intelligence.keywords.cloud failed', { error: e.message });
    return errorResponse(res, 'Failed to load keyword cloud: ' + e.message, 500);
  }
}

// POST /api/v1/oied/keywords/recompute — admin-only on-demand refresh of
// the keyword_trends table. Mirrors the twice-daily cron job but lets
// us refresh after content changes without waiting for the next slot.
async function recomputeKeywordTrendsHandler(req, res) {
  try {
    // eslint-disable-next-line global-require
    const svc = require('./keywordTrendCompute.service');
    const out = await svc.runKeywordTrendCompute();
    return successResponse(res, out);
  } catch (e) {
    logger.error('intelligence.keywords.recompute failed', { error: e.message });
    return errorResponse(res, 'Failed to recompute keyword trends: ' + e.message, 500);
  }
}

// GET /api/v1/oied/keywords/related-tools?q=<keyword> — AI tools that
// match the keyword across name / description / category / tags.
// Used by the cross-channel search UI to surface tools alongside opp
// results without migrating tools into the opportunities table.
async function getRelatedToolsHandler(req, res) {
  try {
    // eslint-disable-next-line global-require
    const svc = require('./relatedTools.service');
    const q = req.query.q || '';
    const max = Math.min(Number(req.query.max) || 10, 25);
    const out = await svc.getRelatedTools({ q, max });
    return successResponse(res, out);
  } catch (e) {
    logger.error('intelligence.keywords.relatedTools failed', { error: e.message });
    return errorResponse(res, 'Failed to load related tools: ' + e.message, 500);
  }
}

// GET /api/v1/oied/channels/summary — one card per channel: active count,
// top opportunity (by ai_score), drafts-in-review count, total
// estimated value. Powers the dashboard's Channel Overview grid.
async function getChannelsSummary(req, res) {
  try {
    // eslint-disable-next-line global-require
    const channelsSvc = require('./channels.service');
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    // Aggregate by (type) since channel is purely a derivation of type/source.
    // SQL is fastest path — one round trip vs per-channel queries.
    const rows = await sequelize.query(
      `SELECT type, source,
              COUNT(*)::int               AS active_count,
              COALESCE(SUM(value), 0)::numeric AS total_value
       FROM opportunities
       WHERE status = 'active'
       GROUP BY type, source`,
      { type: QueryTypes.SELECT },
    );

    // Roll (type, source) buckets up into channel buckets.
    const byChannel = new Map();
    for (const ch of channelsSvc.listChannels()) {
      byChannel.set(ch.key, {
        key: ch.key,
        label: ch.label,
        icon: ch.icon,
        color: ch.color,
        active_count: 0,
        total_value: 0,
      });
    }
    for (const row of rows) {
      const ch = channelsSvc.getChannelForOpp({ type: row.type, source: row.source });
      if (ch.key === 'unknown') continue;
      const agg = byChannel.get(ch.key);
      agg.active_count += Number(row.active_count) || 0;
      agg.total_value  += Number(row.total_value)  || 0;
    }

    // Optional top-opportunity hint per channel (best title we can show).
    // Single query: join opportunities to find the highest-priority active
    // row per type, then map to channel.
    const tops = await sequelize.query(
      `SELECT DISTINCT ON (type) id, title, type, source, ai_score
       FROM opportunities
       WHERE status = 'active' AND ai_score IS NOT NULL
       ORDER BY type, ai_score DESC, id DESC`,
      { type: QueryTypes.SELECT },
    );
    for (const t of tops) {
      const ch = channelsSvc.getChannelForOpp({ type: t.type, source: t.source });
      const agg = byChannel.get(ch.key);
      if (!agg) continue;
      // Keep the highest-priority overall for the channel (since multiple
      // types may roll into one channel, pick the best).
      if (!agg.top_opp || (t.ai_score || 0) > (agg.top_opp.ai_score || 0)) {
        agg.top_opp = {
          id: t.id,
          title: t.title,
          ai_score: Number(t.ai_score) || 0,
        };
      }
    }

    return successResponse(res, Array.from(byChannel.values()));
  } catch (e) {
    logger.error('intelligence.channels.summary failed', { error: e.message });
    return errorResponse(res, 'Failed to load channels summary: ' + e.message, 500);
  }
}

module.exports = {
  // New endpoints
  getOpportunityIntelligence,
  listExecutionQueueIntelligence,
  getBundleBlueprintIntelligence,
  getRevenueAlias,
  getChannelsSummary,
  getNewsWordCloudHandler,
  getKeywordCloudHandler,
  getRelatedToolsHandler,
  recomputeKeywordTrendsHandler,
  // Helpers (used by oied.controller list endpoints)
  attachContextToOpportunity,
  attachContextToBundle,
  loadOppOutcomeContext,
  loadV9Cache,
};
