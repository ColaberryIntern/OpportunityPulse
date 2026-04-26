// Strategic Curation Agent.
//
// Job: read recently-scraped Bonfire opportunities (the deterministic raw
// pipeline) and produce a curated batch of strategic opportunities — bids
// or bid-clusters that are good fits AND admit a productizable AI system
// AND have a viable downstream market beyond the original procurement.
//
// Hard contract: every strategic opp MUST have all three pillars filled
// (money, roi, ai_system) plus a business_viability section. If the AI
// returns a row missing any of these, the row is dropped — we don't
// store half-formed strategies.

const crypto = require('crypto');
const { Op } = require('sequelize');
const logger = require('../logging/logger');
const {
  BonfireOpportunity,
  BonfireStrategicOpportunity,
} = require('../models');
const { getAIClient } = require('../analysis/ai.client');

const MIN_OPPS_PER_RUN = 10;
const MAX_OPPS_PER_RUN = 20;

// Candidate filters — we only consider opportunities that have signal.
const CANDIDATE_FILTERS = {
  minPriorityScore: 60,
  minEstimatedValueCents: 25_000_000, // $250k
  recentDays: 14,
};

const STANDALONE_THRESHOLDS = {
  // Promote a single opp to standalone strategic status if it clears either
  // of these — high priority OR high dollar value.
  priorityScore: 80,
  estimatedValueCents: 100_000_000, // $1M
};

const CLUSTER_MIN_SIZE = 3;

// -----------------------------------------------------------------------
// Candidate selection
// -----------------------------------------------------------------------
async function selectCandidates({ now = new Date() } = {}) {
  const since = new Date(now);
  since.setDate(since.getDate() - CANDIDATE_FILTERS.recentDays);

  const candidates = await BonfireOpportunity.findAll({
    where: {
      [Op.and]: [
        // Open opportunities only (close_date in the future or null).
        {
          [Op.or]: [
            { closeDate: { [Op.gte]: now } },
            { closeDate: null },
          ],
        },
        // Has been enriched (so scoring fields are populated).
        { enrichedAt: { [Op.ne]: null } },
        // Updated in the last N days (scrape sync recency).
        { updatedAt: { [Op.gte]: since } },
        // Has at least the priority signal.
        {
          [Op.or]: [
            { priorityScore: { [Op.gte]: CANDIDATE_FILTERS.minPriorityScore } },
            { estimatedValue: { [Op.gte]: CANDIDATE_FILTERS.minEstimatedValueCents } },
          ],
        },
      ],
    },
    order: [['priorityScore', 'DESC'], ['estimatedValue', 'DESC']],
    limit: 200,
  });
  return candidates;
}

// -----------------------------------------------------------------------
// Clustering (simple: by ai_category + value bracket).
// Returns: { standalones: [opp], clusters: [{key, opps[]}] }
// -----------------------------------------------------------------------
function valueBracket(cents) {
  if (cents == null) return 'unknown';
  const usd = cents / 100;
  if (usd < 250_000) return 'sub-250k';
  if (usd < 1_000_000) return '250k-1m';
  if (usd < 5_000_000) return '1m-5m';
  return '5m+';
}

function clusterCandidates(candidates) {
  const standalones = [];
  const groups = new Map();

  for (const opp of candidates) {
    // First pass: if it clears the standalone bar, route as solo.
    const isHighStandalone =
      (opp.priorityScore || 0) >= STANDALONE_THRESHOLDS.priorityScore
      || (Number(opp.estimatedValue) || 0) >= STANDALONE_THRESHOLDS.estimatedValueCents;

    if (isHighStandalone) {
      standalones.push(opp);
      continue;
    }

    // Otherwise group by category × value bracket.
    const key = `${opp.aiCategory || 'Other'}|${valueBracket(opp.estimatedValue)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(opp);
  }

  // Only clusters with >= CLUSTER_MIN_SIZE survive — singles below the
  // standalone bar aren't worth strategizing on their own.
  const clusters = [];
  for (const [key, opps] of groups) {
    if (opps.length >= CLUSTER_MIN_SIZE) {
      clusters.push({ key, opps });
    }
  }

  // Sort: standalones by score desc; clusters by total cluster value desc.
  standalones.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  clusters.sort((a, b) => sumValue(b.opps) - sumValue(a.opps));

  return { standalones, clusters };
}

function sumValue(opps) {
  return opps.reduce((s, o) => s + (Number(o.estimatedValue) || 0), 0);
}

// -----------------------------------------------------------------------
// AI synthesis
// -----------------------------------------------------------------------
function buildSystemPrompt() {
  return [
    'You are a strategic-opportunity curator for an AI-systems consultancy.',
    'You read government-procurement RFPs and decide which ones admit a productizable AI system.',
    '',
    'Hard contract: every output MUST have ALL of:',
    '  money:  { initial_bid_value_usd, cluster_total_usd, addressable_market_usd, confidence }',
    '  roi:    { investment_usd, payback_months, margin_pct, confidence }',
    '  ai_system: { what_to_build, capabilities[], operator_role, build_effort_weeks }',
    '  business_viability: { primary_buyer, secondary_markets[], pricing_model, gtm_strategy, moat }',
    '',
    'If you cannot estimate any of money/roi/ai_system with reasonable confidence,',
    'return JSON {"reject": true, "reason": "..."}. Do NOT fabricate.',
    '',
    'Numbers must be whole-dollar USD integers. Confidence is one of "low", "medium", "high".',
    '',
    'Return JSON ONLY. No markdown, no commentary.',
    '',
    'Schema for accepted strategic opportunity:',
    '{',
    '  "title": "<= 200 chars, names the productizable opportunity, not the RFP",',
    '  "summary": "2-3 paragraphs explaining the opportunity and why it is a fit",',
    '  "strategic_score": 0-100,',
    '  "money": { ... },',
    '  "roi": { ... },',
    '  "ai_system": { ... },',
    '  "business_viability": { ... }',
    '}',
    '',
    'Tone: direct, concrete, no buzzwords. Avoid generic phrasing like',
    '"leverage AI to streamline operations". Be specific: name capabilities,',
    'real buyer titles, real pricing models.',
  ].join('\n');
}

function buildStandaloneUserPrompt(opp) {
  return [
    'STANDALONE OPPORTUNITY — analyze this single high-value bid:',
    '',
    `Title: ${opp.title}`,
    `Agency: ${opp.agency}`,
    `Category: ${opp.aiCategory}`,
    `Recommended Product: ${opp.recommendedProduct || 'none yet'}`,
    `Estimated Value (USD): ${(Number(opp.estimatedValue) || 0) / 100}`,
    `Priority: ${opp.priorityScore}, Automation: ${opp.automationPotential}, Repeatability: ${opp.repeatability}, Fit: ${opp.fitScore}`,
    `Close date: ${opp.closeDate ? new Date(opp.closeDate).toISOString().slice(0, 10) : 'unknown'}`,
    `Overview: ${opp.overview || ''}`,
    `Description: ${(opp.description || '').slice(0, 1500)}`,
    '',
    'For business_viability, name SPECIFIC secondary buyers (e.g.,',
    '"other Texas housing authorities", "school districts in the Sunbelt",',
    '"municipal HR departments in cities >100k population"). Be concrete.',
  ].join('\n');
}

function buildClusterUserPrompt(cluster) {
  const sample = cluster.opps.slice(0, 8);
  const list = sample.map((o, i) => {
    return `${i + 1}. [${o.agency}] ${o.title} — $${(Number(o.estimatedValue) || 0) / 100} (priority ${o.priorityScore})`;
  }).join('\n');
  const totalUsd = Math.round(sumValue(cluster.opps) / 100);
  return [
    'CLUSTER — analyze this group of similar bids and propose a single AI',
    'system that would address all of them as a productized offering:',
    '',
    `Cluster key (category|value-bracket): ${cluster.key}`,
    `Cluster size: ${cluster.opps.length} bids`,
    `Cluster total value: $${totalUsd}`,
    '',
    'Sample bids:',
    list,
    '',
    'For this cluster:',
    '- title: name the AI system / productized service, not any single RFP.',
    '- ai_system.what_to_build: a single tool/system that addresses the cluster.',
    '- money.cluster_total_usd: include all bids in the cluster.',
    '- money.addressable_market_usd: estimate the broader market beyond just',
    '  these specific agencies (think: how many other agencies/orgs nationally',
    `  also need this kind of system?). Be specific in business_viability.secondary_markets.`,
  ].join('\n');
}

function isValidStrategicShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.reject) return false;
  if (!obj.title || !obj.summary) return false;
  const m = obj.money, r = obj.roi, a = obj.ai_system, b = obj.business_viability;
  if (!m || !r || !a || !b) return false;
  if (Number(m.initial_bid_value_usd) <= 0 && Number(m.cluster_total_usd) <= 0) return false;
  if (Number(r.investment_usd) <= 0 || Number(r.payback_months) <= 0) return false;
  if (!a.what_to_build || !Array.isArray(a.capabilities) || a.capabilities.length === 0) return false;
  if (!b.primary_buyer || !Array.isArray(b.secondary_markets) || b.secondary_markets.length === 0) return false;
  return true;
}

async function synthesizeStrategic(targetType, target, { aiClient, runId, generatedForDate }) {
  const userPrompt = targetType === 'standalone'
    ? buildStandaloneUserPrompt(target)
    : buildClusterUserPrompt(target);

  let raw;
  try {
    const response = await aiClient.chat(
      buildSystemPrompt(),
      userPrompt,
      { temperature: 0.3, maxTokens: 1200 }
    );
    raw = response.content;
  } catch (e) {
    logger.error('Strategist AI call failed', { error: e.message, targetType });
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.warn('Strategist AI returned non-JSON', { snippet: String(raw).slice(0, 200) });
    return null;
  }

  if (!isValidStrategicShape(parsed)) {
    logger.info('Strategist rejected output (missing required pillars)', {
      reason: parsed && parsed.reason,
      targetType,
    });
    return null;
  }

  const sourceIds = targetType === 'standalone'
    ? [target.id]
    : target.opps.map((o) => o.id);

  return {
    title: String(parsed.title).slice(0, 500),
    summary: String(parsed.summary),
    patternType: targetType,
    sourceOpportunityIds: sourceIds,
    strategicScore: clamp(Number(parsed.strategic_score), 0, 100),
    money: parsed.money,
    roi: parsed.roi,
    aiSystem: parsed.ai_system,
    businessViability: parsed.business_viability,
    runId,
    generatedForDate,
    aiModel: 'gpt-4o-mini',
    status: 'new',
  };
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// -----------------------------------------------------------------------
// Public: run one curation pass.
// Returns { runId, generated, standaloneCount, clusterCount, rejected }.
// -----------------------------------------------------------------------
async function runStrategist({ now = new Date(), force = false } = {}) {
  const runId = `strat-${now.toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
  const generatedForDate = now.toISOString().slice(0, 10);

  // Idempotency: if a run already produced strategic opps for today, skip
  // unless force=true. Keeps a manual re-trigger from doubling up.
  if (!force) {
    const existing = await BonfireStrategicOpportunity.count({
      where: { generatedForDate },
    });
    if (existing >= MIN_OPPS_PER_RUN) {
      logger.info('Strategist: today already has enough opps, skipping', {
        existing, generatedForDate,
      });
      return { runId, skipped: true, existing };
    }
  }

  const candidates = await selectCandidates({ now });
  if (!candidates.length) {
    logger.warn('Strategist: zero candidates met filters', CANDIDATE_FILTERS);
    return { runId, generated: 0, standaloneCount: 0, clusterCount: 0, rejected: 0 };
  }

  const { standalones, clusters } = clusterCandidates(candidates);
  logger.info('Strategist: candidates split', {
    total: candidates.length,
    standalones: standalones.length,
    clusters: clusters.length,
  });

  const aiClient = getAIClient();
  const generated = [];
  let rejected = 0;

  // Generate cluster syntheses first (they're higher leverage), then fill
  // remainder with standalones until we hit MIN_OPPS_PER_RUN (or MAX cap).
  const targets = [
    ...clusters.map((c) => ({ type: 'cluster', payload: c })),
    ...standalones.map((s) => ({ type: 'standalone', payload: s })),
  ];

  for (const t of targets) {
    if (generated.length >= MAX_OPPS_PER_RUN) break;
    const out = await synthesizeStrategic(t.type, t.payload, {
      aiClient, runId, generatedForDate,
    });
    if (out) generated.push(out);
    else rejected += 1;
    // Soft early exit once we have plenty.
    if (generated.length >= MIN_OPPS_PER_RUN
        && generated.length >= MAX_OPPS_PER_RUN * 0.75) {
      // keep going up to MAX
    }
  }

  if (generated.length === 0) {
    logger.warn('Strategist: no strategic opportunities passed validation', { rejected });
    return { runId, generated: 0, rejected };
  }

  await BonfireStrategicOpportunity.bulkCreate(generated);
  logger.info('Strategist: persisted batch', {
    runId,
    count: generated.length,
    rejected,
    standaloneCount: generated.filter((g) => g.patternType === 'standalone').length,
    clusterCount: generated.filter((g) => g.patternType === 'cluster').length,
  });

  return {
    runId,
    generated: generated.length,
    rejected,
    standaloneCount: generated.filter((g) => g.patternType === 'standalone').length,
    clusterCount: generated.filter((g) => g.patternType === 'cluster').length,
  };
}

// -----------------------------------------------------------------------
// Read APIs (for the controller to call)
// -----------------------------------------------------------------------
async function listStrategic({ limit = 50, offset = 0, status, date } = {}) {
  const where = {};
  if (status) where.status = status;
  if (date) where.generatedForDate = date;
  const { rows, count } = await BonfireStrategicOpportunity.findAndCountAll({
    where,
    order: [['generatedForDate', 'DESC'], ['strategicScore', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
    offset: Number(offset) || 0,
  });
  return { rows, total: count };
}

async function getStrategic(id) {
  return BonfireStrategicOpportunity.findByPk(id);
}

async function updateStrategicStatus(id, { status, notes, assignedTo }) {
  const row = await BonfireStrategicOpportunity.findByPk(id);
  if (!row) return null;
  if (status) row.status = status;
  if (notes != null) row.notes = notes;
  if (assignedTo != null) row.assignedTo = assignedTo;
  await row.save();
  return row;
}

module.exports = {
  runStrategist,
  selectCandidates,
  clusterCandidates,
  isValidStrategicShape,
  listStrategic,
  getStrategic,
  updateStrategicStatus,
  CANDIDATE_FILTERS,
  STANDALONE_THRESHOLDS,
  CLUSTER_MIN_SIZE,
  MIN_OPPS_PER_RUN,
  MAX_OPPS_PER_RUN,
};
