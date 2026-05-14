// Deep Research Phase 2 — venture scoring engine.
//
// Deterministic, auditable scoring of a venture idea across 8 dimensions,
// rolled into a weighted composite + a recommendation level. Every
// dimension is COMPUTED from real inputs — the venture idea's own fields,
// the report context, and the correlation + timing engine outputs. The
// weights are a defined model (constants below), not magic numbers buried
// in the math; nothing here is hardcoded per-idea.

// The dimension weights — the scoring model. They sum to 1.0.
const WEIGHTS = {
  commercialization: 0.18,
  buildability: 0.15,
  market_timing: 0.15,
  competition_saturation: 0.12,
  technical_feasibility: 0.12,
  revenue_potential: 0.13,
  gov_alignment: 0.08,
  ai_defensibility: 0.07,
};

// Revenue band → base 0-100. The bands come from ventureIdeaGenerator.
const REVENUE_BAND_SCORE = {
  low: 30, medium: 55, high: 78, very_high: 92,
};

// Market stage → 0-100 timing desirability. Breakout is peak; declining is worst.
const STAGE_TIMING_SCORE = {
  emerging: 48, acceleration: 72, breakout: 90, mainstream: 70, saturated: 38, declining: 20,
};

// Market stage → 0-100 "room to compete" (inverse of saturation). Emerging/
// acceleration have open competitive space; saturated/mainstream are crowded.
const STAGE_COMPETITION_SCORE = {
  emerging: 85, acceleration: 78, breakout: 65, mainstream: 45, saturated: 25, declining: 40,
};

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Read a field from a venture idea tolerating both the pre-persist
// snake_case shape (from ventureIdeaGenerator) and the persisted camelCase
// model shape.
function field(idea, snake, camel) {
  if (idea[snake] !== undefined && idea[snake] !== null) return idea[snake];
  if (idea[camel] !== undefined && idea[camel] !== null) return idea[camel];
  return undefined;
}

// Does the report context show a meaningful research base?
function researchDepth(context) {
  const research = (context.channels || []).find((c) => c.key === 'research');
  if (!research) return 0;
  const buildable = (context.totals && context.totals.buildableResearchCount) || 0;
  // 0-1: research volume + how much of it is buildable.
  return Math.max(0, Math.min(1, (research.count / 15) * 0.6 + (buildable / 8) * 0.4));
}

// Does the report context show a government angle?
function govPresence(context, idea) {
  const gov = (context.channels || []).find((c) => c.key === 'government');
  const govVolume = gov ? gov.count : 0;
  const text = `${field(idea, 'description', 'description') || ''} `
    + `${(idea.metadata && idea.metadata.target_customers) || ''} `
    + `${field(idea, 'gtm_summary', 'gtmSummary') || ''}`;
  const mentionsGov = /\b(gov|government|public[- ]sector|procurement|agency|federal|municipal|state)\b/i
    .test(text);
  // 0-100: channel evidence is the bulk, the idea explicitly targeting gov is a boost.
  const channelScore = Math.min(70, govVolume * 12);
  const textBoost = mentionsGov ? 30 : 0;
  return clamp100(channelScore + textBoost);
}

// Score one venture idea. Returns { composite_score, recommendation_level,
// scores: { ...8 dimensions } } — all 0-100, pure + deterministic.
function scoreVenture(idea, { context = {}, correlation = {}, timing = {} } = {}) {
  const buildability01 = Number(field(idea, 'buildability_score', 'buildabilityScore')) || 0;
  const revenueBand = field(idea, 'revenue_potential', 'revenuePotential') || 'medium';
  const stage = timing.stage || 'emerging';
  const correlationStrength = Number(correlation.correlation_strength) || 0;
  const timingScore01 = Number(timing.timing_score) || 0;
  const rDepth = researchDepth(context);

  // --- the 8 dimensions ---
  // 1. commercialization — revenue band, lifted by cross-channel demand proof.
  const commercialization = clamp100(
    (REVENUE_BAND_SCORE[revenueBand] || 55) * 0.7 + (correlationStrength * 100) * 0.3,
  );
  // 2. buildability — straight from the AI's buildability estimate.
  const buildability = clamp100(buildability01 * 100);
  // 3. market_timing — stage desirability, nudged by the continuous timing score.
  const marketTiming = clamp100(
    (STAGE_TIMING_SCORE[stage] || 48) * 0.7 + (timingScore01 * 100) * 0.3,
  );
  // 4. competition_saturation — room to compete (higher = less saturated).
  const competitionSaturation = clamp100(STAGE_COMPETITION_SCORE[stage] || 60);
  // 5. technical_feasibility — buildability grounded by a real research base.
  const technicalFeasibility = clamp100(buildability01 * 70 + rDepth * 30);
  // 6. revenue_potential — the revenue band on its own.
  const revenuePotential = clamp100(REVENUE_BAND_SCORE[revenueBand] || 55);
  // 7. gov_alignment — government channel evidence + explicit gov targeting.
  const govAlignment = govPresence(context, idea);
  // 8. ai_defensibility — research depth is the moat; buildability tempers it
  //    (trivially-buildable things are also trivially copyable).
  const aiDefensibility = clamp100(rDepth * 65 + (1 - buildability01) * 35);

  const scores = {
    commercialization,
    buildability,
    market_timing: marketTiming,
    competition_saturation: competitionSaturation,
    technical_feasibility: technicalFeasibility,
    revenue_potential: revenuePotential,
    gov_alignment: govAlignment,
    ai_defensibility: aiDefensibility,
  };

  // Weighted composite.
  let composite = 0;
  for (const [dim, weight] of Object.entries(WEIGHTS)) {
    composite += (scores[dim] || 0) * weight;
  }
  const compositeScore = Number(composite.toFixed(2));

  let recommendationLevel;
  if (compositeScore >= 75) recommendationLevel = 'strong_build';
  else if (compositeScore >= 60) recommendationLevel = 'build';
  else if (compositeScore >= 42) recommendationLevel = 'watch';
  else recommendationLevel = 'pass';

  return { composite_score: compositeScore, recommendation_level: recommendationLevel, scores };
}

module.exports = {
  WEIGHTS,
  REVENUE_BAND_SCORE,
  STAGE_TIMING_SCORE,
  STAGE_COMPETITION_SCORE,
  researchDepth,
  govPresence,
  scoreVenture,
};
