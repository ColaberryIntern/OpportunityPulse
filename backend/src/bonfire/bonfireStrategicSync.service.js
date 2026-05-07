// Sync BonfireStrategicOpportunity rows into the unified Opportunity table
// so strategic clusters appear alongside individual Bonfire opps in
// /admin/opportunities/my, /admin/oied dashboard, recommendations, etc.
//
// Strategic rows are synthesized across multiple individual opps (the
// strategist clusters them by pattern). They are higher-signal than
// any single member opportunity, but the boost is intentionally small
// (+5 priority, capped at 95) so the 118 strategic rows do not crowd
// out the 1,051 individual ones.
//
// Idempotent: keyed on (source='bonfire_strategic', source_id='bonfire-strategic:<uuid>').
// Distinct from the individual Bonfire sync — the source value never
// collides, so re-runs upsert cleanly and never duplicate.

const logger = require('../logging/logger');
const {
  BonfireStrategicOpportunity,
  Opportunity,
} = require('../models');
const { Op } = require('sequelize');

// No boost, hard cap at 75 (strictly below the act_now threshold of 80
// in priorityScoring.service.bucketFor). This keeps strategic rows
// visible (they always surface in the high_value strip when the
// strategist scored them well) without ever crowding the act_now top
// slots — those stay reserved for time-pressured individual opps.
// "Strategically integrated, not overshadowing."
const STRATEGIC_PRIORITY_BOOST = 0;
const STRATEGIC_PRIORITY_CAP = 75;

function deriveBucket(strategicScore) {
  // Match the cap above: strategic rows never enter act_now (>=80) by
  // construction. high_value when scored at the upper end; standard
  // otherwise. Bucket is computed at read time too, so this is the
  // canonical mapping the read path mirrors.
  if (strategicScore == null) return 'standard';
  const s = Number(strategicScore);
  if (s >= 60) return 'high_value';
  return 'standard';
}

function shapeStrategicForOpportunity(strategicOpp) {
  if (!strategicOpp || !strategicOpp.id) return null;
  const data = strategicOpp.toJSON ? strategicOpp.toJSON() : strategicOpp;
  const score = Number(data.strategicScore || 0);
  const fitScore = Math.max(0, Math.min(100, score));
  const priorityScore = Math.min(STRATEGIC_PRIORITY_CAP, Math.max(0, fitScore + STRATEGIC_PRIORITY_BOOST));

  // Pull a USD value from the money jsonb. The strategist writes:
  //   cluster_total_usd       — total $ across all opps in the cluster
  //   initial_bid_value_usd   — the bid we'd actually submit first
  //   addressable_market_usd  — TAM (too aspirational for ranking)
  // Prefer cluster_total_usd as the headline number. Fall back through
  // the other historical field names so older strategist runs still map.
  const money = data.money || {};
  let valueUsd = null;
  const candidates = [
    money.cluster_total_usd,
    money.clusterTotalUsd,
    money.initial_bid_value_usd,
    money.initialBidValueUsd,
    money.total_estimated_value,
    money.totalEstimatedValue,
    money.estimated_value,
  ];
  for (const c of candidates) {
    if (c != null && Number.isFinite(Number(c))) {
      valueUsd = Number(c);
      break;
    }
  }
  // Last resort: cents-encoded fields.
  if (valueUsd == null) {
    const rawCents = money.total_estimated_value_cents
      ?? money.totalEstimatedValueCents
      ?? null;
    if (rawCents != null && Number.isFinite(Number(rawCents))) {
      valueUsd = Number(rawCents) / 100;
    }
  }

  // Category: pattern_type drives this (e.g. 'cluster', 'theme').
  // Use a stable display label so /admin/opportunities/my badges are readable.
  const category = data.patternType
    ? `Strategic ${String(data.patternType).charAt(0).toUpperCase() + String(data.patternType).slice(1)}`
    : 'Strategic Cluster';

  // Title prefix marks these visually so Ali always sees them as
  // strategic-layer rows rather than mistaking them for individual
  // Bonfire opportunities.
  const title = `[Strategic] ${data.title || 'Untitled cluster'}`.slice(0, 500);

  // Strategic clusters do not have a single agency. Don't fake one;
  // location stays null and falls back to the prefixed category.
  return {
    type: 'bonfire_strategic',
    title,
    description: data.summary || null,
    source: 'bonfire_strategic',
    sourceId: `bonfire-strategic:${data.id}`,
    sourceUrl: null,
    status: data.status === 'archived' ? 'expired' : 'active',
    category,
    tags: [],
    location: null,
    value: valueUsd,
    publishedAt: data.createdAt || null,
    expiresAt: null,
    aiScore: priorityScore,
    aiAnalysis: {
      ai_category: category,
      fit_score: fitScore,
      strategic_score: score,
      pattern_type: data.patternType || null,
      ai_system: data.aiSystem || null,
      roi: data.roi || null,
      business_viability: data.businessViability || null,
      money: data.money || null,
      source_opportunity_count: Array.isArray(data.sourceOpportunityIds)
        ? data.sourceOpportunityIds.length
        : 0,
      bucket: deriveBucket(score),
    },
    sourceData: {
      bonfire_strategic_opportunity_id: data.id,
      run_id: data.runId || null,
      generated_for_date: data.generatedForDate || null,
      pattern_type: data.patternType || null,
      source_opportunity_ids: data.sourceOpportunityIds || [],
      ai_model: data.aiModel || null,
    },
  };
}

// Sync strategic rows that are not archived. No date cutoff — the
// strategist regenerates daily anyway and dedupes via source_hash.
// Returns { processed, upserted, skipped, errors }.
async function syncStrategicBonfireToOpportunities() {
  if (!Opportunity || !BonfireStrategicOpportunity) {
    logger.warn('Bonfire strategic sync: required models not available');
    return { processed: 0, upserted: 0, skipped: 0, errors: 0 };
  }

  const rows = await BonfireStrategicOpportunity.findAll({
    where: {
      status: { [Op.ne]: 'archived' },
    },
  });

  let upserted = 0;
  let skipped = 0;
  let errors = 0;
  for (const row of rows) {
    const shaped = shapeStrategicForOpportunity(row);
    if (!shaped) { skipped++; continue; }
    try {
      await Opportunity.upsert(shaped, {
        conflictFields: ['source', 'source_id'],
      });
      upserted++;
    } catch (e) {
      errors++;
      logger.warn('Bonfire strategic sync: row upsert failed', {
        sourceId: shaped.sourceId,
        error: e.message,
      });
    }
  }

  logger.info('Bonfire strategic sync complete', {
    processed: rows.length,
    upserted,
    skipped,
    errors,
  });
  return { processed: rows.length, upserted, skipped, errors };
}

module.exports = {
  syncStrategicBonfireToOpportunities,
  shapeStrategicForOpportunity,
  deriveBucket,
  STRATEGIC_PRIORITY_BOOST,
  STRATEGIC_PRIORITY_CAP,
};
