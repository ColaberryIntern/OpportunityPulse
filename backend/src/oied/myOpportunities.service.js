// "My Opportunities" — the OIED-curated view backing /admin/opportunities/my.
//
// Filters: status='active', value >= 1000, must be enriched.
// Order:   fit_score DESC (cached in opportunity_fit_scores).
//
// On read, ensures every returned row has a fit-score row in
// opportunity_fit_scores (lazy-compute, deterministic, no AI calls).

const { Op } = require('sequelize');
const {
  Opportunity,
  OpportunityFitScore,
  sequelize,
} = require('../models');
const { getOrCreateFitScore, profileHash, DEFAULT_PROFILE } = require('./fitScoring.service');

const MIN_VALUE_USD = 1000;

async function listMyOpportunities({
  limit = 50,
  offset = 0,
  type,
  minScore,
  profile = DEFAULT_PROFILE,
} = {}) {
  const where = {
    status: 'active',
    value: { [Op.gte]: MIN_VALUE_USD },
  };
  if (type) where.type = type;

  // Pull a wide candidate set, score+filter in JS, then paginate. The unified
  // opportunities table is big (>11k) but the value+status filter cuts it
  // massively, and we don't want a left-join to fit-scores hammering pagination.
  // For each candidate we compute (or read cached) the fit score, filter by
  // minScore, sort, paginate.
  //
  // Performance note: at 11k rows this is fine in-process. If scale grows,
  // move scoring into a background job that updates the cache and then a
  // simple JOIN+ORDER replaces this loop.
  const candidates = await Opportunity.findAll({
    where,
    order: [['updatedAt', 'DESC']],
    limit: 2000, // sane upper bound for in-memory scoring
  });

  const hash = profileHash(profile);
  // Bulk-fetch any cached scores for this profile.
  const cached = await OpportunityFitScore.findAll({
    where: {
      opportunityId: candidates.map((c) => c.id),
      profileHash: hash,
    },
  });
  const cacheMap = new Map();
  for (const c of cached) cacheMap.set(c.opportunityId, c);

  const scored = [];
  for (const opp of candidates) {
    let score = cacheMap.get(opp.id);
    if (!score) {
      score = await getOrCreateFitScore({ opportunity: opp, profile });
    }
    const fit = score.fitScore != null ? score.fitScore : score.fit_score;
    if (minScore != null && fit < Number(minScore)) continue;
    scored.push({
      ...opp.toJSON(),
      fitScore: fit,
      fitBreakdown: {
        service_match: score.serviceMatch ?? score.service_match,
        revenue_weight: score.revenueWeight ?? score.revenue_weight,
        automation_score: score.automationScore ?? score.automation_score,
        repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
        ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
        strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
      },
    });
  }
  scored.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));

  const start = Number(offset) || 0;
  const stop = start + (Math.min(Number(limit) || 50, 200));
  return {
    rows: scored.slice(start, stop),
    total: scored.length,
  };
}

// Top-N by fit score — used by the daily email digest.
async function topByFitScore({ n = 5, profile = DEFAULT_PROFILE } = {}) {
  const { rows } = await listMyOpportunities({
    limit: n,
    offset: 0,
    profile,
  });
  return rows;
}

module.exports = {
  listMyOpportunities,
  topByFitScore,
  MIN_VALUE_USD,
};
