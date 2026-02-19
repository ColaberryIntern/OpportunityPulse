const { Op } = require('sequelize');
const { Opportunity, AnalysisRun, MonetizationAngle, OpportunityClassification } = require('../models');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;

/**
 * Classify opportunities by monetization angle using deterministic logic tree.
 * Cross-references opportunity type, value, action type, and keyword signals.
 */
async function classifyMonetizationAngles({ batchSize = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'monetization_angle',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const angles = await MonetizationAngle.findAll();
    const angleMap = new Map(angles.map((a) => [a.slug, a]));

    // Find opportunities not yet classified by monetization angle
    const classified = await OpportunityClassification.findAll({
      where: { monetizationAngleId: { [Op.not]: null } },
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
        const result = determineMonetizationAngle(opp, angleMap);
        if (!result) continue;

        const [classification] = await OpportunityClassification.findOrCreate({
          where: { opportunityId: opp.id },
          defaults: {
            opportunityId: opp.id,
            monetizationAngleId: result.angleId,
            classifiedAt: new Date(),
          },
        });

        if (classification.monetizationAngleId !== result.angleId) {
          await classification.update({ monetizationAngleId: result.angleId });
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

    logger.info('Monetization angle classification complete', {
      input: opportunities.length, classified: successCount, errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Monetization angle classification failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

/**
 * Deterministic logic tree to determine monetization angle.
 * Returns { angleId, slug } or null.
 */
function determineMonetizationAngle(opp, angleMap) {
  const type = opp.type;
  const actionType = opp.actionType;
  const value = parseFloat(opp.value) || 0;
  const title = (opp.title || '').toLowerCase();
  const desc = (opp.description || '').toLowerCase();
  const tags = (opp.tags || []).map((t) => t.toLowerCase());
  const combined = `${title} ${desc}`;

  let slug = null;

  // Gov contract logic
  if (type === 'gov_contract') {
    if (value >= 50000) {
      slug = 'biddable_contract';
    } else if (combined.includes('small business') || combined.includes('sbir') || combined.includes('sttr')) {
      slug = 'grant_fundable';
    } else {
      slug = 'biddable_contract';
    }
  }

  // Grant logic
  else if (type === 'grant') {
    slug = 'grant_fundable';
  }

  // Investment logic
  else if (type === 'investment') {
    if (value >= 100000 && (combined.includes('enterprise') || combined.includes('platform'))) {
      slug = 'enterprise_services';
    } else if (combined.includes('data') && combined.includes('infrastructure')) {
      slug = 'data_infrastructure';
    } else {
      slug = 'buildable_business';
    }
  }

  // AI job logic
  else if (type === 'ai_job') {
    if (combined.includes('training') || combined.includes('curriculum') || combined.includes('instructor') || combined.includes('teaching')) {
      slug = 'curriculum_opportunity';
    } else if (actionType === 'PARTNER' || combined.includes('partnership') || combined.includes('collaboration')) {
      slug = 'partnership_target';
    } else if (combined.includes('consultant') || combined.includes('advisory')) {
      slug = 'enterprise_services';
    } else {
      slug = 'buildable_business';
    }
  }

  // AI news logic
  else if (type === 'ai_news') {
    if (combined.includes('tool') || combined.includes('api') || combined.includes('plugin') || combined.includes('saas')) {
      slug = 'micro_saas';
    } else if (combined.includes('platform') || combined.includes('startup') || combined.includes('launch')) {
      slug = 'buildable_business';
    } else if (combined.includes('partner') || combined.includes('collaboration')) {
      slug = 'partnership_target';
    }
  }

  // Align with existing actionType if available
  if (!slug && actionType) {
    if (actionType === 'BID') slug = 'biddable_contract';
    else if (actionType === 'BUILD') slug = 'buildable_business';
    else if (actionType === 'TEACH') slug = 'curriculum_opportunity';
    else if (actionType === 'PARTNER') slug = 'partnership_target';
    else if (actionType === 'INVEST') slug = 'buildable_business';
  }

  if (!slug) return null;

  const angle = angleMap.get(slug);
  if (!angle) return null;

  return { angleId: angle.id, slug };
}

module.exports = { classifyMonetizationAngles, determineMonetizationAngle };
