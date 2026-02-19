const { Op } = require('sequelize');
const { Opportunity, AnalysisRun, MaturityPhase, OpportunityClassification } = require('../models');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;

/**
 * Classify opportunities by maturity phase using keyword-based phase detection.
 */
async function classifyMaturityPhases({ batchSize = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'maturity_phase',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const phases = await MaturityPhase.findAll();

    const classified = await OpportunityClassification.findAll({
      where: { maturityPhaseId: { [Op.not]: null } },
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
        const scores = scoreMaturityPhases(opp, phases);
        if (scores.length === 0) continue;

        const primary = scores[0];

        const [classification] = await OpportunityClassification.findOrCreate({
          where: { opportunityId: opp.id },
          defaults: {
            opportunityId: opp.id,
            maturityPhaseId: primary.phaseId,
            classifiedAt: new Date(),
          },
        });

        if (classification.maturityPhaseId !== primary.phaseId) {
          await classification.update({ maturityPhaseId: primary.phaseId });
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

    logger.info('Maturity phase classification complete', {
      input: opportunities.length, classified: successCount, errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Maturity phase classification failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

/**
 * Score maturity phases for a single opportunity.
 */
function scoreMaturityPhases(opp, phases) {
  const title = (opp.title || '').toLowerCase();
  const desc = (opp.description || '').toLowerCase();
  const tags = (opp.tags || []).map((t) => t.toLowerCase());

  // Type-based boost: jobs → hiring_expansion, gov contracts → procurement_phase
  const typeBoosts = {
    ai_job: 'hiring_expansion',
    gov_contract: 'procurement_phase',
    grant: 'research_phase',
  };

  const results = [];

  for (const phase of phases) {
    let score = 0;
    const keywords = (phase.keywords || []).map((k) => k.toLowerCase());

    for (const kw of keywords) {
      if (title.includes(kw)) score += 12;
      if (desc.includes(kw)) score += 5;
      if (tags.some((t) => t.includes(kw))) score += 7;
    }

    // Type-based boost
    if (typeBoosts[opp.type] === phase.slug) score += 8;

    if (score > 0) {
      results.push({ phaseId: phase.id, slug: phase.slug, score: Math.min(100, score) });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

module.exports = { classifyMaturityPhases, scoreMaturityPhases };
