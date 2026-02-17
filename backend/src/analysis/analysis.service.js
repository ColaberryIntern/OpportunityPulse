const { Op, fn, col, literal } = require('sequelize');
const { Opportunity, AnalysisRun, Alert, User } = require('../models');
const { getAIClient } = require('./ai.client');
const prompts = require('./prompts');
const logger = require('../logging/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

const VALID_TYPES = ['gov_contract', 'ai_job', 'investment'];
const BATCH_SIZE = 20;

/**
 * Score unscored opportunities of a given type using OpenAI.
 */
async function scoreOpportunities(type) {
  if (!VALID_TYPES.includes(type)) {
    throw new AppError(`Invalid opportunity type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  // Create analysis run record
  const run = await AnalysisRun.create({
    type: 'scoring',
    status: 'running',
    opportunityType: type,
    startedAt: new Date(),
  });

  try {
    // Fetch unscored opportunities
    const opportunities = await Opportunity.findAll({
      where: {
        type,
        aiScore: { [Op.is]: null },
        status: 'active',
      },
      order: [['published_at', 'DESC']],
      limit: BATCH_SIZE,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No unscored opportunities found.' },
        completedAt: new Date(),
      });
      return run;
    }

    // Call OpenAI
    const aiClient = getAIClient();
    const userPrompt = prompts.buildScoringUserPrompt(opportunities);
    const { content, tokensUsed } = await aiClient.chat(
      prompts.SCORING_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 3000 }
    );

    // Parse response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      throw new Error(`Failed to parse AI response: ${parseErr.message}`);
    }

    if (!parsed.scores || !Array.isArray(parsed.scores)) {
      throw new Error('AI response missing "scores" array.');
    }

    // Update opportunities with scores
    let successCount = 0;
    const errors = [];
    const highScoreAlerts = [];

    for (const scoreItem of parsed.scores) {
      try {
        const opp = opportunities.find((o) => o.id === scoreItem.id);
        if (!opp) continue;

        const score = Math.min(100, Math.max(0, Math.round(scoreItem.score)));
        await opp.update({
          aiScore: score,
          aiAnalysis: {
            score,
            reasoning: scoreItem.reasoning || '',
            highlights: scoreItem.highlights || [],
            scoredAt: new Date().toISOString(),
          },
        });
        successCount++;

        // Track high-score opportunities for alerts
        if (score >= 80) {
          highScoreAlerts.push({ opportunity: opp, score, reasoning: scoreItem.reasoning });
        }
      } catch (updateErr) {
        errors.push({ opportunityId: scoreItem.id, error: updateErr.message });
      }
    }

    // Create alerts for high-score opportunities
    if (highScoreAlerts.length > 0) {
      await createHighScoreAlerts(highScoreAlerts);
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: opportunities.length,
      outputCount: successCount,
      results: { scoredCount: successCount, highScoreCount: highScoreAlerts.length },
      errors: errors.length > 0 ? errors : [],
      tokensUsed,
      completedAt: new Date(),
    });

    return run;
  } catch (error) {
    logger.error('Scoring failed', { type, error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw new AppError(`Scoring failed: ${error.message}`, 500);
  }
}

/**
 * Detect trends for a given opportunity type.
 */
async function detectTrends(type) {
  if (!VALID_TYPES.includes(type)) {
    throw new AppError(`Invalid opportunity type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  const run = await AnalysisRun.create({
    type: 'trend_detection',
    status: 'running',
    opportunityType: type,
    startedAt: new Date(),
  });

  try {
    // Compute weekly aggregations
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    // Get opportunities from last 4 weeks
    const recentOpps = await Opportunity.findAll({
      where: {
        type,
        createdAt: { [Op.gte]: fourWeeksAgo },
      },
      attributes: ['id', 'category', 'value', 'status', 'aiScore', 'createdAt', 'tags'],
      order: [['created_at', 'DESC']],
      raw: true,
    });

    if (recentOpps.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No recent opportunities for trend analysis.', trends: [] },
        completedAt: new Date(),
      });
      return run;
    }

    // Build weekly aggregations
    const aggregations = buildWeeklyAggregations(recentOpps);

    // Call OpenAI for trend analysis
    const aiClient = getAIClient();
    const userPrompt = prompts.buildTrendUserPrompt(aggregations, type);
    const { content, tokensUsed } = await aiClient.chat(
      prompts.TREND_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 2000 }
    );

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      throw new Error(`Failed to parse AI trend response: ${parseErr.message}`);
    }

    await run.update({
      status: 'success',
      inputCount: recentOpps.length,
      outputCount: parsed.trends ? parsed.trends.length : 0,
      results: parsed,
      tokensUsed,
      completedAt: new Date(),
    });

    return run;
  } catch (error) {
    logger.error('Trend detection failed', { type, error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw new AppError(`Trend detection failed: ${error.message}`, 500);
  }
}

/**
 * Generate a weekly insight report combining scores, trends, and top opportunities.
 */
async function generateInsights() {
  const run = await AnalysisRun.create({
    type: 'insight_generation',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // Get latest scoring summary
    const scoredCount = await Opportunity.count({ where: { aiScore: { [Op.ne]: null } } });
    const avgScore = await Opportunity.findOne({
      attributes: [[fn('AVG', col('ai_score')), 'avgScore']],
      where: { aiScore: { [Op.ne]: null } },
      raw: true,
    });

    const scoringSummary = {
      totalScored: scoredCount,
      averageScore: avgScore?.avgScore ? parseFloat(parseFloat(avgScore.avgScore).toFixed(1)) : 0,
    };

    // Get latest trend runs
    const latestTrends = await AnalysisRun.findAll({
      where: { type: 'trend_detection', status: 'success' },
      order: [['started_at', 'DESC']],
      limit: 3,
    });

    const trends = latestTrends.map((t) => ({
      type: t.opportunityType,
      results: t.results,
    }));

    // Get top-scoring opportunities
    const topOpps = await Opportunity.findAll({
      where: { aiScore: { [Op.ne]: null }, status: 'active' },
      order: [['ai_score', 'DESC']],
      limit: 10,
      attributes: ['id', 'type', 'title', 'aiScore', 'category', 'value'],
    });

    const inputCount = scoredCount + latestTrends.length + topOpps.length;

    if (inputCount === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No data available for insight generation.' },
        completedAt: new Date(),
      });
      return run;
    }

    // Call OpenAI
    const aiClient = getAIClient();
    const userPrompt = prompts.buildInsightUserPrompt(scoringSummary, trends, topOpps);
    const { content, tokensUsed } = await aiClient.chat(
      prompts.INSIGHT_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 3000 }
    );

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      throw new Error(`Failed to parse AI insight response: ${parseErr.message}`);
    }

    await run.update({
      status: 'success',
      inputCount,
      outputCount: 1,
      results: parsed,
      tokensUsed,
      completedAt: new Date(),
    });

    return run;
  } catch (error) {
    logger.error('Insight generation failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw new AppError(`Insight generation failed: ${error.message}`, 500);
  }
}

/**
 * Get the latest insights from analysis runs.
 */
async function getLatestInsights() {
  const run = await AnalysisRun.findOne({
    where: { type: 'insight_generation', status: 'success' },
    order: [['started_at', 'DESC']],
  });

  return run;
}

/**
 * Get the latest trends for a specific type.
 */
async function getLatestTrends(type) {
  if (!VALID_TYPES.includes(type)) {
    throw new AppError(`Invalid opportunity type: ${type}`, 400);
  }

  const run = await AnalysisRun.findOne({
    where: { type: 'trend_detection', status: 'success', opportunityType: type },
    order: [['started_at', 'DESC']],
  });

  return run;
}

// --- Helpers ---

function buildWeeklyAggregations(opportunities) {
  const weeks = {};
  const now = new Date();

  opportunities.forEach((opp) => {
    const created = new Date(opp.createdAt);
    const weekNumber = Math.floor((now - created) / (7 * 24 * 60 * 60 * 1000));
    const weekKey = `week_${weekNumber}`;

    if (!weeks[weekKey]) {
      weeks[weekKey] = { count: 0, categories: {}, totalValue: 0, avgScore: null, scores: [] };
    }

    weeks[weekKey].count++;
    const cat = opp.category || 'uncategorized';
    weeks[weekKey].categories[cat] = (weeks[weekKey].categories[cat] || 0) + 1;
    if (opp.value) weeks[weekKey].totalValue += parseFloat(opp.value);
    if (opp.aiScore) weeks[weekKey].scores.push(opp.aiScore);
  });

  // Compute average scores
  Object.values(weeks).forEach((week) => {
    if (week.scores.length > 0) {
      week.avgScore = parseFloat((week.scores.reduce((a, b) => a + b, 0) / week.scores.length).toFixed(1));
    }
    delete week.scores;
  });

  return weeks;
}

async function createHighScoreAlerts(highScoreItems) {
  try {
    // Get all users to notify (for now, notify all users)
    const users = await User.findAll({ attributes: ['id'] });

    const alertRecords = [];
    for (const { opportunity, score, reasoning } of highScoreItems) {
      for (const user of users) {
        alertRecords.push({
          userId: user.id,
          type: 'new_opportunity',
          title: `High-score opportunity: ${opportunity.title}`,
          message: reasoning || `Scored ${score}/100 — worth reviewing.`,
          opportunityId: opportunity.id,
          severity: score >= 90 ? 'important' : 'info',
          metadata: { score, type: opportunity.type },
        });
      }
    }

    if (alertRecords.length > 0) {
      await Alert.bulkCreate(alertRecords);
      logger.info(`Created ${alertRecords.length} high-score alerts`);
    }
  } catch (error) {
    logger.error('Failed to create high-score alerts', { error: error.message });
    // Don't throw — alert creation failure shouldn't fail the scoring
  }
}

module.exports = {
  scoreOpportunities,
  detectTrends,
  generateInsights,
  getLatestInsights,
  getLatestTrends,
  AppError,
};
