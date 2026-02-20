const { Op, fn, col, literal } = require('sequelize');
const { Opportunity, OpportunityClassification, AiDomain, AiTool, AnalysisRun, sequelize } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const { buildExecutiveBriefPrompt } = require('./actionEngine.prompts');
const logger = require('../logging/logger');

/**
 * Fetch user profile context for personalized briefs.
 * Returns null if user has no meaningful profile data.
 */
async function getUserProfileContext(userId) {
  if (!userId) return null;
  try {
    const { assembleUserContext } = require('../personalMatch/personalMatch.service');
    const ctx = await assembleUserContext(userId);
    // Only personalize if user has meaningful profile data
    if (!ctx.skills?.length && !ctx.industry && !ctx.goals?.length) return null;
    return ctx;
  } catch (err) {
    logger.warn('Failed to fetch user context for personalized brief', { userId, error: err.message });
    return null;
  }
}

/**
 * Build personalization addendum for LLM prompts.
 */
function buildPersonalizationContext(userCtx) {
  if (!userCtx) return '';
  const parts = [];
  if (userCtx.professionalTitle) parts.push(`Title: ${userCtx.professionalTitle}`);
  if (userCtx.industry) parts.push(`Industry: ${userCtx.industry}`);
  if (userCtx.skills?.length) parts.push(`Skills: ${userCtx.skills.slice(0, 15).join(', ')}`);
  if (userCtx.goals?.length) parts.push(`Goals: ${userCtx.goals.join(', ')}`);
  if (userCtx.experienceLevel) parts.push(`Experience: ${userCtx.experienceLevel}`);

  return `\n\nIMPORTANT - Personalize this insight for the following user:\n${parts.join('\n')}\n\nFrame insights in terms of what matters to THIS user. Highlight opportunities matching their skills and interests. Note relevant gaps or upskilling areas. Use "you/your" language where appropriate.`;
}

const BRIEF_CACHE_HOURS = 4;

/**
 * Get the executive brief, using cache if fresh enough.
 * When userId is provided and user has a profile, generates a personalized brief.
 * Personalized briefs rely on Redis cache only (no AnalysisRun storage).
 */
async function getExecutiveBrief({ forceRefresh = false, userId = null } = {}) {
  // For personalized briefs, skip AnalysisRun cache — rely on Redis middleware
  const userCtx = await getUserProfileContext(userId);

  if (!forceRefresh && !userCtx) {
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

  return generateExecutiveBrief({ userCtx });
}

/**
 * Generate a fresh executive brief.
 * Queries top opportunities, trend data, and calls OpenAI for synthesis.
 */
async function generateExecutiveBrief({ userCtx = null } = {}) {
  // Only store in AnalysisRun for global (non-personalized) briefs
  const isPersonalized = !!userCtx;
  const run = isPersonalized ? null : await AnalysisRun.create({
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

      if (run) {
        await run.update({
          status: 'success',
          inputCount: 0,
          outputCount: 0,
          results: emptyBrief,
          completedAt: new Date(),
        });
      }
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

    // Market stats — broad view across ALL active opportunities
    const [totalActive, classified, avgScore, typeDistribution, quadrantDistribution, expiringSoon] = await Promise.all([
      Opportunity.count({ where: { status: 'active' } }),
      Opportunity.count({ where: { status: 'active', actionType: { [Op.ne]: null } } }),
      Opportunity.findOne({
        attributes: [[fn('AVG', col('ai_score')), 'avgScore']],
        where: { status: 'active', aiScore: { [Op.ne]: null } },
        raw: true,
      }),
      // Count by opportunity type
      Opportunity.findAll({
        attributes: ['type', [fn('COUNT', col('id')), 'count']],
        where: { status: 'active' },
        group: ['type'],
        raw: true,
      }),
      // Count by quadrant
      Opportunity.findAll({
        attributes: ['opportunityQuadrant', [fn('COUNT', col('id')), 'count']],
        where: { status: 'active', opportunityQuadrant: { [Op.ne]: null } },
        group: ['opportunityQuadrant'],
        raw: true,
      }),
      // Expiring within 7 days
      Opportunity.count({
        where: {
          status: 'active',
          expiresAt: { [Op.between]: [new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)] },
        },
      }),
    ]);

    // Domain breakdown from classifications — top domains by opportunity count
    let domainBreakdown = [];
    try {
      const [domainRows] = await sequelize.query(`
        SELECT d.name, COUNT(oc.id) AS count
        FROM opportunity_classifications oc
        JOIN ai_domains d ON d.id = oc.domain_id
        WHERE oc.domain_id IS NOT NULL
        GROUP BY d.name
        ORDER BY count DESC
        LIMIT 10
      `);
      domainBreakdown = domainRows.map(r => ({ domain: r.name, count: parseInt(r.count, 10) }));
    } catch (err) {
      logger.warn('Domain breakdown query failed', { error: err.message });
    }

    // Top 3 tools by momentum score for brief context
    let topMomentumTools = [];
    try {
      topMomentumTools = await AiTool.findAll({
        where: { status: 'active', compositeMomentumScore: { [Op.gt]: 0 } },
        order: [['composite_momentum_score', 'DESC']],
        limit: 3,
        attributes: ['name', 'category', 'compositeMomentumScore', 'momentumStage'],
        raw: true,
      });
    } catch (err) {
      logger.warn('Failed to fetch momentum tools for brief', { error: err.message });
    }

    const actionTypeCounts = {};
    for (const opp of topOpportunities) {
      actionTypeCounts[opp.actionType] = (actionTypeCounts[opp.actionType] || 0) + 1;
    }

    const typeCounts = {};
    for (const row of typeDistribution) {
      typeCounts[row.type] = parseInt(row.count, 10);
    }

    const quadrantCounts = {};
    for (const row of quadrantDistribution) {
      if (row.opportunityQuadrant) {
        quadrantCounts[row.opportunityQuadrant] = parseInt(row.count, 10);
      }
    }

    const marketStats = {
      totalActive,
      classified,
      averageScore: avgScore?.avgScore ? Math.round(parseFloat(avgScore.avgScore)) : 0,
      actionTypeCounts,
      typeCounts,
      quadrantCounts,
      domainBreakdown,
      expiringSoon,
      topMomentumTools,
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

      // Append personalization context if available
      const personalContext = buildPersonalizationContext(userCtx);
      const finalSystemPrompt = systemPrompt + personalContext;

      const { content, tokensUsed } = await aiClient.chat(finalSystemPrompt, userPrompt, {
        maxTokens: 3000,
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
      sectorHighlights: briefData.sectorHighlights || [],
      recommendedActions: briefData.recommendedActions || [],
      marketPulse: briefData.marketPulse || '',
      riskFlags: briefData.riskFlags || [],
      trendSignals: briefData.trendSignals || [],
      revenuePotentialEstimate: calculateRevenuePotential(top20),
      marketStats,
      personalized: isPersonalized,
    };

    if (run) {
      await run.update({
        status: 'success',
        inputCount: top20.length,
        outputCount: 1,
        results: brief,
        tokensUsed: briefData.tokensUsed || 0,
        completedAt: new Date(),
      });
    }

    logger.info('Executive brief generated', { opportunityCount: top20.length, personalized: isPersonalized });
    return brief;
  } catch (error) {
    logger.error('Executive brief generation failed', { error: error.message });
    if (run) {
      await run.update({
        status: 'failed',
        errors: [{ error: error.message }],
        completedAt: new Date(),
      });
    }
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
  const typeList = Object.entries(stats.typeCounts || {}).map(([t, c]) => `${c} ${t.replace('_', ' ')}`).join(', ');
  return {
    headline: `${stats.totalActive} active opportunities across ${Object.keys(stats.typeCounts || {}).length} categories — ${stats.expiringSoon || 0} expiring soon`,
    executiveSummary: `Today's market landscape includes ${typeList || 'various opportunity types'}. ${stats.classified} opportunities are classified and actionable with an average AI score of ${stats.averageScore}/100.`,
    sectorHighlights: (stats.domainBreakdown || []).slice(0, 5).map(d => ({
      sector: d.domain,
      summary: `${d.count} opportunities in ${d.domain}.`,
      count: d.count,
    })),
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

// --- Section Briefs ---

const SECTION_BRIEF_CACHE_HOURS = 24;

const SECTION_TYPE_MAP = {
  government: ['gov_contract', 'grant'],
  talent: ['ai_job'],
  freelance: ['freelance'],
  capital: ['investment'],
  'private-sector': ['ai_news'],
  alpha: null, // uses quadrant filter instead
  all: null, // no type filter
};

/**
 * Get a section-specific AI brief, using cache if fresh enough.
 * When userId is provided and user has profile data, returns a personalized brief.
 */
async function getSectionBrief(section, userId = null) {
  const userCtx = await getUserProfileContext(userId);

  // For personalized briefs, skip AnalysisRun cache — rely on Redis middleware per-user caching
  if (!userCtx) {
    const cutoff = new Date(Date.now() - SECTION_BRIEF_CACHE_HOURS * 60 * 60 * 1000);
    const cached = await AnalysisRun.findOne({
      where: {
        type: 'section_brief',
        opportunityType: section,
        status: 'success',
        completedAt: { [Op.gte]: cutoff },
      },
      order: [['completed_at', 'DESC']],
    });

    if (cached) {
      return cached.results;
    }
  }

  return generateSectionBrief(section, userCtx);
}

/**
 * Generate a section-specific AI insight brief.
 * When userCtx is provided, personalizes the insight for that user.
 */
async function generateSectionBrief(section, userCtx = null) {
  const isPersonalized = !!userCtx;
  // Only store in AnalysisRun for global (non-personalized) briefs
  const run = isPersonalized ? null : await AnalysisRun.create({
    type: 'section_brief',
    opportunityType: section,
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const where = { status: 'active' };
    const types = SECTION_TYPE_MAP[section];

    if (types) {
      where.type = { [Op.in]: types };
    } else if (section === 'alpha') {
      where.opportunityQuadrant = 'High Demand / Low Competition';
      where.aiScore = { [Op.gte]: 70 };
    }

    const opportunities = await Opportunity.findAll({
      where,
      order: [['ai_score', 'DESC NULLS LAST'], ['published_at', 'DESC']],
      limit: 20,
      attributes: [
        'id', 'type', 'title', 'description', 'actionType', 'aiScore',
        'saturationIndex', 'opportunityQuadrant', 'value', 'category',
        'tags', 'publishedAt', 'aiAnalysis',
      ],
    });

    const totalCount = await Opportunity.count({ where: { status: 'active', ...(types ? { type: { [Op.in]: types } } : {}) } });
    const avgScoreResult = await Opportunity.findOne({
      attributes: [[fn('AVG', col('ai_score')), 'avgScore']],
      where: { status: 'active', aiScore: { [Op.ne]: null }, ...(types ? { type: { [Op.in]: types } } : {}) },
      raw: true,
    });
    const avgScore = avgScoreResult?.avgScore ? Math.round(parseFloat(avgScoreResult.avgScore)) : 0;

    if (opportunities.length === 0) {
      const emptyBrief = {
        section,
        briefDate: new Date().toISOString(),
        headline: `No active opportunities in this section yet`,
        summary: 'Check back after the next ingestion cycle for fresh insights.',
        stats: { totalCount: 0, avgScore: 0 },
      };

      if (run) {
        await run.update({ status: 'success', inputCount: 0, outputCount: 0, results: emptyBrief, completedAt: new Date() });
      }
      return emptyBrief;
    }

    // Build summaries for LLM
    const oppSummaries = opportunities.slice(0, 10).map((o) => ({
      title: o.title,
      type: o.type,
      actionType: o.actionType,
      aiScore: o.aiScore,
      value: o.value,
      category: o.category,
    }));

    const sectionLabel = {
      government: 'Government Contracts & Grants',
      talent: 'AI Job Market',
      freelance: 'Freelance Projects',
      capital: 'Investment & Funding',
      'private-sector': 'Private Sector & AI News',
      alpha: 'Alpha (High-Demand Low-Competition)',
      all: 'All Opportunities',
    }[section] || section;

    let briefData;
    try {
      const aiClient = getAIClient();
      const personalContext = buildPersonalizationContext(userCtx);
      const systemPrompt = `You are a strategic intelligence analyst. Generate a concise section insight for the "${sectionLabel}" category of an opportunity tracking platform. Return valid JSON with: { "headline": "one punchy sentence", "summary": "2-3 sentences with actionable insights, trends, and notable patterns", "riskFlags": ["risk1"], "trendSignals": ["signal1"] }` + personalContext;
      const userPrompt = `Section: ${sectionLabel}\nTotal active: ${totalCount}\nAvg AI Score: ${avgScore}\n\nTop opportunities:\n${JSON.stringify(oppSummaries, null, 2)}`;

      const { content, tokensUsed } = await aiClient.chat(systemPrompt, userPrompt, {
        maxTokens: 500,
        temperature: 0.5,
      });

      briefData = JSON.parse(content);
      briefData.tokensUsed = tokensUsed;
    } catch (err) {
      logger.warn(`Section brief AI generation failed for ${section}, using fallback`, { error: err.message });
      // Fallback
      const topCategories = [...new Set(opportunities.map(o => o.category).filter(Boolean))].slice(0, 3);
      briefData = {
        headline: `${totalCount} active ${sectionLabel.toLowerCase()} opportunities with avg score ${avgScore}/100`,
        summary: `Top categories include ${topCategories.join(', ') || 'various topics'}. ${opportunities.length >= 10 ? 'Strong pipeline with diverse options.' : 'Moderate pipeline — more opportunities expected soon.'}`,
        riskFlags: [],
        trendSignals: [],
      };
    }

    const brief = {
      section,
      briefDate: new Date().toISOString(),
      headline: briefData.headline || `${sectionLabel} Intelligence`,
      summary: briefData.summary || '',
      riskFlags: briefData.riskFlags || [],
      trendSignals: briefData.trendSignals || [],
      stats: { totalCount, avgScore },
      personalized: isPersonalized,
    };

    if (run) {
      await run.update({
        status: 'success',
        inputCount: opportunities.length,
        outputCount: 1,
        results: brief,
        tokensUsed: briefData.tokensUsed || 0,
        completedAt: new Date(),
      });
    }

    logger.info(`Section brief generated for ${section}`, { totalCount, avgScore, personalized: isPersonalized });
    return brief;
  } catch (error) {
    logger.error(`Section brief generation failed for ${section}`, { error: error.message });
    if (run) {
      await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    }
    throw error;
  }
}

module.exports = { getExecutiveBrief, generateExecutiveBrief, getSectionBrief, generateSectionBrief };
