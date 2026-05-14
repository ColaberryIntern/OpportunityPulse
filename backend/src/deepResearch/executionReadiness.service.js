// Deep Research Phase 3 — execution readiness engine.
//
// Deterministic. Answers "can Colaberry realistically execute this venture?"
// It does NOT touch AI — every sub-score is computed from the venture idea's
// own fields, its Phase 2 venture scores, and the parent report's strategic
// signal. All sub-scores are 0-100 where higher = more ready / lower risk,
// so they compose cleanly into the weighted execution_readiness_score.
//
// It also derives a concrete MVP timeline estimate, a staffing profile, and
// an infrastructure profile — all deterministic functions of the same inputs.

// The sub-score weights — the readiness model. Sum to 1.0.
const WEIGHTS = {
  technical_complexity: 0.30, // (as a readiness score: higher = simpler to build)
  ai_dependency_risk: 0.20, // (as a readiness score: higher = less fragile AI dependency)
  market_readiness: 0.25,
  operational_readiness: 0.25,
};

// Market stage → market readiness 0-100.
const STAGE_MARKET_READINESS = {
  emerging: 45, acceleration: 78, breakout: 92, mainstream: 80, saturated: 50, declining: 28, unknown: 40,
};

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Tolerant field read — venture ideas arrive snake_case (pre-persist) or
// camelCase (persisted model).
function field(idea, snake, camel) {
  if (idea[snake] !== undefined && idea[snake] !== null) return idea[snake];
  if (idea[camel] !== undefined && idea[camel] !== null) return idea[camel];
  return undefined;
}

// Estimate the MVP timeline in weeks from the technical-complexity readiness.
// High readiness (simple build) → ~6 weeks; low readiness → ~22 weeks.
function estimateTimelineWeeks(technicalReadiness) {
  const t = clamp100(technicalReadiness);
  // Linear map: 100 → 6 weeks, 0 → 22 weeks.
  return Math.round(22 - (t / 100) * 16);
}

// Derive a staffing profile from the overall readiness + complexity.
function deriveStaffing(technicalReadiness, executionScore) {
  const roles = ['Tech lead', 'Full-stack engineer'];
  if (technicalReadiness < 70) roles.push('AI/ML engineer');
  if (technicalReadiness < 50) roles.push('Second engineer');
  if (executionScore >= 60) roles.push('Product owner (part-time)');
  if (executionScore < 45) roles.push('Solution architect (advisory)');
  return { roles, headcount: roles.length };
}

// Derive an infrastructure profile.
function deriveInfrastructure(idea, technicalReadiness) {
  const items = ['Application hosting (container)', 'Postgres database', 'Structured logging + health endpoint'];
  const meta = idea.metadata || {};
  const arch = String(meta.suggested_architecture || '').toLowerCase();
  if (arch.includes('vector') || arch.includes('embedding') || arch.includes('search')) {
    items.push('Vector / embedding store');
  }
  if (technicalReadiness < 70) items.push('AI provider account + budget');
  items.push('CI pipeline');
  return { items };
}

// Compute the execution readiness assessment for a venture idea.
// `report` is optional context (marketStage, correlationStrength).
function assessExecutionReadiness(idea, { report = {} } = {}) {
  const buildability01 = Number(field(idea, 'buildability_score', 'buildabilityScore')) || 0;
  const scores = idea.scores || {};
  const compositeScore = Number(field(idea, 'composite_score', 'compositeScore')) || 0;
  const marketStage = report.marketStage || (report.market_stage) || 'unknown';
  const correlationStrength = Number(report.correlationStrength || report.correlation_strength) || 0;

  // --- technical complexity (as a readiness score) ---
  // High buildability + high technical_feasibility = simple to build = ready.
  const technicalComplexity = clamp100(
    buildability01 * 55 + (scores.technical_feasibility || 50) * 0.45,
  );

  // --- AI dependency risk (as a readiness score: higher = safer) ---
  // A highly buildable venture leans less on bleeding-edge AI; a low-
  // buildability one is more fragile. ai_defensibility (the moat) cuts both
  // ways — some dependency is acceptable when it's also the moat.
  const aiDependencyRisk = clamp100(
    buildability01 * 60 + (scores.ai_defensibility || 50) * 0.25 + 15,
  );

  // --- market readiness ---
  const marketReadiness = clamp100(
    (STAGE_MARKET_READINESS[marketStage] || 40) * 0.7 + (correlationStrength * 100) * 0.3,
  );

  // --- operational readiness ---
  // Can we actually sell + run it? Commercialization + gov alignment + a
  // clear target customer.
  const hasTargetCustomer = !!(idea.metadata && idea.metadata.target_customers);
  const operationalReadiness = clamp100(
    (scores.commercialization || 50) * 0.45
    + (scores.gov_alignment || 40) * 0.25
    + (compositeScore || 50) * 0.2
    + (hasTargetCustomer ? 10 : 0),
  );

  const subScores = {
    technical_complexity: technicalComplexity,
    ai_dependency_risk: aiDependencyRisk,
    market_readiness: marketReadiness,
    operational_readiness: operationalReadiness,
  };

  let executionScore = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) executionScore += (subScores[k] || 0) * w;
  executionScore = Number(executionScore.toFixed(2));

  const mvpTimelineWeeks = estimateTimelineWeeks(technicalComplexity);
  const staffing = deriveStaffing(technicalComplexity, executionScore);
  const infrastructure = deriveInfrastructure(idea, technicalComplexity);

  const verdict = executionScore >= 70 ? 'Colaberry can execute this now with a small team.'
    : executionScore >= 50 ? 'Executable, but expect a longer build and some staffing-up.'
      : 'Executing this is a stretch — significant complexity or weak market readiness.';
  const rationale = `${verdict} Technical complexity readiness ${technicalComplexity}, `
    + `AI-dependency safety ${aiDependencyRisk}, market readiness ${marketReadiness}, `
    + `operational readiness ${operationalReadiness}. Estimated MVP timeline ~${mvpTimelineWeeks} weeks `
    + `with ${staffing.headcount} people.`;

  return {
    execution_readiness_score: executionScore,
    mvp_timeline_weeks: mvpTimelineWeeks,
    technical_complexity: technicalComplexity,
    ai_dependency_risk: aiDependencyRisk,
    market_readiness: marketReadiness,
    operational_readiness: operationalReadiness,
    staffing,
    infrastructure,
    breakdown: { ...subScores, weights: WEIGHTS },
    rationale,
  };
}

module.exports = {
  WEIGHTS,
  STAGE_MARKET_READINESS,
  estimateTimelineWeeks,
  deriveStaffing,
  deriveInfrastructure,
  assessExecutionReadiness,
};
