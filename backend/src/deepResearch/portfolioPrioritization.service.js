// Deep Research Phase 4 — portfolio prioritization engine.
//
// NOT venture scoring (that's Phase 2). This engine evaluates which ventures
// should consume ORGANIZATIONAL CAPACITY right now — same venture can be a
// strong individual bet but a poor portfolio pick if resource pressure is
// already maxed or if a better-positioned venture should go first.
//
// Fully deterministic + explainable. Every factor is a named, weighted
// contribution; the rationale lists the factor values that produced the
// rank.

const { v4: uuid } = (() => {
  try { return { v4: () => require('crypto').randomUUID() }; }
  catch (e) { return { v4: () => `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }; }
})();
const {
  VentureIdea, ExecutionReadiness, RoiForecast, PortfolioScore,
  InfrastructureOverlap,
} = require('../models');

const WEIGHTS = {
  composite_score: 0.20, // individual venture merit
  execution_readiness: 0.25, // can we actually do it
  decision_weight: 0.15, // build-vs-monitor recommendation
  roi_potential: 0.15, // realistic 12mo ROI
  resource_pressure_penalty: -0.10, // capacity already strained
  infrastructure_reuse_bonus: 0.05, // shared components help
  timing_alignment: 0.10, // breakout/acceleration markets
};

const DECISION_WEIGHT = {
  BUILD_NOW: 100, BUILD_SOON: 75, MONITOR: 45, NEEDS_VALIDATION: 35,
  TOO_EARLY: 25, OVERSATURATED: 10, HIGH_RISK: 5,
};

const STAGE_TIMING = {
  breakout: 100, acceleration: 85, mainstream: 65, emerging: 55, saturated: 30, declining: 15, unknown: 40,
};

const clamp100 = (n) => Math.max(0, Math.min(100, n));

// Map a 12-month ROI ratio onto 0-100. ROI of 1.0 (broke even on costs in
// the first year) maps to ~75; ROI of 2.0 to ~95; negative ROI to <50.
function roiPotentialScore(roi) {
  if (roi == null) return 40;
  const v = Number(roi);
  if (Number.isNaN(v)) return 40;
  return clamp100(50 + Math.tanh(v / 1.5) * 50);
}

// Penalty for org-wide capacity pressure. Soft below 60, sharp above.
function resourcePressurePenaltyScore(staffingPressure) {
  const p = Number(staffingPressure) || 0;
  if (p < 60) return p * 0.3; // small constant drag
  return clamp100((p - 60) * 2.5 + 18); // sharply rising
}

// Bonus for being part of a shared-infrastructure cluster.
function infrastructureReuseBonusScore(ventureId, overlapMap) {
  const overlaps = overlapMap.get(ventureId) || [];
  if (overlaps.length === 0) return 0;
  // Sum of overlap scores, scaled — more shared partners is more bonus.
  const total = overlaps.reduce((s, o) => s + Number(o.overlap_score || o.overlapScore || 0), 0);
  return clamp100(total * 80);
}

// Score one venture across the factor model and return the explainable
// breakdown.
function scoreVenture(inputs) {
  const {
    compositeScore, executionScore, decision, marketStage, roi12mo,
    staffingPressure, reuseBonus,
  } = inputs;

  const composite01 = clamp100(Number(compositeScore) || 0);
  const exec01 = clamp100(Number(executionScore) || 0);
  const decisionScore = DECISION_WEIGHT[decision] || DECISION_WEIGHT.MONITOR;
  const roiScore = roiPotentialScore(roi12mo);
  const pressureScore = resourcePressurePenaltyScore(staffingPressure);
  const timingScore = STAGE_TIMING[marketStage] || STAGE_TIMING.unknown;

  const factors = {
    composite_score: composite01,
    execution_readiness: exec01,
    decision_weight: decisionScore,
    roi_potential: roiScore,
    resource_pressure_penalty: pressureScore,
    infrastructure_reuse_bonus: reuseBonus,
    timing_alignment: timingScore,
  };
  // The composite — sum of weighted factors. Note one weight is negative.
  let portfolio = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) portfolio += (factors[k] || 0) * w;
  // The +base ensures the resource pressure penalty alone can never push a
  // strong venture into the negatives.
  portfolio = clamp100(portfolio + 20);
  return { portfolio_score: Number(portfolio.toFixed(2)), factors };
}

// Translate a portfolio score into a sequencing recommendation.
function sequencingFromScore(score, decision) {
  if (decision === 'OVERSATURATED' || decision === 'HIGH_RISK') return 'pass';
  if (decision === 'TOO_EARLY') return 'monitor';
  if (score >= 75 && decision === 'BUILD_NOW') return 'execute_now';
  if (score >= 60) return 'queue';
  if (score >= 45) return 'defer';
  return 'monitor';
}

// Build the rationale string from the factor values that drove the score.
function buildRationale(score, factors, decision, recommendation) {
  const top = Object.entries(factors)
    .filter(([k]) => k !== 'resource_pressure_penalty')
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  const drivers = top.map((t) => `${t.k.replace(/_/g, ' ')} ${Math.round(t.v)}`).join(', ');
  const pressure = Math.round(factors.resource_pressure_penalty || 0);
  return `Portfolio rank ${Math.round(score)} (${recommendation}, decision ${decision}). `
    + `Top drivers: ${drivers}. Resource-pressure drag: ${pressure}.`;
}

// Rank the whole portfolio. Pure given the inputs.
function rankPortfolio({
  ventureIdeas, readinessByVenture, latestRoiByVenture, capacitySnapshot, overlapMap,
}) {
  const staffingPressure = capacitySnapshot ? Number(capacitySnapshot.staffing_pressure
    || capacitySnapshot.staffingPressure) || 0 : 0;

  const scored = ventureIdeas.map((v) => {
    const er = readinessByVenture.get(v.id);
    const decision = er && er.breakdown && er.breakdown.decision
      ? er.breakdown.decision.decision : null;
    const roi12mo = latestRoiByVenture.get(v.id);
    const result = scoreVenture({
      compositeScore: Number(v.compositeScore) || 0,
      executionScore: er ? Number(er.executionReadinessScore) || 0 : 0,
      decision,
      marketStage: v.marketStage || (er && er.breakdown && er.breakdown.market_stage),
      roi12mo,
      staffingPressure,
      reuseBonus: infrastructureReuseBonusScore(v.id, overlapMap),
    });
    return {
      venture_idea_id: v.id,
      title: v.title,
      portfolio_score: result.portfolio_score,
      factors: result.factors,
      decision,
    };
  });

  scored.sort((a, b) => b.portfolio_score - a.portfolio_score);
  scored.forEach((r, i) => {
    r.portfolio_rank = i + 1;
    r.sequencing_recommendation = sequencingFromScore(r.portfolio_score, r.decision);
    r.rationale = buildRationale(r.portfolio_score, r.factors, r.decision, r.sequencing_recommendation);
  });
  return scored;
}

// Run + persist the ranking. Returns the ranked list under a fresh run_id.
async function runPrioritization(capacitySnapshot, latestForecast) {
  const runId = uuid();
  const ventureIdeas = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));

  // Realistic ROI per venture from the latest forecast.
  const latestRoiByVenture = new Map();
  if (latestForecast && latestForecast.per_venture) {
    for (const [vid, scenarios] of Object.entries(latestForecast.per_venture)) {
      const real = scenarios.realistic || {};
      latestRoiByVenture.set(Number(vid), Number(real.projectedRoi12mo
        || real.projected_roi_12mo || 0));
    }
  }

  // Overlap map for the reuse bonus.
  const overlapRows = await InfrastructureOverlap.findAll();
  const overlapMap = new Map();
  for (const o of overlapRows) {
    if (!overlapMap.has(o.ventureAId)) overlapMap.set(o.ventureAId, []);
    if (!overlapMap.has(o.ventureBId)) overlapMap.set(o.ventureBId, []);
    overlapMap.get(o.ventureAId).push(o);
    overlapMap.get(o.ventureBId).push(o);
  }

  const ranked = rankPortfolio({
    ventureIdeas, readinessByVenture, latestRoiByVenture, capacitySnapshot, overlapMap,
  });

  for (const r of ranked) {
    // eslint-disable-next-line no-await-in-loop
    await PortfolioScore.create({
      ventureIdeaId: r.venture_idea_id,
      portfolioScore: r.portfolio_score,
      portfolioRank: r.portfolio_rank,
      sequencingRecommendation: r.sequencing_recommendation,
      factors: r.factors,
      rationale: r.rationale,
      runId,
    });
  }
  return { run_id: runId, ranking: ranked };
}

// Read the latest ranking.
async function getLatestRanking() {
  const latest = await PortfolioScore.findOne({ order: [['created_at', 'DESC']], attributes: ['runId'] });
  if (!latest) return null;
  const rows = await PortfolioScore.findAll({
    where: { runId: latest.runId },
    order: [['portfolio_rank', 'ASC']],
  });
  return { run_id: latest.runId, ranking: rows.map((r) => r.toJSON()) };
}

module.exports = {
  WEIGHTS,
  DECISION_WEIGHT,
  STAGE_TIMING,
  roiPotentialScore,
  resourcePressurePenaltyScore,
  infrastructureReuseBonusScore,
  scoreVenture,
  sequencingFromScore,
  rankPortfolio,
  runPrioritization,
  getLatestRanking,
};
