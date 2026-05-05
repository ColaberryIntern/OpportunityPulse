// Execution Queue — operator-facing list of draft proposals,
// sorted by ROI/hour so the admin can ship the highest-yield row first.
//
// Distinct from /admin/opportunities/review (reviewer-detail). This is
// the triage screen: ROI ordering, no body text, fast Approve/Reject.
//
//   roi_per_hour = (opportunity.value × win_probability) / proposal_hours
//
// Win probability comes from v4's learning engine (read-only, persist=false).
// Effort comes from v3's effortEstimator. We pull the minimum data
// needed per row — a 50-row queue should resolve in well under a second.

const { Opportunity, OpportunityOutput } = require('../models');
const { estimateEffort } = require('./effortEstimator.service');
const { calculateWinProbability } = require('./winProbability.service');
const profileSvc = require('./profile.service');

// Pure: compute roi_per_hour given the inputs. Lifted for testability.
function computeRoiPerHour({ value, winProbability, proposalHours }) {
  const v = Number(value) || 0;
  const p = Number(winProbability) || 0;
  const h = Math.max(1, Number(proposalHours) || 4);
  return Math.round((v * p) / h);
}

async function listExecutionQueue({
  organizationId,
  userId = null,
  limit = 50,
  offset = 0,
  minRoi = null,
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));

  // 1. Pull all draft outputs (newest first; we'll re-sort by ROI below).
  const drafts = await OpportunityOutput.findAll({
    where: { status: 'draft' },
    order: [['createdAt', 'DESC']],
    limit: 500,
  });
  if (drafts.length === 0) {
    return { rows: [], total: 0, organization_id: orgId };
  }

  // 2. Hydrate parent opportunities in one query.
  const oppIds = [...new Set(drafts.map((d) => d.opportunityId))];
  const opps = await Opportunity.findAll({
    where: { id: oppIds },
    attributes: ['id', 'title', 'category', 'value', 'expiresAt', 'aiAnalysis'],
  });
  const oppMap = new Map();
  for (const o of opps) oppMap.set(o.id, o.toJSON ? o.toJSON() : o);

  // 3. For each draft, derive effort + win probability + ROI.
  const ranked = await Promise.all(drafts.map(async (d) => {
    const opp = oppMap.get(d.opportunityId);
    if (!opp) return null;
    const effort = estimateEffort(opp);
    const wp = await calculateWinProbability({
      opportunity: opp,
      organizationId: orgId,
      fitScore: (d.metadata && d.metadata.fit_score) || 0,
      effortScore: effort.effort_score,
      persist: false,
    });
    const roi = computeRoiPerHour({
      value: opp.value,
      winProbability: wp.win_probability,
      proposalHours: effort.proposal_hours,
    });
    return {
      output_id: d.id,
      opportunity_id: opp.id,
      title: opp.title,
      category: opp.category,
      value: Number(opp.value) || 0,
      effort_estimate: effort,
      win_probability: wp.win_probability,
      roi_per_hour: roi,
      expected_revenue: Math.round((Number(opp.value) || 0) * wp.win_probability),
      type: d.type,
      generated_at: d.createdAt,
      organization_id: orgId,
    };
  }));

  let rows = ranked.filter(Boolean);
  if (minRoi != null) rows = rows.filter((r) => r.roi_per_hour >= Number(minRoi));
  rows.sort((a, b) => b.roi_per_hour - a.roi_per_hour);

  const total = rows.length;
  const start = Number(offset) || 0;
  const stop = start + Math.min(Number(limit) || 50, 200);
  return {
    rows: rows.slice(start, stop),
    total,
    organization_id: orgId,
  };
}

module.exports = {
  listExecutionQueue,
  computeRoiPerHour,
};
