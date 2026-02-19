const { Op } = require('sequelize');
const { Opportunity, AnalysisRun, StrategicIntent, OpportunityClassification, sequelize } = require('../models');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;

/**
 * Classify opportunities by strategic intent using market signal heuristics.
 * Evaluates hiring velocity, funding trends, procurement patterns, and keyword signals.
 */
async function classifyStrategicIntents({ batchSize = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'strategic_intent',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const intents = await StrategicIntent.findAll();

    // Find opportunities not yet classified by strategic intent
    const classified = await OpportunityClassification.findAll({
      where: { strategicIntentId: { [Op.not]: null } },
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

    // Pre-compute context signals: recent counts by category/type
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recentCounts] = await sequelize.query(`
      SELECT type, category, COUNT(*) as cnt, AVG(CAST(ai_score AS FLOAT)) as avg_score
      FROM opportunities
      WHERE status = 'active' AND published_at > :since
      GROUP BY type, category
    `, { replacements: { since: thirtyDaysAgo } });

    const categoryHeatMap = {};
    for (const row of recentCounts) {
      const key = `${row.type}:${row.category || 'unknown'}`;
      categoryHeatMap[key] = { count: parseInt(row.cnt, 10), avgScore: parseFloat(row.avg_score) || 0 };
    }

    let successCount = 0;
    const errors = [];

    for (const opp of opportunities) {
      try {
        const scores = scoreIntents(opp, intents, categoryHeatMap);
        if (scores.length === 0) continue;

        const primary = scores[0];

        const [classification] = await OpportunityClassification.findOrCreate({
          where: { opportunityId: opp.id },
          defaults: {
            opportunityId: opp.id,
            strategicIntentId: primary.intentId,
            classifiedAt: new Date(),
          },
        });

        if (classification.strategicIntentId !== primary.intentId) {
          await classification.update({ strategicIntentId: primary.intentId });
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

    logger.info('Strategic intent classification complete', {
      input: opportunities.length, classified: successCount, errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Strategic intent classification failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

/**
 * Score intents for a single opportunity.
 */
function scoreIntents(opp, intents, categoryHeatMap) {
  const title = (opp.title || '').toLowerCase();
  const desc = (opp.description || '').toLowerCase();
  const tags = (opp.tags || []).map((t) => t.toLowerCase());
  const heatKey = `${opp.type}:${opp.category || 'unknown'}`;
  const heat = categoryHeatMap[heatKey] || { count: 0, avgScore: 0 };

  const results = [];

  for (const intent of intents) {
    let score = 0;
    const keywords = (intent.keywords || []).map((k) => k.toLowerCase());
    const weight = parseFloat(intent.weight) || 1.0;

    // Keyword matching
    for (const kw of keywords) {
      if (title.includes(kw)) score += 12;
      if (desc.includes(kw)) score += 5;
      if (tags.some((t) => t.includes(kw))) score += 7;
    }

    // Signal-type boosting based on opportunity type
    if (intent.signalType === 'hiring' && opp.type === 'ai_job') score += 10;
    if (intent.signalType === 'funding' && (opp.type === 'investment' || opp.type === 'grant')) score += 10;
    if (intent.signalType === 'policy' && opp.type === 'ai_news') score += 8;

    // Category heat: if many recent opportunities in same category, boost "emerging demand"
    if (intent.slug === 'emerging_demand' && heat.count > 10) score += 8;
    if (intent.slug === 'hiring_velocity_spike' && opp.type === 'ai_job' && heat.count > 15) score += 10;
    if (intent.slug === 'funding_surge' && opp.type === 'investment' && heat.count > 5) score += 8;

    // Value-based signals
    const value = parseFloat(opp.value) || 0;
    if (intent.slug === 'budget_allocation_shift' && opp.type === 'gov_contract' && value > 100000) score += 10;
    if (intent.slug === 'infrastructure_buildout' && value > 500000) score += 8;

    score = Math.round(score * weight);

    if (score > 0) {
      results.push({ intentId: intent.id, slug: intent.slug, score: Math.min(100, score) });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

module.exports = { classifyStrategicIntents, scoreIntents };
