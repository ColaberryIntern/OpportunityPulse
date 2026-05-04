// "My Opportunities" — backed by the unified opportunities table, scored
// against the calling user's profile (profile.getOrDefault if none exists),
// then sorted by priority_score DESC (falls back to fit_score).

const { Op } = require('sequelize');
const { Opportunity, OpportunityFitScore } = require('../models');
const { getOrCreateFitScore, profileHash } = require('./fitScoring.service');
const { calculatePriorityScore } = require('./priorityScoring.service');
const profileSvc = require('./profile.service');
const { estimateEffort } = require('./effortEstimator.service');

const MIN_VALUE_USD = 1000;

async function listMyOpportunities({
  limit = 50,
  offset = 0,
  type,
  minScore,
  userId,           // who's asking — resolved to org via profile.service
  organizationId,   // explicit org override (multi-tenant callers)
} = {}) {
  const orgId = organizationId || await profileSvc.resolveOrgId(userId);
  const userProfile = await profileSvc.getOrDefaultByOrg(orgId);

  const where = {
    status: 'active',
    value: { [Op.gte]: MIN_VALUE_USD },
  };
  if (type) where.type = type;

  const candidates = await Opportunity.findAll({
    where,
    order: [['updatedAt', 'DESC']],
    limit: 2000,
  });

  const hash = profileHash(userProfile);
  // Cache scoped by (org_id, opportunity_id, profile_hash). Older rows
  // pre-v4 carry org_id=1 from the migration backfill.
  const cached = await OpportunityFitScore.findAll({
    where: {
      opportunityId: candidates.map((c) => c.id),
      profileHash: hash,
      organizationId: orgId,
    },
  });
  const cacheMap = new Map();
  for (const c of cached) cacheMap.set(c.opportunityId, c);

  const scored = [];
  for (const opp of candidates) {
    let score = cacheMap.get(opp.id);
    if (!score) {
      score = await getOrCreateFitScore({ opportunity: opp, userProfile, organizationId: orgId });
    }
    const fit = score.fitScore != null ? score.fitScore : score.fit_score;
    if (minScore != null && fit < Number(minScore)) continue;

    // Priority + bucket are computed at read time so we don't need to
    // re-cache rows when the bucket thresholds change.
    const { priorityScore, urgency, revenueVelocity, bucket } =
      calculatePriorityScore({ opportunity: opp, fitScore: fit, breakdown: {
        service_match: score.serviceMatch ?? score.service_match,
        revenue_weight: score.revenueWeight ?? score.revenue_weight,
        automation_score: score.automationScore ?? score.automation_score,
        repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
        ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
        strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
      } });

    // v3: attach effort estimate so the UI / recommendation engine
    // doesn't need a second pass.
    const effort = estimateEffort(opp);

    scored.push({
      ...opp.toJSON(),
      fitScore: fit,
      priorityScore,
      urgency,
      revenueVelocity,
      bucket,
      effortEstimate: effort,
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
  // Sort by priority desc, then fit desc as tiebreaker.
  scored.sort((a, b) => {
    const pd = (b.priorityScore || 0) - (a.priorityScore || 0);
    if (pd !== 0) return pd;
    return (b.fitScore || 0) - (a.fitScore || 0);
  });

  const start = Number(offset) || 0;
  const stop = start + (Math.min(Number(limit) || 50, 200));
  return {
    rows: scored.slice(start, stop),
    total: scored.length,
    profileWasDefault: !!userProfile._isDefault,
    organizationId: orgId,
  };
}

async function topByFitScore({ n = 5, userId, organizationId } = {}) {
  const { rows } = await listMyOpportunities({ limit: n, offset: 0, userId, organizationId });
  return rows;
}

module.exports = { listMyOpportunities, topByFitScore, MIN_VALUE_USD };
