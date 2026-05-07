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
  Opportunity,
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

// Cache freshness: if a strategic opp with the same source_hash exists and
// was synthesized within this many days, reuse it instead of paying for a
// new AI call. 14 days matches the candidate-recency window — a strategy
// generated for a bid that's still fresh in the candidate pool stays valid.
const CACHE_FRESHNESS_DAYS = 14;

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
// Cross-channel trend signals.
//
// Bonfire is the bid surface (the "where do I bid?" data), but a good
// strategic recommendation also reads the broader market: what's getting
// funded, what's being hired for, what news cycles are active. These
// signals don't generate strategic opportunities on their own — they
// JUSTIFY direction. The AI prompt embeds them as "market context" and
// is instructed to cite specific signals when they support a cluster.
// -----------------------------------------------------------------------

const TREND_LOOKBACK_DAYS = 30;
const TREND_PER_CHANNEL = 8; // top-N most recent per channel; small enough to keep prompt cheap

async function loadTrendSignals({ now = new Date() } = {}) {
  if (!Opportunity) {
    return { news: [], talent: [], capital: [], gov: [], dateRange: null };
  }
  const since = new Date(now);
  since.setDate(since.getDate() - TREND_LOOKBACK_DAYS);
  const dateRange = `${since.toISOString().slice(0, 10)}..${now.toISOString().slice(0, 10)}`;

  // One query per channel, ordered by recency + ai_score so the highest-
  // signal rows win the limited prompt budget.
  async function pull(typeFilter, limit) {
    const rows = await Opportunity.findAll({
      where: {
        status: 'active',
        type: { [Op.in]: typeFilter },
        updatedAt: { [Op.gte]: since },
      },
      order: [['aiScore', 'DESC NULLS LAST'], ['updatedAt', 'DESC']],
      limit,
      attributes: ['id', 'type', 'source', 'title', 'category', 'aiScore', 'value', 'updatedAt'],
    }).catch((e) => {
      logger.warn('Strategist: trend pull failed', { types: typeFilter, error: e.message });
      return [];
    });
    return rows.map((r) => (r.toJSON ? r.toJSON() : r));
  }

  const [news, talent, capital, gov] = await Promise.all([
    pull(['ai_news'],     TREND_PER_CHANNEL),
    pull(['ai_job'],      TREND_PER_CHANNEL),
    pull(['investment'],  TREND_PER_CHANNEL),
    pull(['gov_contract', 'grant'], TREND_PER_CHANNEL),
  ]);

  return { news, talent, capital, gov, dateRange };
}

// Pure: render the trend signals as a compact prompt block. Empty
// channels are dropped so the prompt stays tight when a channel has no
// recent activity.
function formatTrendSignals(signals) {
  if (!signals) return '';
  const lines = [];
  function block(label, rows) {
    if (!rows || rows.length === 0) return;
    lines.push(`\n### ${label} (last ${TREND_LOOKBACK_DAYS}d, top ${rows.length})`);
    rows.forEach((r, i) => {
      const t = (r.title || '').slice(0, 110);
      const score = r.aiScore != null ? ` [${Math.round(Number(r.aiScore))}]` : '';
      const cat = r.category ? ` — ${String(r.category).slice(0, 40)}` : '';
      lines.push(`${i + 1}. ${t}${score}${cat}`);
    });
  }
  block('🧠 PRIVATE-SECTOR / NEWS signals', signals.news);
  block('👥 TALENT-DEMAND signals',          signals.talent);
  block('💰 CAPITAL / FUNDING signals',      signals.capital);
  block('🏛 FEDERAL PROCUREMENT signals',    signals.gov);
  if (lines.length === 0) return '';
  return [
    '\n---',
    `MARKET CONTEXT (${signals.dateRange}) — use these as supporting evidence`,
    'when they ALIGN with the cluster you are evaluating. Cite specific items',
    'in business_viability.gtm_strategy or summary when relevant. Do not invent;',
    'only cite signals listed below.',
    ...lines,
    '---\n',
  ].join('\n');
}

// -----------------------------------------------------------------------
// AI synthesis
// -----------------------------------------------------------------------
function buildSystemPrompt() {
  return [
    'You are a strategic-opportunity curator for an AI-systems consultancy.',
    'Your input combines two streams:',
    '  1) BONFIRE BIDS — the procurement opportunities (your primary "where to bid" surface).',
    '  2) MARKET CONTEXT — recent signals from other channels (private-sector news,',
    '     talent demand, capital/funding, federal procurement) that show market direction.',
    '',
    'You produce strategic opportunities that are:',
    '  - cream-of-the-crop (heavy bias toward Bonfire bids that are best-in-class fits)',
    '  - cross-validated (supported by the market context where alignment exists)',
    '  - productizable (admit a single AI system that addresses the cluster)',
    '  - viable (have a real downstream market beyond the original procurement)',
    '',
    'Rules of evidence:',
    '  - The Bonfire bids are the bid surface. Strategic_score reflects HOW',
    '    confident you are that this is a real, fundable, repeatable direction.',
    '  - The market context items below are EVIDENCE. Cite specific items by',
    '    name (e.g., "Anthropic Series E funding signals enterprise-AI demand")',
    '    in business_viability.gtm_strategy or summary when they support the',
    '    cluster. Do NOT cite items that are not relevant. Do NOT invent items.',
    '  - When the market context is empty, you may still produce strategic',
    '    opportunities — the bid evidence stands on its own.',
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
    'real buyer titles, real pricing models. When citing market context,',
    'be specific about which signal supports which claim.',
  ].join('\n');
}

function buildStandaloneUserPrompt(opp, trendSignals = null) {
  const trendBlock = formatTrendSignals(trendSignals);
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
    trendBlock,
  ].join('\n');
}

function buildClusterUserPrompt(cluster, trendSignals = null) {
  const sample = cluster.opps.slice(0, 8);
  const list = sample.map((o, i) => {
    return `${i + 1}. [${o.agency}] ${o.title} — $${(Number(o.estimatedValue) || 0) / 100} (priority ${o.priorityScore})`;
  }).join('\n');
  const totalUsd = Math.round(sumValue(cluster.opps) / 100);
  const trendBlock = formatTrendSignals(trendSignals);
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
    '  also need this kind of system?). Be specific in business_viability.secondary_markets.',
    '- IF the market context below contains items that align with this cluster,',
    '  cite them by name in business_viability.gtm_strategy or summary as',
    '  supporting evidence (e.g. "talent demand for ML engineers up 40% in 2026 RFP",',
    '  "Anthropic Series E shows enterprise-AI spend"). Use them to JUSTIFY direction,',
    '  not to invent product features.',
    trendBlock,
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

async function synthesizeStrategic(targetType, target, { aiClient, runId, generatedForDate, trendSignals = null }) {
  const userPrompt = targetType === 'standalone'
    ? buildStandaloneUserPrompt(target, trendSignals)
    : buildClusterUserPrompt(target, trendSignals);

  let raw;
  try {
    // 800 tokens covers the JSON output comfortably (typical = 400-600).
    // The previous 1200 was wasteful headroom that we paid for every call.
    const response = await aiClient.chat(
      buildSystemPrompt(),
      userPrompt,
      { temperature: 0.3, maxTokens: 800 }
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

  const sourceOpps = targetType === 'standalone' ? [target] : target.opps;
  const sourceIds = sourceOpps.map((o) => o.id);

  return {
    title: String(parsed.title).slice(0, 500),
    summary: String(parsed.summary),
    patternType: targetType,
    sourceOpportunityIds: sourceIds,
    sourceHash: computeSourceHash(sourceOpps),
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

// Compute a content-stable hash of the source set. Two runs that look at the
// same opportunities (same IDs, same enrichment state) produce identical
// hashes — so the second run can short-circuit instead of paying for AI.
// Including enrichmentHash in the input means a re-enriched bid invalidates
// its cached strategy.
function computeSourceHash(opps) {
  const items = opps
    .map((o) => `${o.id}:${o.enrichmentHash || ''}`)
    .sort();
  return crypto.createHash('sha256').update(items.join('|')).digest('hex');
}

// Look up a still-fresh cached strategic opp for this source set.
async function findCachedStrategic(sourceHash) {
  if (!sourceHash) return null;
  const cutoff = new Date(Date.now() - CACHE_FRESHNESS_DAYS * 24 * 60 * 60 * 1000);
  return BonfireStrategicOpportunity.findOne({
    where: {
      sourceHash,
      createdAt: { [Op.gte]: cutoff },
    },
    order: [['createdAt', 'DESC']],
  });
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

  // Load cross-channel trend signals ONCE per run; reuse across all
  // standalone + cluster syntheses. This is the v9.4 enrichment that
  // makes Strategic Patterns the cream of the crop — Bonfire bids stay
  // primary, but the AI gets news/talent/capital/gov context to justify
  // direction. Best-effort: a load failure leaves trendSignals null and
  // the prompt falls back to bid-only mode.
  let trendSignals = null;
  try {
    trendSignals = await loadTrendSignals({ now });
    logger.info('Strategist: cross-channel trend signals loaded', {
      news: (trendSignals.news || []).length,
      talent: (trendSignals.talent || []).length,
      capital: (trendSignals.capital || []).length,
      gov: (trendSignals.gov || []).length,
      dateRange: trendSignals.dateRange,
    });
  } catch (e) {
    logger.warn('Strategist: trend signal load failed, continuing without context', { error: e.message });
  }

  const aiClient = getAIClient();
  const generated = [];
  let rejected = 0;
  let cacheHits = 0;

  // Generate cluster syntheses first (they're higher leverage), then fill
  // remainder with standalones until we hit MIN_OPPS_PER_RUN (or MAX cap).
  const targets = [
    ...clusters.map((c) => ({ type: 'cluster', payload: c })),
    ...standalones.map((s) => ({ type: 'standalone', payload: s })),
  ];

  for (const t of targets) {
    if (generated.length >= MAX_OPPS_PER_RUN) break;

    // Cache check — skip the expensive AI call when source content is unchanged.
    const sourceOpps = t.type === 'standalone' ? [t.payload] : t.payload.opps;
    const sourceHash = computeSourceHash(sourceOpps);
    const cached = await findCachedStrategic(sourceHash);
    if (cached) {
      // Touch updatedAt so the UI can show "still active" for fresh patterns.
      cached.changed('updatedAt', true);
      cached.updatedAt = new Date();
      await cached.save({ silent: false });
      cacheHits += 1;
      // Don't add to `generated` — those are NEW rows we'll bulkCreate below.
      // The cached row is already in the DB and visible in the UI.
      continue;
    }

    const out = await synthesizeStrategic(t.type, t.payload, {
      aiClient, runId, generatedForDate, trendSignals,
    });
    if (out) generated.push(out);
    else rejected += 1;
  }

  if (generated.length === 0 && cacheHits === 0) {
    logger.warn('Strategist: no strategic opportunities passed validation', { rejected });
    return { runId, generated: 0, cacheHits, rejected };
  }

  if (generated.length > 0) {
    await BonfireStrategicOpportunity.bulkCreate(generated);
  }

  logger.info('Strategist: persisted batch', {
    runId,
    count: generated.length,
    cacheHits,
    rejected,
    standaloneCount: generated.filter((g) => g.patternType === 'standalone').length,
    clusterCount: generated.filter((g) => g.patternType === 'cluster').length,
    estimated_cost_usd: (generated.length * 0.05).toFixed(2),
  });

  return {
    runId,
    generated: generated.length,
    cacheHits,
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
  computeSourceHash,
  findCachedStrategic,
  listStrategic,
  getStrategic,
  updateStrategicStatus,
  // v9.4: cross-channel context helpers (exported for tests + future use).
  loadTrendSignals,
  formatTrendSignals,
  buildSystemPrompt,
  buildClusterUserPrompt,
  buildStandaloneUserPrompt,
  TREND_LOOKBACK_DAYS,
  TREND_PER_CHANNEL,
  CANDIDATE_FILTERS,
  STANDALONE_THRESHOLDS,
  CLUSTER_MIN_SIZE,
  CACHE_FRESHNESS_DAYS,
  MIN_OPPS_PER_RUN,
  MAX_OPPS_PER_RUN,
};
