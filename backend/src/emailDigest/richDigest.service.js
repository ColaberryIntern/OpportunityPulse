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
  DeepResearchReport,
} = require('../models');
const aiToolService = require('../aiTools/aiTool.service');
const logger = require('../logging/logger');

const TOP = {
  bonfire: 10,
  strategicCluster: 2,
  govContracts: 5,
  aiNews: 5,
  freelance: 3,
  aiJobs: 5,
  investments: 3,
  grants: 3,
  research: 3,
  aiTools: 5,
  deepResearch: 3,
};

// Minimum days before close_date for a Bonfire bid to be surfaced. Bids
// closing inside this window are too tight to prep a proposal, so they're
// hidden. NO override for pursuit_status — closed contracts (negative days)
// are always excluded per operator request. Configurable via env so the
// threshold can be tuned without a code change.
const BONFIRE_DIGEST_MIN_CLOSE_DAYS = Math.max(
  0,
  parseInt(process.env.BONFIRE_DIGEST_MIN_CLOSE_DAYS, 10) || 10,
);

// Winnability filter for federal (SAM.gov) bids:
//  - need at least N days to prep a proposal (operator's 14-day grace rule)
//  - exclude set-asides we are not certified to compete for (8(a), WOSB/EDWOSB,
//    HUBZone, SDVOSB). Total-Small-Business (SBA/SBP), SBIR/STTR, and full-and-
//    open (NONE/null) stay in — those are biddable for a small, SAM-registered
//    firm with no special certifications yet.
const SAM_GOV_MIN_DAYS_TO_CLOSE = Math.max(
  0,
  parseInt(process.env.SAM_GOV_MIN_DAYS_TO_CLOSE, 10) || 14,
);
const CERT_WALLED_SET_ASIDES = ['8A', '8AN', 'WOSB', 'EDWOSB', 'HZC', 'HZS', 'SDVOSBC', 'SDVOSBS', 'VSA', 'VSS'];

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

// Top N gov contracts to BID on — uses the new fit_score persisted at
// ai_analysis.govFit.fit_score by the gov contract scoring service. Hard
// filters:
//  - source = 'sam_gov' ONLY. The usa_spending mirror is historical
//    AWARDS (already won by other companies); they have no place in a
//    "to bid on" list.
//  - id >= 100. Excludes the seed/test data (low IDs with suspiciously
//    perfect "AI in [domain]" titles) that was polluting the rankings.
//  - expires_at must be in the future. Closed solicitations drop.
//  - fit_score (from JSONB) must be >= GOV_CONTRACT_MIN_FIT_SCORE so noise
//    falls away and the cream rises to the top.
//
// Sort: fit_score DESC. Bidders see the AI-Systems-aligned contracts first.
//
// **Defensive dedup**: the SAM.gov ingestion produces multiple rows for the
// same notice (each scrape pass gets a fresh hashed source_id rather than
// the SAM noticeId), so identical (title, agency) pairs would otherwise
// duplicate in the email. We over-fetch (3× the limit), collapse to one
// row per (title, agency) keeping the highest-fit representative, then
// take the top N. This is a digest-layer guard; the underlying ingest
// dedup is a separate cleanup.
async function topGovContracts(limit) {
  const minFit = Math.max(
    0,
    parseInt(process.env.GOV_CONTRACT_MIN_FIT_SCORE, 10) || 50,
  );
  const overFetch = Math.max(limit * 3, limit + 10);
  const minCloseDate = new Date(Date.now() + SAM_GOV_MIN_DAYS_TO_CLOSE * 24 * 60 * 60 * 1000);
  const certWalledList = CERT_WALLED_SET_ASIDES.map((c) => `'${c}'`).join(',');
  const rows = await Opportunity.findAll({
    where: {
      type: 'gov_contract',
      source: { [Op.in]: ['sam_gov', 'sbir_gov'] },
      status: 'active',
      id: { [Op.gte]: 100 },
      [Op.and]: [
        // Winnability: enough lead time to prepare a proposal.
        { expiresAt: { [Op.gte]: minCloseDate } },
        // Relevance floor (AI-systems fit).
        Opportunity.sequelize.literal(
          `(ai_analysis #> '{govFit,fit_score}')::numeric >= ${minFit}`
        ),
        // Winnability: drop set-asides we cannot legally compete for yet.
        Opportunity.sequelize.literal(
          `((source_data->>'typeOfSetAside') IS NULL OR (source_data->>'typeOfSetAside') NOT IN (${certWalledList}))`
        ),
      ],
    },
    // Rank by bid_score — the Bonfire priority_score plus a winnability bonus that
    // lifts the genuinely-winnable SBIR/STTR + Total-Small-Business lane (where a
    // no-past-performance firm can actually win) above full-and-open. Falls back to
    // priority_score, then fit_score, for any not-yet-rescored row. All 0-100.
    order: [
      [
        Opportunity.sequelize.literal(
          `COALESCE((ai_analysis #> '{bonfireScore,bid_score}')::numeric, (ai_analysis #> '{bonfireScore,priority_score}')::numeric, (ai_analysis #> '{govFit,fit_score}')::numeric)`
        ),
        'DESC NULLS LAST',
      ],
      // SAM solicitations rarely carry a dollar value, so their Bonfire score
      // compresses; break ties on AI-fit so relevance ordering survives.
      [
        Opportunity.sequelize.literal(`(ai_analysis #> '{govFit,fit_score}')::numeric`),
        'DESC NULLS LAST',
      ],
      ['expiresAt', 'ASC'],
    ],
    limit: overFetch,
  });

  // Dedup by normalized (title, agency). The first occurrence wins because
  // the rows already arrived in Bonfire priority_score DESC order.
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    const titleKey = String(r.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const agencyKey = String(
      r.sourceData?.fullParentPathName || r.sourceData?.organizationName || ''
    ).trim().toLowerCase().replace(/\s+/g, ' ');
    const key = `${titleKey}|${agencyKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
    if (unique.length >= limit) break;
  }
  return unique;
}

// Top N Bonfire opportunities to BID on — sorted by priority_score then fit.
// HARD filter: close_date must exist AND be at least
// BONFIRE_DIGEST_MIN_CLOSE_DAYS in the future. No exceptions for pursuit
// status (operator: "Don't add bonfires with negative days left, they are
// closed. No closed contracts."). Bids with NULL close_date are also
// excluded — we can't prove they have time to prep.
async function topBonfire(limit) {
  const cutoff = new Date(Date.now() + BONFIRE_DIGEST_MIN_CLOSE_DAYS * 24 * 60 * 60 * 1000);
  return BonfireOpportunity.findAll({
    where: {
      closeDate: { [Op.gte]: cutoff },
    },
    order: [['priorityScore', 'DESC NULLS LAST'], ['fitScore', 'DESC NULLS LAST'], ['createdAt', 'DESC']],
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

// Top N completed Deep Research reports — sorted by confidence_score desc,
// then by recency. We surface a deep-link to /admin/deep-research/:id so the
// user lands directly on the full report.
async function topDeepResearchReports(limit) {
  return DeepResearchReport.findAll({
    where: {
      status: { [Op.in]: ['success', 'completed'] },
      isArchived: false,
    },
    order: [
      ['isFavorite', 'DESC'],
      ['confidenceScore', 'DESC NULLS LAST'],
      ['createdAt', 'DESC'],
    ],
    limit,
    attributes: [
      'id', 'searchTerm', 'executiveSummary', 'marketStage',
      'confidenceScore', 'commercializationScore', 'sourceCount',
      'isFavorite', 'createdAt',
    ],
  });
}

// Deterministic 2-3 sentence brief over today's intake + top picks. No LLM
// call — we already have the data and the user explicitly asked to keep
// LLM costs flat. Mention: (1) total ingested today, (2) the dominant source
// type, (3) the single highest-leverage pick to surface attention.
function buildSummaryParagraph(data) {
  const totalNew = data.todayCounts?.total || 0;
  const byType = data.todayCounts?.byType || {};
  const friendly = {
    gov_contract: 'gov contracts', ai_job: 'AI jobs', investment: 'capital deployments',
    grant: 'grants', ai_news: 'AI news items', freelance: 'freelance gigs',
    bonfire: 'Bonfire bids', bonfire_strategic: 'strategic clusters', research: 'research papers',
  };
  // Dominant source today (by count).
  const dominant = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .find(([t, n]) => n > 0 && t !== 'bonfire_strategic'); // exclude strategic — derivative

  const parts = [];
  if (totalNew > 0) {
    if (dominant) {
      parts.push(`Last 24h: ${totalNew} new items ingested, led by ${dominant[1]} ${friendly[dominant[0]] || dominant[0]}.`);
    } else {
      parts.push(`Last 24h: ${totalNew} new items ingested across the network.`);
    }
  } else {
    parts.push('No fresh items ingested in the last 24h — sources refresh on cron.');
  }

  // Top-leverage callout: prefer Strategic > Bonfire > Gov.
  const topStrategic = data.strategicClusters?.[0];
  const topBonfireBid = data.bonfireContracts?.[0];
  if (topStrategic) {
    const score = topStrategic.strategicScore || 0;
    const sources = (topStrategic.sourceOpportunityIds || []).length;
    parts.push(`Strongest signal: the "${topStrategic.title}" cluster (score ${score}, ${sources} source bids) is the top product-to-build opportunity.`);
  } else if (topBonfireBid) {
    const pri = topBonfireBid.priorityScore != null ? Math.round(Number(topBonfireBid.priorityScore)) : null;
    parts.push(`Strongest signal: "${topBonfireBid.title}" — priority ${pri || '?'} from ${topBonfireBid.agency || 'an active agency'}.`);
  }

  // How many Bonfire bids are ready (passed the close-window filter).
  const bonfireReady = (data.bonfireContracts || []).length;
  if (bonfireReady > 0) {
    parts.push(`${bonfireReady} Bonfire bid${bonfireReady === 1 ? '' : 's'} flagged ready to pursue (≥${BONFIRE_DIGEST_MIN_CLOSE_DAYS} days to close).`);
  }

  return parts.join(' ');
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
    deepResearchReports,
    todayCounts,
  ] = await Promise.all([
    safe('bonfire',        () => topBonfire(TOP.bonfire), []),
    safe('strategic',      () => topStrategicCluster(TOP.strategicCluster), []),
    safe('gov_contract',   () => topGovContracts(TOP.govContracts), []),
    safe('ai_news',        () => topByType('ai_news', TOP.aiNews), []),
    safe('freelance',      () => topByType('freelance', TOP.freelance), []),
    safe('ai_job',         () => topByType('ai_job', TOP.aiJobs), []),
    safe('investment',     () => topByType('investment', TOP.investments), []),
    safe('grant',          () => topByType('grant', TOP.grants), []),
    safe('research',       () => topByType('research', TOP.research), []),
    safe('ai_tools',       () => topAiTools(TOP.aiTools), []),
    safe('deep_research',  () => topDeepResearchReports(TOP.deepResearch), []),
    safe('today_counts',   () => todayCountsByType(), { byType: {}, total: 0, since: new Date() }),
  ]);

  const envelope = {
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
    deepResearchReports,
    todayCounts,
    generatedAt: new Date(),
    bonfireMinCloseDays: BONFIRE_DIGEST_MIN_CLOSE_DAYS,
  };
  envelope.summaryText = buildSummaryParagraph(envelope);
  return envelope;
}

module.exports = {
  assembleRichDigest,
  TOP,
  BONFIRE_DIGEST_MIN_CLOSE_DAYS,
  buildSummaryParagraph,
  // Exported for tests.
  topByType,
  topBonfire,
  topStrategicCluster,
  topAiTools,
  topDeepResearchReports,
  todayCountsByType,
};
