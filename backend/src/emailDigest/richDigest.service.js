// Rich daily digest aggregator.
//
// Pulls top-N items from every opportunity surface the app exposes:
//   - Bonfire: top 5 active contracts by priority_score
//   - Strategic clusters: best-fit cluster by strategic_score (the one to build)
//   - Gov contracts (SAM.gov etc), AI news, AI jobs, freelance, investments,
//     grants, research papers: top 3-5 each from the unified opportunities
//     table (filtered by type + active + last 30 days for ranking)
//   - AI tools: top 5 trending from ai_tools
//   - Today's adds: count of opps created in the last 24h, grouped by type
//
// Read-only. Soft-fails per-section so one upstream outage doesn't blank the
// whole email — empty arrays in the output simply mean that section is hidden
// in the template.

const { Op } = require('sequelize');
const {
  Opportunity,
  BonfireOpportunity,
  BonfireStrategicOpportunity,
} = require('../models');
const aiToolService = require('../aiTools/aiTool.service');
const logger = require('../logging/logger');

const TOP = {
  bonfire: 5,
  strategicCluster: 1,
  govContracts: 3,
  aiNews: 5,
  freelance: 3,
  aiJobs: 5,
  investments: 3,
  grants: 3,
  research: 3,
  aiTools: 5,
};

// Helper: safe-call an async section fetch. Logs + swallows errors so a single
// broken upstream doesn't blank the entire email.
async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    logger.warn(`richDigest section "${label}" failed`, { error: e.message });
    return fallback;
  }
}

// Top N active opportunities of a given type. ai_score desc, then created_at desc.
// "Active" = no expires_at OR expires_at in the future.
async function topByType(type, limit) {
  return Opportunity.findAll({
    where: {
      type,
      status: 'active',
      [Op.and]: [{
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gte]: new Date() } },
        ],
      }],
    },
    order: [['aiScore', 'DESC NULLS LAST'], ['publishedAt', 'DESC NULLS LAST'], ['createdAt', 'DESC']],
    limit,
  });
}

// Top N Bonfire opportunities to BID on — active only, sorted by priority_score.
// Reuses the existing bonfire opportunities table (richer fields than the
// unified opportunities mirror).
async function topBonfire(limit) {
  return BonfireOpportunity.findAll({
    where: {
      [Op.and]: [{
        [Op.or]: [
          { closeDate: null },
          { closeDate: { [Op.gte]: new Date() } },
          { pursuitStatus: { [Op.in]: ['pursuing', 'submitted'] } },
        ],
      }],
    },
    order: [['priorityScore', 'DESC NULLS LAST'], ['createdAt', 'DESC']],
    limit,
  });
}

// Best-fit Strategic cluster — the strategist's #1 recommendation. Caller can
// drill into /bonfire?fromCluster=<id> to see every active bid this product fits.
async function topStrategicCluster(limit) {
  return BonfireStrategicOpportunity.findAll({
    where: { status: { [Op.in]: ['new', 'reviewed'] } },
    order: [['strategicScore', 'DESC NULLS LAST'], ['generatedForDate', 'DESC']],
    limit,
  });
}

// Counts of opps created in the last 24h, grouped by type. Drives the
// "Added today" summary strip.
async function todayCountsByType() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await Opportunity.findAll({
    where: { createdAt: { [Op.gte]: since } },
    attributes: [
      'type',
      [Opportunity.sequelize.fn('COUNT', Opportunity.sequelize.col('id')), 'count'],
    ],
    group: ['type'],
    raw: true,
  });
  const out = {};
  let total = 0;
  for (const r of rows) {
    const n = Number(r.count) || 0;
    out[r.type] = n;
    total += n;
  }
  // Also count fresh bonfire bids ingested in the last 24h (not always mirrored
  // into the unified opportunities table immediately).
  try {
    const bonfireNew = await BonfireOpportunity.count({
      where: { createdAt: { [Op.gte]: since } },
    });
    if (bonfireNew > 0 && !out.bonfire) out.bonfire = bonfireNew;
    if (bonfireNew > (out.bonfire || 0)) out.bonfire = bonfireNew;
    total = Object.values(out).reduce((a, b) => a + b, 0);
  } catch (_) { /* non-fatal */ }
  return { byType: out, total, since };
}

async function topAiTools(limit) {
  return aiToolService.getTopTrendingTools({ limit });
}

// Main entry point. Returns an envelope with each section + counts. Designed
// to be passed directly into richDigestEmailTemplate().
async function assembleRichDigest() {
  const [
    bonfireContracts,
    strategicClusters,
    govContracts,
    aiNews,
    freelance,
    aiJobs,
    investments,
    grants,
    research,
    aiTools,
    todayCounts,
  ] = await Promise.all([
    safe('bonfire',        () => topBonfire(TOP.bonfire), []),
    safe('strategic',      () => topStrategicCluster(TOP.strategicCluster), []),
    safe('gov_contract',   () => topByType('gov_contract', TOP.govContracts), []),
    safe('ai_news',        () => topByType('ai_news', TOP.aiNews), []),
    safe('freelance',      () => topByType('freelance', TOP.freelance), []),
    safe('ai_job',         () => topByType('ai_job', TOP.aiJobs), []),
    safe('investment',     () => topByType('investment', TOP.investments), []),
    safe('grant',          () => topByType('grant', TOP.grants), []),
    safe('research',       () => topByType('research', TOP.research), []),
    safe('ai_tools',       () => topAiTools(TOP.aiTools), []),
    safe('today_counts',   () => todayCountsByType(), { byType: {}, total: 0, since: new Date() }),
  ]);

  return {
    bonfireContracts,
    strategicClusters,
    govContracts,
    aiNews,
    freelance,
    aiJobs,
    investments,
    grants,
    research,
    aiTools,
    todayCounts,
    generatedAt: new Date(),
  };
}

module.exports = {
  assembleRichDigest,
  TOP,
  // Exported for tests.
  topByType,
  topBonfire,
  topStrategicCluster,
  topAiTools,
  todayCountsByType,
};
