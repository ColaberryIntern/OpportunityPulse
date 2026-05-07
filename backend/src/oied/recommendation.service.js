// Recommendation Engine — "Cory Lite". Pure deterministic ranker
// (no LLM): pulls the user's My Opportunities feed, computes
//   recommendation_score = priority_score × win_probability / effort_factor
// and returns the top N (default 3).
//
// v4: win-probability is now history-driven via winProbability.service.
// Same baseline (20%) when there's no outcome data, but adjusts as
// won/lost events accrue per category / deal size / effort similarity.
// The legacy winProbabilityFor() is kept as a thin wrapper so existing
// tests + callers don't break.

const myOppsSvc = require('./myOpportunities.service');
const { estimateEffort } = require('./effortEstimator.service');
const { calculateWinProbability, computeProbabilityFromHistory } = require('./winProbability.service');
const profileSvc = require('./profile.service');

// Legacy v3 surface — used by tests that assert the heuristic shape.
// Now backed by the same pure-function core.
function winProbabilityFor(opp, stats, wonCategories) {
  // Translate v3-style stats + wonCategories into outcome rows the
  // pure core understands. With no per-row outcomes available, we
  // approximate from the rolled-up counts so legacy tests still
  // exercise the same probability bands.
  const outcomes = [];
  if (stats && stats.win_rate != null) {
    // Distribute stats counts across synthetic rows that match the
    // candidate's category iff it's in wonCategories.
    const won = stats.won || 0;
    const lost = stats.lost || 0;
    const sameCat = wonCategories && wonCategories.includes(opp.category);
    for (let i = 0; i < won;  i += 1) {
      outcomes.push({ eventType: 'won',  opportunity: { category: sameCat ? opp.category : 'other', value: opp.value, effortScore: 50 } });
    }
    for (let i = 0; i < lost; i += 1) {
      outcomes.push({ eventType: 'lost', opportunity: { category: sameCat ? opp.category : 'other', value: opp.value, effortScore: 50 } });
    }
  } else if (wonCategories && wonCategories.includes(opp.category)) {
    // Pre-v4 behavior: a single synthetic win in same category boosts.
    outcomes.push({ eventType: 'won', opportunity: { category: opp.category, value: opp.value, effortScore: 50 } });
  }
  const out = computeProbabilityFromHistory({
    candidate: { category: opp.category, value: opp.value, fitScore: opp.fitScore || 0, effortScore: 50 },
    outcomes,
  });
  return out.win_probability;
}

// Build a one-line "why this matters" string from the dominant signal.
function buildReason(opp, effort) {
  const parts = [];
  if (opp.urgency >= 90) parts.push(`closes in ≤7 days`);
  else if (opp.urgency >= 65) parts.push(`closes within 30 days`);

  const value = Number(opp.value || 0);
  if (value >= 1_000_000) parts.push(`$${Math.round(value / 1_000_000)}M opportunity`);
  else if (value >= 100_000) parts.push(`$${Math.round(value / 1_000)}k opportunity`);

  if ((opp.fitScore || 0) >= 70) parts.push('strong profile fit');
  if (effort.effort_score <= 35) parts.push('low effort to bid');
  if (opp.bucket === 'quick_win') parts.push('quick win');

  return parts.length ? parts.join(' · ') : 'matches your profile';
}

function effortDivisor(effortScore) {
  return Math.max(0.5, (effortScore || 50) / 50);
}

async function getTopActions(userId, {
  limit = 3,
  now = new Date(),
  organizationId,
  persistHistory = true,
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));

  // Strategic clusters are now bucketed separately on My Opps (their
  // own 'strategic_pattern' bucket). They no longer dominate the top
  // priority slice, so a smaller pool is fine. 250-row pulls were
  // hitting nginx 60s timeout on the recommendations endpoint.
  const { rows: allRows } = await myOppsSvc.listMyOpportunities({
    userId, organizationId: orgId, limit: 50, offset: 0,
  });
  // Exclude Bonfire strategic clusters from Top Actions — clusters are
  // patterns to consider, not atomic actions Ali should "do today".
  // They appear in My Opps' Strategic Patterns strip and the OIED
  // dashboard. Top Actions stays focused on actionable individual opps.
  const rows = (allRows || []).filter((r) => r.type !== 'bonfire_strategic');
  if (!rows || rows.length === 0) return [];

  // Compute win probability per row using the learning engine. We persist
  // a history snapshot per recommendation emit so we can audit how
  // predictions shift as outcomes accrue.
  const ranked = await Promise.all(rows.map(async (opp) => {
    const effort = estimateEffort(opp);
    const wp = await calculateWinProbability({
      opportunity: opp,
      organizationId: orgId,
      fitScore: opp.fitScore,
      effortScore: effort.effort_score,
      now,
      persist: persistHistory,
    });
    const divisor = effortDivisor(effort.effort_score);
    const score = (Number(opp.priorityScore) || 0) * wp.win_probability / divisor;
    return {
      opportunity_id: opp.id,
      title: opp.title,
      category: opp.category,
      reason: buildReason(opp, effort),
      expected_value: Number(opp.value) || 0,
      urgency: Number(opp.urgency) || 0,
      effort_estimate: effort,
      win_probability: wp.win_probability,
      win_probability_components: wp.components,
      recommendation_score: Number(score.toFixed(2)),
      bucket: opp.bucket,
      priority_score: Number(opp.priorityScore) || 0,
      fit_score: Number(opp.fitScore) || 0,
      organization_id: orgId,
    };
  }));

  ranked.sort((a, b) => b.recommendation_score - a.recommendation_score);
  return ranked.slice(0, Math.max(1, Math.min(limit, 10)));
}

module.exports = {
  getTopActions,
  winProbabilityFor,
  buildReason,
  effortDivisor,
  BASELINE_WIN_RATE: 0.20,
};
