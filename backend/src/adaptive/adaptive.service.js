const { Op } = require('sequelize');
const logger = require('../logging/logger');

const DECAY_WINDOW_DAYS = 30;
const DECAY_FACTOR = 0.95;

const ACTION_WEIGHTS = {
  opportunity_view: 1.0,
  opportunity_click: 2.0,
  recommendation_click: 2.5,
  search_query: 1.5,
  time_on_page: 0.5,
};

function recencyWeight(activityDate) {
  const daysAgo = (Date.now() - new Date(activityDate).getTime()) / 86400000;
  return Math.pow(DECAY_FACTOR, Math.min(daysAgo, DECAY_WINDOW_DAYS));
}

async function computeBehaviorProfile(userId) {
  const { UserActivity, BehaviorProfile } = require('../models');

  const since = new Date(Date.now() - 90 * 86400000);
  const activities = await UserActivity.findAll({
    where: {
      userId,
      created_at: { [Op.gte]: since },
      action: { [Op.in]: Object.keys(ACTION_WEIGHTS) },
    },
    order: [['created_at', 'DESC']],
    limit: 1000,
  });

  const typeScores = {};
  const categoryScores = {};
  const tagScores = {};
  const searchTerms = {};
  const recentQueries = [];
  let totalTimeSpent = 0;
  let totalViews = 0;
  let totalClicks = 0;

  for (const activity of activities) {
    const weight = (ACTION_WEIGHTS[activity.action] || 0) * recencyWeight(activity.createdAt);
    const meta = activity.metadata || {};

    if (meta.opportunityType) {
      typeScores[meta.opportunityType] = (typeScores[meta.opportunityType] || 0) + weight;
    }
    if (meta.category) {
      categoryScores[meta.category] = (categoryScores[meta.category] || 0) + weight;
    }
    if (meta.tags && Array.isArray(meta.tags)) {
      for (const tag of meta.tags) {
        tagScores[tag] = (tagScores[tag] || 0) + weight;
      }
    }
    if (activity.action === 'search_query' && meta.query) {
      const terms = meta.query.toLowerCase().split(/\s+/);
      terms.forEach((term) => {
        if (term.length > 2) searchTerms[term] = (searchTerms[term] || 0) + 1;
      });
      recentQueries.push(meta.query);
    }
    if (activity.action === 'time_on_page') {
      totalTimeSpent += (meta.seconds || 0);
    }
    if (activity.action === 'opportunity_view') totalViews++;
    if (['opportunity_click', 'recommendation_click'].includes(activity.action)) totalClicks++;
  }

  const normalize = (scores) => {
    const max = Math.max(...Object.values(scores), 1);
    const result = {};
    for (const [key, val] of Object.entries(scores)) {
      result[key] = parseFloat((val / max).toFixed(3));
    }
    return result;
  };

  const profileData = {
    interestScores: normalize(typeScores),
    categoryPreferences: normalize(categoryScores),
    tagAffinities: normalize(tagScores),
    searchPatterns: {
      recentQueries: recentQueries.slice(0, 20),
      topTerms: normalize(searchTerms),
    },
    engagementMetrics: {
      avgTimeSpent: activities.length > 0 ? Math.round(totalTimeSpent / Math.max(totalViews, 1)) : 0,
      totalViews,
      totalClicks,
    },
    lastComputedAt: new Date(),
  };

  const [profile] = await BehaviorProfile.upsert({
    userId,
    ...profileData,
  }, { returning: true });

  logger.info('Behavior profile computed', { userId, activityCount: activities.length });

  // Broadcast profile update via Socket.IO to the specific user
  try {
    const { broadcast } = require('../config/socketBroadcaster');
    broadcast('adaptive.profile_updated', {
      interestScores: profileData.interestScores,
      lastComputedAt: profileData.lastComputedAt,
    }, { userId });
  } catch (_) { /* socket not initialized */ }

  return profile;
}

async function getBehaviorProfile(userId) {
  const { BehaviorProfile } = require('../models');

  let profile = await BehaviorProfile.findOne({ where: { userId } });

  const staleThreshold = Date.now() - (60 * 60 * 1000);
  if (!profile || !profile.lastComputedAt || new Date(profile.lastComputedAt).getTime() < staleThreshold) {
    profile = await computeBehaviorProfile(userId);
  }

  return profile;
}

async function trackBehavior(userId, action, metadata = {}) {
  const { UserActivity } = require('../models');
  await UserActivity.create({ userId, action, metadata });
}

async function getAdaptiveLearning(userId) {
  const profile = await getBehaviorProfile(userId);
  return {
    interestScores: profile.interestScores,
    categoryPreferences: profile.categoryPreferences,
    tagAffinities: profile.tagAffinities,
    searchPatterns: profile.searchPatterns,
    engagementMetrics: profile.engagementMetrics,
    lastComputedAt: profile.lastComputedAt,
  };
}

module.exports = {
  computeBehaviorProfile,
  getBehaviorProfile,
  trackBehavior,
  getAdaptiveLearning,
  recencyWeight,
  ACTION_WEIGHTS,
};
