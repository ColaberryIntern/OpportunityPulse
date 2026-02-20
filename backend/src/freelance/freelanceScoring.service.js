const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { FREELANCE_SCORING_WEIGHTS } = require('../config/constants');
const logger = require('../logging/logger');

const BATCH_SIZE = 100;
const STALE_DAYS = 7;

/**
 * Score a budget value on a 0-1 scale.
 * 0 if < $500, linear 0-1 for $500-$20k, 1 if > $20k.
 */
function scoreBudget(value) {
  const budget = parseFloat(value) || 0;
  if (budget < 500) return 0;
  if (budget >= 20000) return 1;
  return (budget - 500) / (20000 - 500);
}

/**
 * Score client reliability from rating and review count.
 * Rating/5 * 0.7 + min(reviews/50, 1) * 0.3
 */
function scoreClientReliability(sourceData) {
  const rating = parseFloat(sourceData?.clientRating || sourceData?.client_rating) || 0;
  const reviews = parseInt(sourceData?.clientReviews || sourceData?.client_reviews, 10) || 0;

  const ratingScore = Math.min(rating / 5, 1);
  const reviewScore = Math.min(reviews / 50, 1);

  return ratingScore * 0.7 + reviewScore * 0.3;
}

/**
 * Score competition level inversely.
 * 1 if < 5 proposals, linear 1→0 for 5-50, 0 if > 50.
 */
function scoreLowCompetition(sourceData) {
  const proposals = parseInt(
    sourceData?.proposals || sourceData?.bid_count || 0,
    10
  );

  if (proposals < 5) return 1;
  if (proposals >= 50) return 0;
  return 1 - (proposals - 5) / (50 - 5);
}

/**
 * Score recurring potential from project type.
 */
function scoreRecurringPotential(aiAnalysis) {
  const projectType = aiAnalysis?.projectType;
  switch (projectType) {
    case 'retainer': return 1.0;
    case 'ongoing': return 0.8;
    case 'product-build': return 0.6;
    case 'one-off': return 0.2;
    default: return 0.3;
  }
}

/**
 * Score SaaS conversion potential (0-100 from AI → 0-1).
 */
function scoreSaasConversion(aiAnalysis) {
  const potential = parseFloat(aiAnalysis?.saasConversionPotential) || 0;
  return Math.min(potential / 100, 1);
}

/**
 * Score strategic alignment via Jaccard similarity of skills.
 * If no user preferences are available, returns a neutral 0.5.
 */
function scoreStrategicAlignment(aiAnalysis, userPreferences) {
  if (!userPreferences?.preferredSkills?.length) return 0.5;

  const oppSkills = new Set((aiAnalysis?.skills || []).map((s) => s.toLowerCase()));
  const userSkills = new Set(userPreferences.preferredSkills.map((s) => s.toLowerCase()));

  if (oppSkills.size === 0) return 0.3;

  const intersection = [...oppSkills].filter((s) => userSkills.has(s)).length;
  const union = new Set([...oppSkills, ...userSkills]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Compute the composite freelance score for a single opportunity.
 * Returns a value 0-100.
 */
function computeFreelanceScore(opportunity, userPreferences = null) {
  const sourceData = opportunity.sourceData || {};
  const aiAnalysis = opportunity.aiAnalysis || {};
  const value = opportunity.value || sourceData.budget || sourceData.budget_maximum || 0;

  const components = {
    budget: scoreBudget(value),
    clientReliability: scoreClientReliability(sourceData),
    lowCompetition: scoreLowCompetition(sourceData),
    recurringPotential: scoreRecurringPotential(aiAnalysis),
    saasConversion: scoreSaasConversion(aiAnalysis),
    strategicAlignment: scoreStrategicAlignment(aiAnalysis, userPreferences),
  };

  const weights = FREELANCE_SCORING_WEIGHTS;
  const composite =
    components.budget * weights.BUDGET +
    components.clientReliability * weights.CLIENT_RELIABILITY +
    components.lowCompetition * weights.LOW_COMPETITION +
    components.recurringPotential * weights.RECURRING_POTENTIAL +
    components.saasConversion * weights.SAAS_CONVERSION +
    components.strategicAlignment * weights.STRATEGIC_ALIGNMENT;

  return {
    score: Math.round(composite * 100),
    components,
  };
}

/**
 * Score all unscored or stale freelance opportunities.
 */
async function scoreFreelanceOpportunities() {
  const run = await AnalysisRun.create({
    type: 'freelance_scoring',
    status: 'running',
    opportunityType: 'freelance',
    startedAt: new Date(),
  });

  try {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - STALE_DAYS);

    const opportunities = await Opportunity.findAll({
      where: {
        type: 'freelance',
        status: 'active',
        [Op.or]: [
          { aiScore: { [Op.is]: null } },
          { updatedAt: { [Op.lt]: staleDate } },
        ],
      },
      order: [['created_at', 'DESC']],
      limit: BATCH_SIZE,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No unscored freelance opportunities found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let successCount = 0;
    const errors = [];

    for (const opp of opportunities) {
      try {
        const { score, components } = computeFreelanceScore(opp);
        const existingAnalysis = opp.aiAnalysis || {};

        await opp.update({
          aiScore: score,
          aiAnalysis: {
            ...existingAnalysis,
            freelanceScore: {
              score,
              components,
              scoredAt: new Date().toISOString(),
              weights: FREELANCE_SCORING_WEIGHTS,
            },
          },
        });
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
      results: { scoredCount: successCount },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('Freelance scoring complete', {
      input: opportunities.length,
      scored: successCount,
      errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Freelance scoring failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

module.exports = {
  computeFreelanceScore,
  scoreFreelanceOpportunities,
  scoreBudget,
  scoreClientReliability,
  scoreLowCompetition,
  scoreRecurringPotential,
  scoreSaasConversion,
  scoreStrategicAlignment,
};
