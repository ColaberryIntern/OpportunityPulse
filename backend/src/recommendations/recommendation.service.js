const { Op } = require('sequelize');
const { Opportunity, DataSource, User } = require('../models');
const logger = require('../logging/logger');

/**
 * Get personalized recommendations for a user based on their interests
 * and top AI-scored opportunities.
 */
async function getRecommendations(userId, { limit = 10 } = {}) {
  const safeLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));

  // Fetch user interests
  const user = await User.findByPk(userId, { attributes: ['id', 'interests'] });
  const interests = user?.interests ? user.interests.split(',').map(i => i.trim()).filter(Boolean) : [];

  // Build where clause: active opportunities, ordered by AI score
  const where = { status: 'active' };

  // If user has interests, boost matching opportunities
  if (interests.length > 0) {
    const interestConditions = interests.map(interest => ({
      [Op.or]: [
        { title: { [Op.iLike]: `%${interest}%` } },
        { description: { [Op.iLike]: `%${interest}%` } },
        { category: { [Op.iLike]: `%${interest}%` } },
        { tags: { [Op.overlap]: [interest] } },
      ],
    }));
    where[Op.or] = interestConditions;
  }

  // Fetch interest-matched opportunities first
  let results = [];
  if (interests.length > 0) {
    results = await Opportunity.findAll({
      where,
      include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
      order: [['ai_score', 'DESC NULLS LAST']],
      limit: safeLimit,
      attributes: ['id', 'type', 'title', 'description', 'sourceUrl', 'category', 'aiScore', 'value', 'location', 'publishedAt', 'tags'],
    });
  }

  // If not enough interest-matched results, fill with top-scored opportunities
  if (results.length < safeLimit) {
    const existingIds = results.map(r => r.id);
    const remaining = safeLimit - results.length;

    const topScored = await Opportunity.findAll({
      where: {
        status: 'active',
        ...(existingIds.length > 0 ? { id: { [Op.notIn]: existingIds } } : {}),
      },
      include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
      order: [['ai_score', 'DESC NULLS LAST']],
      limit: remaining,
      attributes: ['id', 'type', 'title', 'description', 'sourceUrl', 'category', 'aiScore', 'value', 'location', 'publishedAt', 'tags'],
    });

    results = [...results, ...topScored];
  }

  logger.info('Recommendations generated', { userId, interestCount: interests.length, resultCount: results.length });

  return {
    recommendations: results,
    interests,
    total: results.length,
  };
}

/**
 * Get adaptive recommendations by re-ranking base recommendations
 * using the user's behavior profile.
 */
async function getAdaptiveRecommendations(userId, { limit = 10 } = {}) {
  const safeLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));

  try {
    const { getBehaviorProfile } = require('../adaptive/adaptive.service');
    const profile = await getBehaviorProfile(userId);

    if (!profile || !profile.interestScores || Object.keys(profile.interestScores).length === 0) {
      return getRecommendations(userId, { limit: safeLimit });
    }

    // Fetch more results for re-ranking
    const baseResult = await getRecommendations(userId, { limit: safeLimit * 2 });
    const { recommendations, interests } = baseResult;

    // Re-rank with adaptive boost
    const scored = recommendations.map((opp) => {
      const baseScore = opp.aiScore || 0;

      let adaptiveBoost = 0;

      // Type affinity boost (weight: 30)
      if (opp.type && profile.interestScores[opp.type]) {
        adaptiveBoost += profile.interestScores[opp.type] * 30;
      }

      // Category affinity boost (weight: 20)
      if (opp.category && profile.categoryPreferences[opp.category]) {
        adaptiveBoost += profile.categoryPreferences[opp.category] * 20;
      }

      // Tag affinity boost (weight: 10 each)
      if (opp.tags && Array.isArray(opp.tags) && profile.tagAffinities) {
        for (const tag of opp.tags) {
          if (profile.tagAffinities[tag]) {
            adaptiveBoost += profile.tagAffinities[tag] * 10;
          }
        }
      }

      return {
        opportunity: opp,
        finalScore: baseScore + adaptiveBoost,
      };
    });

    // Sort by final score descending and take top N
    scored.sort((a, b) => b.finalScore - a.finalScore);
    const topResults = scored.slice(0, safeLimit).map((s) => s.opportunity);

    logger.info('Adaptive recommendations generated', {
      userId,
      baseCount: recommendations.length,
      resultCount: topResults.length,
    });

    return {
      recommendations: topResults,
      interests,
      total: topResults.length,
      adaptive: true,
    };
  } catch (error) {
    logger.warn('Adaptive recommendations failed, falling back to base', {
      userId,
      error: error.message,
    });
    return getRecommendations(userId, { limit: safeLimit });
  }
}

module.exports = { getRecommendations, getAdaptiveRecommendations };
