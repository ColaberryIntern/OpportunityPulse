const {
  CATEGORIES,
  CATEGORY_HEURISTICS,
  DEFAULT_HEURISTIC,
  SCORING_WEIGHTS,
  SIGNAL_CODES,
  AI_CLAMP_DELTA,
} = require('./bonfire.constants');

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Pure function of estimated_value in cents.
function computeRevenueWeight(estimatedValueCents) {
  const v = Number(estimatedValueCents) || 0;
  if (v < 5_000_000) return 20;       // < $50k
  if (v < 50_000_000) return 50;      // $50k – $500k
  if (v < 500_000_000) return 80;     // $500k – $5M
  return 100;                         // $5M+
}

function getHeuristics(aiCategory) {
  return CATEGORY_HEURISTICS[aiCategory] || DEFAULT_HEURISTIC;
}

// Stage 1 — rule seeds. Callable without knowing AI output.
function computeRuleSeeds({ estimatedValue, aiCategory }) {
  const heur = getHeuristics(aiCategory);
  return {
    revenue_weight: computeRevenueWeight(estimatedValue),
    ease_of_entry: heur.ease,
    automation_seed: heur.auto_seed,
    repeatability_seed: heur.rep_seed,
  };
}

// Bound an AI-provided sub-score to its rule seed ± delta, then to [0,100].
function bindToSeed(aiValue, seed, delta = AI_CLAMP_DELTA) {
  const lo = Math.max(0, seed - delta);
  const hi = Math.min(100, seed + delta);
  return clamp(aiValue, lo, hi);
}

// Stage 3 — deterministic priority score from sub-scores.
function computePriorityScore({
  revenue_weight,
  automation_potential,
  repeatability,
  ease_of_entry,
}) {
  const s =
    SCORING_WEIGHTS.revenue       * (revenue_weight       || 0) +
    SCORING_WEIGHTS.automation    * (automation_potential || 0) +
    SCORING_WEIGHTS.repeatability * (repeatability        || 0) +
    SCORING_WEIGHTS.ease          * (ease_of_entry        || 0);
  return Math.round(s);
}

// Signal badges — server-side derivation, stored in JSONB.
function computeSignals({
  priority_score,
  estimated_value,
  automation_potential,
  ease_of_entry,
  repeatability,
  recommended_product,
  close_date,
}) {
  const signals = [];
  if (priority_score >= 80 && (estimated_value || 0) >= 50_000_000) {
    signals.push(SIGNAL_CODES.HIGH_ROI);
  }
  if ((automation_potential || 0) >= 70) {
    signals.push(SIGNAL_CODES.HIGH_AUTOMATION);
  }
  const within30Days =
    close_date &&
    new Date(close_date).getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000 &&
    new Date(close_date).getTime() - Date.now() >= 0;
  if ((ease_of_entry || 0) >= 75 && within30Days) {
    signals.push(SIGNAL_CODES.QUICK_WIN);
  }
  if ((repeatability || 0) >= 75 && recommended_product) {
    signals.push(SIGNAL_CODES.PRODUCTIZABLE);
  }
  return signals;
}

// Coerce a free-text category into the enum. Falls back to `Consulting`.
function normalizeCategory(raw) {
  if (!raw) return 'Consulting';
  const exact = CATEGORIES.find((c) => c.toLowerCase() === String(raw).toLowerCase());
  return exact || 'Consulting';
}

module.exports = {
  clamp,
  computeRevenueWeight,
  computeRuleSeeds,
  bindToSeed,
  computePriorityScore,
  computeSignals,
  normalizeCategory,
  getHeuristics,
};
