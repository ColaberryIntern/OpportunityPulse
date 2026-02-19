const { Op } = require('sequelize');
const { PersonalMatch, Opportunity, DataSource, User, SavedOpportunity, BehaviorProfile } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const { MATCH_SYSTEM_PROMPT, buildMatchUserPrompt } = require('./personalMatch.prompts');
const logger = require('../logging/logger');

const CACHE_HOURS = 6;
const MAX_OPPORTUNITIES = 50;
const MIN_MATCH_SCORE = 40;

/**
 * Assemble the user context for AI matching.
 * Combines profile data, behavior profile, saved opportunity patterns, and interests.
 */
async function assembleUserContext(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'name', 'company', 'interests', 'profileData'],
  });

  if (!user) throw new Error('User not found');

  const profileData = user.profileData || {};

  // Get behavior profile if exists
  let behaviorSignals = {};
  try {
    const behavior = await BehaviorProfile.findOne({ where: { userId } });
    if (behavior) {
      behaviorSignals = {
        topInterests: Object.entries(behavior.interestScores || {})
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([key]) => key),
        topCategories: Object.entries(behavior.categoryPreferences || {})
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([key]) => key),
        topTags: Object.entries(behavior.tagAffinities || {})
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([key]) => key),
        recentSearchTerms: (behavior.searchPatterns?.recentQueries || []).slice(0, 5),
      };
    }
  } catch (err) {
    logger.warn('Failed to fetch behavior profile for matching', { userId, error: err.message });
  }

  // Get saved opportunity patterns
  let savedPatterns = {};
  try {
    const savedOpps = await SavedOpportunity.findAll({
      where: { userId },
      include: [{ model: Opportunity, as: 'opportunity', attributes: ['type', 'category', 'tags'] }],
      limit: 20,
      order: [['created_at', 'DESC']],
    });

    if (savedOpps.length > 0) {
      const types = {};
      const categories = {};
      savedOpps.forEach((so) => {
        if (so.opportunity?.type) types[so.opportunity.type] = (types[so.opportunity.type] || 0) + 1;
        if (so.opportunity?.category) categories[so.opportunity.category] = (categories[so.opportunity.category] || 0) + 1;
      });
      savedPatterns = {
        savedCount: savedOpps.length,
        preferredTypes: Object.entries(types).sort(([, a], [, b]) => b - a).map(([key]) => key),
        preferredCategories: Object.entries(categories).sort(([, a], [, b]) => b - a).slice(0, 5).map(([key]) => key),
      };
    }
  } catch (err) {
    logger.warn('Failed to fetch saved patterns for matching', { userId, error: err.message });
  }

  const interests = user.interests ? user.interests.split(',').map((i) => i.trim()).filter(Boolean) : [];

  return {
    professionalTitle: profileData.professionalTitle || null,
    industry: profileData.industry || null,
    skills: profileData.skills || [],
    experienceLevel: profileData.experienceLevel || null,
    companySize: profileData.companySize || null,
    goals: profileData.goals || [],
    preferredLocations: profileData.preferredLocations || [],
    certifications: profileData.certifications || [],
    budgetRange: profileData.budgetRange || null,
    interests,
    company: user.company || null,
    behaviorSignals,
    savedPatterns,
  };
}

/**
 * Fetch candidate opportunities for matching.
 */
async function fetchCandidateOpportunities() {
  return Opportunity.findAll({
    where: { status: 'active' },
    include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
    order: [
      ['ai_score', 'DESC NULLS LAST'],
      ['published_at', 'DESC'],
    ],
    limit: MAX_OPPORTUNITIES,
    attributes: ['id', 'type', 'title', 'description', 'sourceUrl', 'category', 'aiScore', 'value', 'location', 'publishedAt', 'tags'],
  });
}

/**
 * Get AI-powered personal matches for a user.
 * Returns cached results if fresh, otherwise computes new ones.
 */
async function getPersonalMatches(userId, { forceRefresh = false } = {}) {
  // Check cache
  if (!forceRefresh) {
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000);
    const cached = await PersonalMatch.findAll({
      where: {
        userId,
        computedAt: { [Op.gte]: cacheThreshold },
      },
      include: [{
        model: Opportunity,
        as: 'opportunity',
        attributes: ['id', 'type', 'title', 'description', 'sourceUrl', 'category', 'aiScore', 'value', 'location', 'publishedAt', 'tags'],
        include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
      }],
      order: [['match_score', 'DESC']],
      limit: 15,
    });

    if (cached.length > 0) {
      logger.info('Returning cached personal matches', { userId, count: cached.length });
      return { matches: cached, fromCache: true };
    }
  }

  // Compute fresh matches
  return computePersonalMatches(userId);
}

/**
 * Compute fresh personal matches using OpenAI.
 */
async function computePersonalMatches(userId) {
  const userContext = await assembleUserContext(userId);
  const opportunities = await fetchCandidateOpportunities();

  if (opportunities.length === 0) {
    return { matches: [], fromCache: false, message: 'No active opportunities to match.' };
  }

  // Build simplified opportunity data for the AI prompt
  const oppData = opportunities.map((opp) => ({
    id: opp.id,
    type: opp.type,
    title: opp.title,
    description: opp.description ? opp.description.substring(0, 300) : '',
    category: opp.category,
    value: opp.value,
    location: opp.location,
    tags: opp.tags,
    aiScore: opp.aiScore,
  }));

  // Call OpenAI
  const aiClient = getAIClient();
  const userPrompt = buildMatchUserPrompt(userContext, oppData);
  const { content, tokensUsed } = await aiClient.chat(
    MATCH_SYSTEM_PROMPT,
    userPrompt,
    { maxTokens: 3000, temperature: 0.3 }
  );

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (parseErr) {
    logger.error('Failed to parse AI match response', { error: parseErr.message });
    throw new Error('AI matching failed — invalid response format.');
  }

  if (!parsed.matches || !Array.isArray(parsed.matches)) {
    throw new Error('AI response missing "matches" array.');
  }

  // Clear old matches for this user
  await PersonalMatch.destroy({ where: { userId } });

  // Save new matches
  const now = new Date();
  const validOpportunityIds = new Set(opportunities.map((o) => o.id));
  const matchRecords = [];

  for (const match of parsed.matches) {
    if (!validOpportunityIds.has(match.id)) continue;
    const score = Math.min(100, Math.max(0, Math.round(match.matchScore)));
    if (score < MIN_MATCH_SCORE) continue;

    matchRecords.push({
      userId,
      opportunityId: match.id,
      matchScore: score,
      matchReason: match.matchReason || '',
      actionSuggestion: match.actionSuggestion || '',
      strengthAreas: match.strengthAreas || [],
      gapAreas: match.gapAreas || [],
      computedAt: now,
    });
  }

  if (matchRecords.length > 0) {
    await PersonalMatch.bulkCreate(matchRecords);
  }

  logger.info('Personal matches computed', {
    userId,
    candidateCount: opportunities.length,
    matchCount: matchRecords.length,
    tokensUsed,
  });

  // Fetch saved matches with full opportunity data
  const savedMatches = await PersonalMatch.findAll({
    where: { userId },
    include: [{
      model: Opportunity,
      as: 'opportunity',
      attributes: ['id', 'type', 'title', 'description', 'sourceUrl', 'category', 'aiScore', 'value', 'location', 'publishedAt', 'tags'],
      include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
    }],
    order: [['match_score', 'DESC']],
    limit: 15,
  });

  return { matches: savedMatches, fromCache: false, tokensUsed };
}

/**
 * Submit feedback on a personal match.
 */
async function submitMatchFeedback(userId, matchId, feedback) {
  const match = await PersonalMatch.findOne({
    where: { id: matchId, userId },
  });

  if (!match) throw new Error('Match not found.');

  match.feedback = feedback;
  await match.save();

  logger.info('Match feedback submitted', { userId, matchId, feedback });
  return match;
}

/**
 * Update user profile data.
 */
async function updateProfileData(userId, profileData) {
  const user = await User.findByPk(userId);
  if (!user) throw new Error('User not found.');

  user.profileData = profileData;
  await user.save();

  logger.info('Profile data updated', { userId });
  return user.profileData;
}

module.exports = {
  getPersonalMatches,
  computePersonalMatches,
  submitMatchFeedback,
  updateProfileData,
  assembleUserContext,
};
