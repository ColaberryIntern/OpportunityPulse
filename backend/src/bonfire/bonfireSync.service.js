// Sync BonfireOpportunity rows into the unified Opportunity table so they
// appear in the main /opportunities view alongside government contracts,
// AI jobs, freelance, etc.
//
// Why a sync (instead of a UNION query in the controller): the existing
// list/filter/sort/UI plumbing for opportunities is large and well-tested.
// Mirroring rows is cheaper to maintain than dual-pathing every read.
//
// Idempotent: keyed on (source='bonfire', source_id=external_id). Re-runs
// upsert; never duplicate. Bonfire opps without an external_id are skipped
// (the unified table requires source_id NOT NULL).

const logger = require('../logging/logger');
const {
  BonfireOpportunity,
  Opportunity,
} = require('../models');
const { Op } = require('sequelize');

// Map a BonfireOpportunity row to an Opportunity-shaped object.
function shapeForOpportunity(bonfireOpp) {
  if (!bonfireOpp.externalId) return null;
  // value column is DECIMAL(15,2) USD — convert from cents.
  const valueUsd = bonfireOpp.estimatedValue != null
    ? Number(bonfireOpp.estimatedValue) / 100
    : null;
  // Status: derive from close_date.
  let status = 'active';
  if (bonfireOpp.closeDate && new Date(bonfireOpp.closeDate) < new Date()) {
    status = 'expired';
  }
  return {
    type: 'bonfire',
    title: String(bonfireOpp.title).slice(0, 500),
    description: bonfireOpp.overview || bonfireOpp.description || null,
    source: 'bonfire',
    sourceId: bonfireOpp.externalId,
    sourceUrl: bonfireOpp.sourceUrl || null,
    status,
    category: bonfireOpp.aiCategory || null,
    tags: [],
    location: bonfireOpp.agency || null,
    value: valueUsd,
    publishedAt: bonfireOpp.createdAt || null,
    expiresAt: bonfireOpp.closeDate || null,
    aiScore: bonfireOpp.priorityScore != null ? Number(bonfireOpp.priorityScore) : null,
    aiAnalysis: {
      ai_category: bonfireOpp.aiCategory,
      fit_score: bonfireOpp.fitScore,
      automation_potential: bonfireOpp.automationPotential,
      repeatability: bonfireOpp.repeatability,
      ease_of_entry: bonfireOpp.easeOfEntry,
      recommended_product: bonfireOpp.recommendedProduct,
      signals: bonfireOpp.signals || [],
      overview: bonfireOpp.overview,
    },
    sourceData: {
      bonfire_opportunity_id: bonfireOpp.id,
      external_id: bonfireOpp.externalId,
      agency: bonfireOpp.agency,
      enriched_at: bonfireOpp.enrichedAt,
    },
  };
}

// Sync only enriched, biddable bonfire opps (open or just-closed within 14d).
// Returns { processed, upserted, skipped, errors }.
async function syncBonfireToOpportunities({ since } = {}) {
  if (!Opportunity || !BonfireOpportunity) {
    logger.warn('Bonfire sync: required models not available');
    return { processed: 0, upserted: 0, skipped: 0, errors: 0 };
  }

  const cutoff = since instanceof Date
    ? since
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const rows = await BonfireOpportunity.findAll({
    where: {
      // Only enriched rows — that's where the AI scoring is filled in.
      enrichedAt: { [Op.ne]: null },
      // Only rows updated/scraped recently — covers fresh scrapes + re-enriches.
      updatedAt: { [Op.gte]: cutoff },
    },
  });

  let upserted = 0;
  let skipped = 0;
  let errors = 0;
  for (const bonfireOpp of rows) {
    const shaped = shapeForOpportunity(bonfireOpp);
    if (!shaped) { skipped++; continue; }
    try {
      // Upsert keyed on the unique (source, source_id) index already on
      // the opportunities table. The Sequelize upsert() returns [row, created].
      await Opportunity.upsert(shaped, {
        conflictFields: ['source', 'source_id'],
      });
      upserted++;
    } catch (e) {
      errors++;
      logger.warn('Bonfire sync: row upsert failed', {
        sourceId: shaped.sourceId,
        error: e.message,
      });
    }
  }

  logger.info('Bonfire sync complete', {
    processed: rows.length,
    upserted,
    skipped,
    errors,
  });
  return { processed: rows.length, upserted, skipped, errors };
}

module.exports = { syncBonfireToOpportunities, shapeForOpportunity };
