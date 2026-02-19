const { Op } = require('sequelize');
const { AlertPreference, User, Opportunity, DataSource } = require('../models');
const { assembleUserContext } = require('../personalMatch/personalMatch.service');
const { getAIClient } = require('../analysis/ai.client');
const { sendEmail } = require('../utils/email');
const { digestEmailTemplate } = require('../utils/emailTemplates');
const logger = require('../logging/logger');

const DIGEST_FREQUENCY_HOURS = {
  daily: 24,
  weekly: 168,
  biweekly: 336,
  monthly: 720,
};

const MAX_OPPORTUNITIES_PER_DIGEST = 50;
const TOP_MATCHES_IN_EMAIL = 5;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;
const MAX_DIGESTS_PER_RUN = 100;

/**
 * Determine which users are due for a digest email.
 */
async function getUsersDueForDigest() {
  const preferences = await AlertPreference.findAll({
    where: { emailNotify: true },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'email', 'name', 'company', 'interests', 'profileData', 'createdAt', 'emailVerified'],
      where: { emailVerified: true },
    }],
  });

  const now = new Date();
  return preferences.filter((pref) => {
    const frequency = pref.digestFrequency || 'weekly';
    const hoursRequired = DIGEST_FREQUENCY_HOURS[frequency];
    if (!hoursRequired) return false;

    const lastSent = pref.lastDigestSentAt;
    if (!lastSent) return true;

    const hoursSinceLastSent = (now - new Date(lastSent)) / (1000 * 60 * 60);
    return hoursSinceLastSent >= hoursRequired;
  });
}

/**
 * Fetch new opportunities since a given date, filtered by user's type preferences.
 */
async function getNewOpportunities(since, alertPref) {
  const typeFilter = [];
  if (alertPref.govContracts) typeFilter.push('gov_contract', 'grant');
  if (alertPref.aiJobs) typeFilter.push('ai_job');
  if (alertPref.investments) typeFilter.push('investment');
  typeFilter.push('ai_news');

  const where = {
    status: 'active',
    publishedAt: { [Op.gt]: since },
    type: { [Op.in]: [...new Set(typeFilter)] },
  };

  if (alertPref.minScore > 0) {
    where.aiScore = { [Op.gte]: alertPref.minScore };
  }

  return Opportunity.findAll({
    where,
    include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
    order: [['ai_score', 'DESC NULLS LAST'], ['published_at', 'DESC']],
    limit: MAX_OPPORTUNITIES_PER_DIGEST,
    attributes: ['id', 'type', 'title', 'description', 'sourceUrl', 'category',
                 'aiScore', 'value', 'location', 'publishedAt', 'tags'],
  });
}

/**
 * Score opportunities against user profile using lightweight heuristics.
 * Avoids per-opportunity OpenAI calls for cost efficiency in bulk digests.
 */
function scoreOpportunitiesForUser(opportunities, userContext) {
  return opportunities.map((opp) => {
    let score = parseFloat(opp.aiScore) || 0;
    const skills = userContext.skills || [];
    const tags = opp.tags || [];
    const desc = (opp.description || '').toLowerCase();
    const title = (opp.title || '').toLowerCase();

    for (const skill of skills) {
      const s = skill.toLowerCase();
      if (tags.some(t => t.toLowerCase().includes(s))) score += 10;
      if (title.includes(s)) score += 8;
      if (desc.includes(s)) score += 5;
    }

    if (userContext.industry) {
      const ind = userContext.industry.toLowerCase();
      if ((opp.category || '').toLowerCase().includes(ind)) score += 10;
      if (desc.includes(ind)) score += 5;
    }

    const locs = userContext.preferredLocations || [];
    for (const loc of locs) {
      if ((opp.location || '').toLowerCase().includes(loc.toLowerCase())) {
        score += 10;
        break;
      }
    }

    // Boost from behavior signals
    const topTags = userContext.behaviorSignals?.topTags || [];
    for (const tag of topTags) {
      if (tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))) {
        score += 3;
      }
    }

    return { opportunity: opp, relevanceScore: Math.min(100, Math.round(score)) };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Generate an AI summary for the digest using OpenAI.
 * Falls back to static text if the AI call fails.
 */
async function generateDigestSummary(userContext, topMatches, typeCounts, frequency) {
  try {
    const aiClient = getAIClient();

    const systemPrompt = `You are a professional opportunity advisor. Generate a brief, personalized email digest summary for a user of the Opportunity Pulse platform. Be concise, action-oriented, and reference the user's specific profile when relevant.
Respond with valid JSON: {
  "summary": "<2-3 sentences summarizing this period's highlights, personalized to the user>",
  "keyHighlights": ["<highlight 1>", "<highlight 2>", "<highlight 3>"],
  "actionItem": "<one specific recommended next step>"
}`;

    const topOppSummaries = topMatches.slice(0, 5).map(m => ({
      title: m.opportunity.title,
      type: m.opportunity.type,
      score: m.relevanceScore,
      location: m.opportunity.location,
    }));

    const userPrompt = `Generate a ${frequency} digest summary for this user.

## User Profile
- Title: ${userContext.professionalTitle || 'Not specified'}
- Industry: ${userContext.industry || 'Not specified'}
- Skills: ${(userContext.skills || []).join(', ') || 'Not specified'}
- Goals: ${(userContext.goals || []).join(', ') || 'Not specified'}
- Locations: ${(userContext.preferredLocations || []).join(', ') || 'Not specified'}

## This Period's Data
- New opportunities found: ${Object.values(typeCounts).reduce((a, b) => a + b, 0)}
- Breakdown: ${JSON.stringify(typeCounts)}
- Top matches: ${JSON.stringify(topOppSummaries)}

Respond with the JSON format specified.`;

    const { content } = await aiClient.chat(systemPrompt, userPrompt, {
      maxTokens: 800,
      temperature: 0.4,
    });
    return JSON.parse(content);
  } catch (error) {
    logger.warn('AI digest summary generation failed, using fallback', {
      error: error.message,
    });
    const total = Object.values(typeCounts).reduce((a, b) => a + b, 0);
    return {
      summary: `We found ${total} new opportunities matching your profile this ${frequency === 'daily' ? 'day' : 'period'}. Check out the top matches below.`,
      keyHighlights: topMatches.slice(0, 3).map(m => m.opportunity.title),
      actionItem: 'Review the top matches and save the ones that interest you.',
    };
  }
}

/**
 * Build and send a digest email for a single user.
 * Returns { sent, opportunityCount, reason?, error? }
 */
async function sendDigestForUser(alertPref) {
  const user = alertPref.user;
  const userId = user.id;

  try {
    const since = alertPref.lastDigestSentAt || user.createdAt;
    const opportunities = await getNewOpportunities(since, alertPref);

    if (opportunities.length === 0) {
      await alertPref.update({ lastDigestSentAt: new Date() });
      logger.info('Digest skipped (no new opportunities)', { userId });
      return { sent: false, opportunityCount: 0, reason: 'no_new_content' };
    }

    const userContext = await assembleUserContext(userId);
    const scored = scoreOpportunitiesForUser(opportunities, userContext);
    const topMatches = scored.slice(0, TOP_MATCHES_IN_EMAIL);

    const typeCounts = {};
    opportunities.forEach((opp) => {
      typeCounts[opp.type] = (typeCounts[opp.type] || 0) + 1;
    });

    const frequency = alertPref.digestFrequency || 'weekly';
    const aiSummary = await generateDigestSummary(userContext, scored, typeCounts, frequency);

    const { subject, html, text } = digestEmailTemplate({
      name: user.name,
      frequency,
      aiSummary,
      topMatches,
      typeCounts,
      totalNew: opportunities.length,
      since,
    });

    const result = await sendEmail({ to: user.email, subject, html, text });

    if (result.sent) {
      await alertPref.update({ lastDigestSentAt: new Date() });
      logger.info('Digest sent successfully', {
        userId,
        email: user.email,
        opportunityCount: opportunities.length,
        frequency,
      });
    } else {
      logger.warn('Digest email send failed', { userId, error: result.error });
    }

    return {
      sent: result.sent,
      opportunityCount: opportunities.length,
      error: result.error,
    };
  } catch (error) {
    logger.error('Digest generation failed for user', {
      userId,
      error: error.message,
    });
    return { sent: false, opportunityCount: 0, error: error.message };
  }
}

/**
 * Main entry point: process all users due for a digest email.
 * Processes in batches with delays to respect Gmail rate limits.
 */
async function processDigests() {
  const startTime = Date.now();
  logger.info('Email digest processing started');

  const dueUsers = await getUsersDueForDigest();
  logger.info(`Found ${dueUsers.length} users due for digest`);

  if (dueUsers.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, durationMs: Date.now() - startTime };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < dueUsers.length && processed < MAX_DIGESTS_PER_RUN; i += BATCH_SIZE) {
    const batch = dueUsers.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((pref) => sendDigestForUser(pref))
    );

    for (const result of results) {
      processed++;
      if (result.status === 'fulfilled') {
        if (result.value.sent) sent++;
        else if (result.value.reason === 'no_new_content') skipped++;
        else failed++;
      } else {
        failed++;
      }
    }

    if (i + BATCH_SIZE < dueUsers.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const durationMs = Date.now() - startTime;
  logger.info('Email digest processing complete', {
    processed, sent, skipped, failed, durationMs,
    capped: dueUsers.length > MAX_DIGESTS_PER_RUN,
  });

  return { processed, sent, skipped, failed, durationMs };
}

module.exports = {
  processDigests,
  sendDigestForUser,
  getUsersDueForDigest,
  getNewOpportunities,
  generateDigestSummary,
  scoreOpportunitiesForUser,
};
