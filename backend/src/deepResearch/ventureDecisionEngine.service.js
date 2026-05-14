// Deep Research Phase 3 — build-vs-monitor decision engine.
//
// Deterministic + explainable. Given a venture's Phase 2 scores, the
// report's convergence + market timing, the monetization model set, and the
// Phase 3 execution readiness, it produces ONE decision from a fixed set —
// via an ordered rule list, so the rationale is always "the first rule that
// matched, and the factor values that triggered it". No AI, no hidden
// weighting; the decision is auditable.

const DECISIONS = [
  'BUILD_NOW', 'BUILD_SOON', 'MONITOR', 'TOO_EARLY',
  'OVERSATURATED', 'HIGH_RISK', 'NEEDS_VALIDATION',
];

// Tolerant field read.
function field(obj, snake, camel) {
  if (obj[snake] !== undefined && obj[snake] !== null) return obj[snake];
  if (obj[camel] !== undefined && obj[camel] !== null) return obj[camel];
  return undefined;
}

// Decide. `inputs` is everything the rules need, already extracted.
// Returns { decision, rationale, factors } — factors is the explainable
// breakdown of every value the rules looked at.
function decide(inputs) {
  const {
    compositeScore, executionScore, marketStage, correlationStrength,
    convergenceType, competitionSaturation, monetizationModelCount,
  } = inputs;

  // The ordered rule list — first match wins. Each rule names itself and the
  // condition that fired, so the rationale is fully traceable.
  const weakConvergence = ['research_only', 'none', 'diffuse', 'emerging_single'];

  let decision;
  let rationale;
  if (competitionSaturation < 30 && (marketStage === 'saturated' || marketStage === 'mainstream')) {
    decision = 'OVERSATURATED';
    rationale = `Competition-saturation room is low (${competitionSaturation}) in a `
      + `${marketStage} market — the space is crowded. Differentiation risk outweighs the upside.`;
  } else if (executionScore < 40) {
    decision = 'HIGH_RISK';
    rationale = `Execution readiness is ${executionScore} — Colaberry cannot realistically `
      + 'execute this yet. Technical complexity or weak market/operational readiness make it high-risk.';
  } else if (marketStage === 'emerging' && correlationStrength < 0.3) {
    decision = 'TOO_EARLY';
    rationale = `Market stage is emerging with only ${(correlationStrength * 100).toFixed(0)}% `
      + 'cross-channel correlation — the capability may exist but demand has not corroborated yet.';
  } else if (compositeScore < 50
    || (correlationStrength < 0.4 && weakConvergence.includes(convergenceType))) {
    decision = 'NEEDS_VALIDATION';
    rationale = `The signal is not yet strong enough to commit — venture composite ${compositeScore}, `
      + `correlation ${(correlationStrength * 100).toFixed(0)}%, convergence "${convergenceType}". `
      + 'Validate demand before building.';
  } else if (compositeScore >= 70 && executionScore >= 65
    && (marketStage === 'acceleration' || marketStage === 'breakout')) {
    decision = 'BUILD_NOW';
    rationale = `Strong on every axis — venture composite ${compositeScore}, execution readiness `
      + `${executionScore}, ${marketStage}-stage market. The window is open; build now.`;
  } else if (compositeScore >= 58 && executionScore >= 50) {
    decision = 'BUILD_SOON';
    rationale = `Solid fundamentals — venture composite ${compositeScore}, execution readiness `
      + `${executionScore} — but timing or readiness isn't quite at peak. Queue it to build soon.`;
  } else {
    decision = 'MONITOR';
    rationale = `Worth watching but not acting on yet — venture composite ${compositeScore}, `
      + `execution readiness ${executionScore}, ${marketStage}-stage market. Re-evaluate as signals shift.`;
  }

  return {
    decision,
    rationale,
    factors: {
      composite_score: compositeScore,
      execution_readiness_score: executionScore,
      market_stage: marketStage,
      correlation_strength: correlationStrength,
      convergence_type: convergenceType,
      competition_saturation: competitionSaturation,
      monetization_model_count: monetizationModelCount,
    },
  };
}

// Convenience wrapper — extracts the rule inputs from the domain objects
// (venture idea + report + execution readiness + monetization models).
function decideForVenture({
  ventureIdea, report = {}, executionReadiness = {}, monetizationModels = [],
}) {
  const scores = ventureIdea.scores || {};
  return decide({
    compositeScore: Number(field(ventureIdea, 'composite_score', 'compositeScore')) || 0,
    executionScore: Number(field(executionReadiness, 'execution_readiness_score', 'executionReadinessScore')) || 0,
    marketStage: report.marketStage || report.market_stage || 'unknown',
    correlationStrength: Number(report.correlationStrength || report.correlation_strength) || 0,
    convergenceType: (report.signalCorrelation && report.signalCorrelation.convergenceType)
      || (report.reportJson && report.reportJson.correlation && report.reportJson.correlation.convergence_type)
      || 'none',
    competitionSaturation: Number(scores.competition_saturation) || 50,
    monetizationModelCount: Array.isArray(monetizationModels) ? monetizationModels.length : 0,
  });
}

module.exports = {
  DECISIONS,
  decide,
  decideForVenture,
};
