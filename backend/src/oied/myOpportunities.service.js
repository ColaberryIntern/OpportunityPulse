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

  // Strategic Bonfire rows are synthesized clusters; their $ value comes
  // from a multi-field jsonb and is sometimes null. Carve them out of the
  // value floor so they always surface (matching the v9.1 ask: integrate
  // strategic clusters alongside individual opps without overshadowing).
  const where = {
    status: 'active',
    [Op.or]: [
      { value: { [Op.gte]: MIN_VALUE_USD } },
      { type: 'bonfire_strategic' },
    ],
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
    // Strategic Bonfire rows carry their own pre-computed score from
    // the strategist's cluster analysis (aiAnalysis.fit_score = the
    // strategic_score). Re-scoring them against the user profile would
    // tank their fitScore (their copy describes a synthesized cluster,
    // not a single service) and sink them to the bottom of the sort.
    // Use the embedded score directly + a small +5 priority boost
    // (capped at 95) so they integrate alongside individual rows.
    let fit;
    let breakdown;
    let priorityScore;
    let urgency;
    let revenueVelocity;
    let bucket;

    if (opp.type === 'bonfire_strategic') {
      const ai = opp.aiAnalysis || {};
      fit = Number(ai.fit_score || ai.strategic_score || opp.aiScore || 70);
      // Hard cap at 75 — strictly below act_now (>=80). Strategic rows
      // always surface (they default into high_value when score >= 60)
      // but never crowd the act_now top slots, which stay reserved for
      // time-pressured individual opps. Mirrors the cap in
      // bonfireStrategicSync.STRATEGIC_PRIORITY_CAP.
      priorityScore = Math.min(75, Math.max(0, Number(ai.strategic_score || ai.fit_score || opp.aiScore || 60)));
      urgency = 60; // never trigger urgency >= 90 act_now path either
      revenueVelocity = null;
      bucket = priorityScore >= 60 ? 'high_value' : 'standard';
      breakdown = {
        service_match: 25,        // strategic = "we built this for you"
        revenue_weight: 18,
        automation_score: 15,
        repeatability_score: 14,
        ease_of_entry: 8,
        strategic_alignment: 15,
      };
    } else {
      let score = cacheMap.get(opp.id);
      if (!score) {
        score = await getOrCreateFitScore({ opportunity: opp, userProfile, organizationId: orgId });
      }
      fit = score.fitScore != null ? score.fitScore : score.fit_score;
      if (minScore != null && fit < Number(minScore)) continue;

      const computed = calculatePriorityScore({
        opportunity: opp,
        fitScore: fit,
        breakdown: {
          service_match: score.serviceMatch ?? score.service_match,
          revenue_weight: score.revenueWeight ?? score.revenue_weight,
          automation_score: score.automationScore ?? score.automation_score,
          repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
          ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
          strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
        },
      });
      priorityScore = computed.priorityScore;
      urgency = computed.urgency;
      revenueVelocity = computed.revenueVelocity;
      bucket = computed.bucket;
      breakdown = {
        service_match: score.serviceMatch ?? score.service_match,
        revenue_weight: score.revenueWeight ?? score.revenue_weight,
        automation_score: score.automationScore ?? score.automation_score,
        repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
        ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
        strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
      };
    }

    if (minScore != null && fit < Number(minScore)) continue;

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
      fitBreakdown: breakdown,
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

// v7: single-opportunity enrichment for the bridge's GET /opportunities/:id.
// Runs the same profile → fit → priority/bucket → effort pipeline as
// listMyOpportunities, but for one opp.
async function enrichOpportunity({ opportunity, organizationId, userId = null } = {}) {
  if (!opportunity) return null;
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  const userProfile = await profileSvc.getOrDefaultByOrg(orgId);
  const score = await getOrCreateFitScore({
    opportunity, userProfile, organizationId: orgId,
  });
  const fit = score.fitScore != null ? score.fitScore : score.fit_score;
  const breakdown = {
    service_match: score.serviceMatch ?? score.service_match,
    revenue_weight: score.revenueWeight ?? score.revenue_weight,
    automation_score: score.automationScore ?? score.automation_score,
    repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
    ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
    strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
  };
  const { priorityScore, urgency, revenueVelocity, bucket } =
    calculatePriorityScore({ opportunity, fitScore: fit, breakdown });
  const effort = estimateEffort(opportunity);
  return {
    ...(opportunity.toJSON ? opportunity.toJSON() : opportunity),
    fitScore: fit,
    priorityScore,
    urgency,
    revenueVelocity,
    bucket,
    effortEstimate: effort,
    fitBreakdown: breakdown,
    organization_id: orgId,
  };
}

module.exports = { listMyOpportunities, topByFitScore, enrichOpportunity, MIN_VALUE_USD };
