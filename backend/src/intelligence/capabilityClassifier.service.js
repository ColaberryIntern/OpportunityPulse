const { Op } = require('sequelize');
const { Opportunity, AnalysisRun, AiCapability, OpportunityClassification, OpportunityMultiTag } = require('../models');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;

/**
 * Classify opportunities by AI capability stack using weighted keyword matching.
 * Primary capability → opportunity_classifications.capability_id
 * Secondary capabilities → opportunity_multi_tags
 */
async function classifyCapabilities({ batchSize = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'capability_classification',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const capabilities = await AiCapability.findAll();

    // Find opportunities not yet classified by capability
    const classified = await OpportunityClassification.findAll({
      where: { capabilityId: { [Op.not]: null } },
      attributes: ['opportunityId'],
    });
    const classifiedIds = new Set(classified.map((c) => c.opportunityId));

    const opportunities = await Opportunity.findAll({
      where: {
        status: 'active',
        id: { [Op.notIn]: [...classifiedIds].slice(0, 10000) },
      },
      order: [['published_at', 'DESC']],
      limit: batchSize,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success', inputCount: 0, outputCount: 0,
        results: { message: 'No unclassified opportunities found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let successCount = 0;
    const errors = [];

    for (const opp of opportunities) {
      try {
        const scores = scoreCapabilities(opp, capabilities);
        if (scores.length === 0) continue;

        const primary = scores[0];
        const secondary = scores.filter((s, i) => i > 0 && s.score >= 5);

        // Upsert classification
        const [classification] = await OpportunityClassification.findOrCreate({
          where: { opportunityId: opp.id },
          defaults: {
            opportunityId: opp.id,
            capabilityId: primary.capabilityId,
            capabilityConfidence: primary.score,
            classifiedAt: new Date(),
          },
        });

        if (classification.capabilityId !== primary.capabilityId) {
          await classification.update({
            capabilityId: primary.capabilityId,
            capabilityConfidence: primary.score,
          });
        }

        // Store secondary capabilities
        for (const sec of secondary) {
          await OpportunityMultiTag.findOrCreate({
            where: {
              opportunityId: opp.id,
              dimension: 'capability',
              dimensionValueId: sec.capabilityId,
            },
            defaults: { confidence: sec.score },
          });
        }

        successCount++;
      } catch (err) {
        errors.push({ opportunityId: opp.id, error: err.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: opportunities.length,
      outputCount: successCount,
      results: { classifiedCount: successCount },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('Capability classification batch complete', {
      input: opportunities.length, classified: successCount, errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Capability classification failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

/**
 * Score all capabilities for a single opportunity.
 * Uses weighted keyword graph: primary keywords (1.0), title match bonus (+0.3).
 */
function scoreCapabilities(opp, capabilities) {
  const title = (opp.title || '').toLowerCase();
  const desc = (opp.description || '').toLowerCase();
  const tags = (opp.tags || []).map((t) => t.toLowerCase());

  const results = [];

  for (const cap of capabilities) {
    let score = 0;
    const keywords = (cap.keywords || []).map((k) => k.toLowerCase());

    // Title matches (strong signal — weight 1.3x)
    for (const kw of keywords) {
      if (title.includes(kw)) score += 13;
    }

    // Description matches (base weight 1.0x)
    for (const kw of keywords) {
      if (desc.includes(kw)) score += 5;
    }

    // Tag overlap (weight 1.0x)
    for (const kw of keywords) {
      if (tags.some((t) => t.includes(kw))) score += 8;
    }

    if (score > 0) {
      results.push({ capabilityId: cap.id, slug: cap.slug, score: Math.min(100, score) });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

module.exports = { classifyCapabilities, scoreCapabilities };
