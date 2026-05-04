// Effort Estimator — pure deterministic heuristics (no LLM, no I/O).
// Returns proposal hours, build days, and a 0-100 effortScore (low =
// less effort) so the recommendation engine can divide by it.
//
// All values are intentionally rounded to integers — these are decision
// signals, not project plans.

const COMPLEXITY_HINTS = /(compliance|certification|cybersecurity|hipaa|fedramp|secret|clearance|audit)/i;

// Build days by AI category, in roughly ascending order of effort. Anything
// not in the map falls back to BUILD_DAYS_DEFAULT.
const BUILD_DAYS_BY_CATEGORY = {
  staffing: 7,
  'data analytics': 21,
  'ai-systems': 21,
  'it services': 30,
  software: 30,
  consulting: 21,
  automation: 21,
  compliance: 45,
  audit: 45,
  construction: 60,
  facilities: 60,
};
const BUILD_DAYS_DEFAULT = 21;

function estimateProposalHours(opp) {
  const text = `${opp.title || ''} ${opp.description || ''}`;
  let hours = 4; // base
  if ((opp.description || '').length > 2000) hours += 2;
  if (COMPLEXITY_HINTS.test(text)) hours += 2;
  if (!opp.aiAnalysis || !opp.aiAnalysis.recommended_product) hours += 1;
  return Math.min(16, hours);
}

function estimateBuildDays(opp) {
  const ai = opp.aiAnalysis || {};
  const cat = String(ai.ai_category || opp.category || '').trim().toLowerCase();
  let days = BUILD_DAYS_BY_CATEGORY[cat] != null
    ? BUILD_DAYS_BY_CATEGORY[cat]
    : BUILD_DAYS_DEFAULT;
  // High automation potential cuts build time on software-shaped categories.
  const auto = Number(ai.automation_potential || 0);
  if (auto >= 80 && days >= 21) days -= 10;
  return Math.max(3, days);
}

function computeEffortScore(proposalHours, buildDays) {
  // Weighted combo. Build dominates because it's measured in days.
  return Math.min(100, Math.round((proposalHours * 4) + (buildDays * 1.2)));
}

function estimateEffort(opportunity) {
  if (!opportunity) {
    return { proposal_hours: 4, build_days: BUILD_DAYS_DEFAULT, effort_score: 41 };
  }
  const proposalHours = estimateProposalHours(opportunity);
  const buildDays = estimateBuildDays(opportunity);
  const effortScore = computeEffortScore(proposalHours, buildDays);
  return {
    proposal_hours: proposalHours,
    build_days: buildDays,
    effort_score: effortScore,
  };
}

module.exports = {
  estimateEffort,
  estimateProposalHours,
  estimateBuildDays,
  computeEffortScore,
  BUILD_DAYS_BY_CATEGORY,
  BUILD_DAYS_DEFAULT,
};
