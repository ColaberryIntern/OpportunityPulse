// Recommendation Engine — "Cory Lite". Pure deterministic ranker
// (no LLM): pulls the user's My Opportunities feed, computes
//   recommendation_score = priority_score × win_probability / effort_factor
// and returns the top N (default 3).
//
// Win-probability is heuristic — until we have ≥30 won/lost data points
// to calibrate, we use a baseline rate plus small boosts for category
// fit and high fitScore.

const myOppsSvc = require('./myOpportunities.service');
const { estimateEffort } = require('./effortEstimator.service');
const { getConversionStats, topWonCategories } = require('./events.service');

const BASELINE_WIN_RATE = 0.20;
const INDUSTRY_BOOST = 0.10;
const FIT_BOOST = 0.05;

function winProbabilityFor(opp, stats, wonCategories) {
  const baseRate = stats.win_rate != null ? stats.win_rate : BASELINE_WIN_RATE;
  const inWonCat = wonCategories.includes(opp.category);
  const industryBoost = inWonCat ? INDUSTRY_BOOST : 0;
  const fitBoost = (opp.fitScore || 0) >= 70 ? FIT_BOOST : 0;
  const raw = baseRate + industryBoost + fitBoost;
  // Floor at 5% (so even a long-shot row gets ranked) and cap at 85%.
  return Math.max(0.05, Math.min(0.85, raw));
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
  // Effort score 50 = neutral (divisor = 1). Higher effort → divisor > 1
  // → score gets penalized. Lower effort → divisor < 1 → score boosted.
  // Floor at 0.5 so even ultra-low-effort rows don't dominate by 10x.
  return Math.max(0.5, (effortScore || 50) / 50);
}

async function getTopActions(userId, { limit = 3, now = new Date() } = {}) {
  // Pull a generous window from My Opps (already profile-scored + bucketed).
  const { rows } = await myOppsSvc.listMyOpportunities({
    userId, limit: 50, offset: 0,
  });
  if (!rows || rows.length === 0) return [];

  const stats = await getConversionStats({
    since: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
  });
  const wonCategories = await topWonCategories({ limit: 3 });

  const ranked = rows.map((opp) => {
    const effort = estimateEffort(opp);
    const winProb = winProbabilityFor(opp, stats, wonCategories);
    const divisor = effortDivisor(effort.effort_score);
    const score = (Number(opp.priorityScore) || 0) * winProb / divisor;
    return {
      opportunity_id: opp.id,
      title: opp.title,
      category: opp.category,
      reason: buildReason(opp, effort),
      expected_value: Number(opp.value) || 0,
      urgency: Number(opp.urgency) || 0,
      effort_estimate: effort,
      win_probability: Number(winProb.toFixed(3)),
      recommendation_score: Number(score.toFixed(2)),
      // Pass through bucket + priority for the UI to render alongside.
      bucket: opp.bucket,
      priority_score: Number(opp.priorityScore) || 0,
      fit_score: Number(opp.fitScore) || 0,
    };
  });

  ranked.sort((a, b) => b.recommendation_score - a.recommendation_score);
  return ranked.slice(0, Math.max(1, Math.min(limit, 10)));
}

module.exports = {
  getTopActions,
  winProbabilityFor,
  buildReason,
  effortDivisor,
  BASELINE_WIN_RATE,
};
