const { Op, fn, col, literal } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const { buildExecutiveBriefPrompt } = require('./actionEngine.prompts');
const logger = require('../logging/logger');

const BRIEF_CACHE_HOURS = 4;

/**
 * Get the executive brief, using cache if fresh enough.
 */
async function getExecutiveBrief({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cutoff = new Date(Date.now() - BRIEF_CACHE_HOURS * 60 * 60 * 1000);
    const cached = await AnalysisRun.findOne({
      where: {
        type: 'executive_brief',
        status: 'success',
        completedAt: { [Op.gte]: cutoff },
      },
      order: [['completed_at', 'DESC']],
    });

    if (cached) {
      return cached.results;
    }
  }

  return generateExecutiveBrief();
}

/**
 * Generate a fresh executive brief.
 * Queries top opportunities, trend data, and calls OpenAI for synthesis.
 */
async function generateExecutiveBrief() {
  const run = await AnalysisRun.create({
    type: 'executive_brief',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // Query top opportunities with composite scoring
    const topOpportunities = await Opportunity.findAll({
      where: {
        status: 'active',
        actionType: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: 'IGNORE' }] },
      },
      order: [
        ['ai_score', 'DESC NULLS LAST'],
        ['saturation_index', 'ASC NULLS LAST'],
        ['published_at', 'DESC'],
      ],
      limit: 30,
      attributes: [
        'id', 'type', 'title', 'description', 'actionType', 'aiScore',
        'saturationIndex', 'opportunityQuadrant', 'value', 'location',
        'publishedAt', 'expiresAt', 'category', 'tags', 'sourceUrl', 'aiAnalysis',
      ],
    });

    if (topOpportunities.length === 0) {
      const emptyBrief = {
        briefDate: new Date().toISOString(),
        headline: 'No classified opportunities available yet',
        executiveSummary: 'Run the classification engine to populate the executive brief.',
        topOpportunities: [],
        recommendedActions: [],
        marketPulse: 'Awaiting data.',
        riskFlags: [],
        trendSignals: [],
        revenuePotentialEstimate: 0,
      };

      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: emptyBrief,
        completedAt: new Date(),
      });
      return emptyBrief;
    }

    // Diversity filter: max 3 per action type
    const diversified = diversityFilter(topOpportunities, 3);
    // Prefer HD/LC quadrant
    const prioritized = prioritizeQuadrant(diversified, 'High Demand / Low Competition');
    const top20 = prioritized.slice(0, 20);

    // Get latest trend data
    const latestTrend = await AnalysisRun.findOne({
      where: { type: 'trend_detection', status: 'success' },
      order: [['completed_at', 'DESC']],
    });

    // Market stats
    const totalActive = await Opportunity.count({ where: { status: 'active' } });
    const classified = await Opportunity.count({ where: { status: 'active', actionType: { [Op.ne]: null } } });
    const avgScore = await Opportunity.findOne({
      attributes: [[fn('AVG', col('ai_score')), 'avgScore']],
      where: { status: 'active', aiScore: { [Op.ne]: null } },
      raw: true,
    });

    const actionTypeCounts = {};
    for (const opp of topOpportunities) {
      actionTypeCounts[opp.actionType] = (actionTypeCounts[opp.actionType] || 0) + 1;
    }

    const marketStats = {
      totalActive,
      classified,
      averageScore: avgScore?.avgScore ? Math.round(parseFloat(avgScore.avgScore)) : 0,
      actionTypeCounts,
    };

    // Prepare data for LLM
    const oppSummaries = top20.map((opp) => ({
      id: opp.id,
      title: opp.title,
      type: opp.type,
      actionType: opp.actionType,
      quadrant: opp.opportunityQuadrant,
      aiScore: opp.aiScore,
      saturationIndex: opp.saturationIndex,
      value: opp.value,
      location: opp.location,
      category: opp.category,
      deadline: opp.expiresAt,
      actionPlan: opp.aiAnalysis?.actionPlan?.summary || null,
    }));

    // Generate AI brief
    let briefData;
    try {
      const aiClient = getAIClient();
      const { systemPrompt, userPrompt } = buildExecutiveBriefPrompt(
        oppSummaries,
        latestTrend?.results || {},
        marketStats
      );

      const { content, tokensUsed } = await aiClient.chat(systemPrompt, userPrompt, {
        maxTokens: 2000,
        temperature: 0.5,
      });

      briefData = JSON.parse(content);
      briefData.tokensUsed = tokensUsed;
    } catch (err) {
      logger.warn('AI executive brief generation failed, using fallback', { error: err.message });
      briefData = buildFallbackBrief(top20, marketStats);
    }

    // Assemble full brief
    const brief = {
      briefDate: new Date().toISOString(),
      headline: briefData.headline || 'Your daily opportunity intelligence brief',
      executiveSummary: briefData.executiveSummary || '',
      topOpportunities: top20.map((opp) => ({
        id: opp.id,
        title: opp.title,
        type: opp.type,
        actionType: opp.actionType,
        quadrant: opp.opportunityQuadrant,
        aiScore: parseFloat(opp.aiScore) || 0,
        saturationIndex: parseFloat(opp.saturationIndex) || 0,
        value: opp.value,
        sourceUrl: opp.sourceUrl,
        recommendedAction: opp.aiAnalysis?.actionPlan?.summary || null,
      })).slice(0, 10),
      recommendedActions: briefData.recommendedActions || [],
      marketPulse: briefData.marketPulse || '',
      riskFlags: briefData.riskFlags || [],
      trendSignals: briefData.trendSignals || [],
      revenuePotentialEstimate: calculateRevenuePotential(top20),
      marketStats,
    };

    await run.update({
      status: 'success',
      inputCount: top20.length,
      outputCount: 1,
      results: brief,
      tokensUsed: briefData.tokensUsed || 0,
      completedAt: new Date(),
    });

    logger.info('Executive brief generated', { opportunityCount: top20.length });
    return brief;
  } catch (error) {
    logger.error('Executive brief generation failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

function diversityFilter(opportunities, maxPerType) {
  const counts = {};
  return opportunities.filter((opp) => {
    counts[opp.actionType] = (counts[opp.actionType] || 0) + 1;
    return counts[opp.actionType] <= maxPerType;
  });
}

function prioritizeQuadrant(opportunities, preferredQuadrant) {
  const preferred = opportunities.filter((o) => o.opportunityQuadrant === preferredQuadrant);
  const rest = opportunities.filter((o) => o.opportunityQuadrant !== preferredQuadrant);
  return [...preferred, ...rest];
}

function calculateRevenuePotential(opportunities) {
  return opportunities.reduce((sum, opp) => sum + (parseFloat(opp.value) || 0), 0);
}

function buildFallbackBrief(opportunities, stats) {
  const topOpp = opportunities[0];
  return {
    headline: `${stats.totalActive} active opportunities — ${stats.classified} classified and ready for action`,
    executiveSummary: `Today's brief covers ${opportunities.length} top opportunities across ${Object.keys(stats.actionTypeCounts).length} action categories. Average AI relevance score: ${stats.averageScore}/100.`,
    recommendedActions: opportunities.slice(0, 5).map((opp, i) => ({
      priority: i + 1,
      action: `${opp.actionType}: ${opp.title}`,
      opportunity: opp.title,
      reasoning: `AI Score: ${opp.aiScore}, Quadrant: ${opp.opportunityQuadrant || 'Uncomputed'}`,
      deadline: opp.expiresAt ? new Date(opp.expiresAt).toLocaleDateString() : 'No deadline',
    })),
    marketPulse: `${stats.totalActive} active opportunities in the pipeline with an average score of ${stats.averageScore}.`,
    riskFlags: [],
    trendSignals: [],
  };
}

module.exports = { getExecutiveBrief, generateExecutiveBrief };
