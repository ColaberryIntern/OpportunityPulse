// Strategic Intelligence Overlay — multi-factor keyword scoring.
//
// Reads the existing aggregated keyword cloud rows (each carries
// match_count, tool_count, channel_counts, sentiment, age) and computes
// a strategic_score + per-axis sub-scores + a strategic_category +
// commercialization_stage.
//
// IMPORTANT: this is an ADDITIVE overlay. It does NOT modify the
// existing match_count / sentiment / age fields — those continue to drive
// the descriptive "Market Heat" cloud. The strategic scores power the new
// modes (Procurement / Venture Discovery / Operational Pain / etc.).
//
// Determinism: every score is computed from existing DB fields + the
// strategic dictionaries. No LLM in the scorer — explainability matters.

const dict = require('./strategicKeywordDictionaries');
const logger = require('../logging/logger');

// Channels we care about for convergence detection. Maps the per-keyword
// channel_counts JSONB key → strategic axis label.
const CONVERGENCE_CHANNELS = {
  ai_news: 'news',                     // private-sector / media
  gov_contract: 'procurement',
  grant: 'procurement',
  bonfire: 'procurement',
  ai_job: 'hiring',
  investment: 'capital',
  freelance: 'demand',
  research: 'research',
  bonfire_strategic: 'strategic',
};

// Sub-score weights (sum to 1.0). The composite strategic_score is the
// weighted average. Tuned for "venture + procurement discovery" — heavy
// on convergence + commercialization, moderate on procurement +
// operational pain, lighter on infrastructure + raw research velocity.
const WEIGHTS = {
  convergence:           0.22,
  commercialization:     0.18,
  procurement:           0.14,
  operational_pain:      0.12,
  modernization:         0.10,
  venture:               0.08,
  research_velocity:     0.06,
  regulated_boost:       0.05,
  strategic_rarity:      0.05,
};

const COMMERCIALIZATION_STAGES = [
  'unknown', 'research_only', 'early_signal',
  'commercializing', 'production_ready', 'mainstream',
];

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

// --- Individual sub-scorers -------------------------------------------------

// Convergence: count distinct strategic axes (research / procurement /
// hiring / capital / news / demand) where the word appears with a
// non-trivial count. More axes covered = stronger convergence.
function scoreConvergence({ channelCounts = {} }) {
  const axes = new Set();
  for (const [chKey, count] of Object.entries(channelCounts || {})) {
    if (Number(count) <= 0) continue;
    const axis = CONVERGENCE_CHANNELS[chKey];
    if (axis) axes.add(axis);
  }
  // Score: linear in unique axes covered. 0 axes → 0, 6+ axes → 100.
  return { score: clamp(axes.size * 18), axes: Array.from(axes) };
}

// Procurement: signal strength from procurement-channel counts +
// presence in procurement vocabulary.
function scoreProcurement({ word, channelCounts = {}, categories = [] }) {
  const govCount = Number(channelCounts.gov_contract || 0)
    + Number(channelCounts.grant || 0);
  const bonfireCount = Number(channelCounts.bonfire || 0)
    + Number(channelCounts.bonfire_strategic || 0);
  const total = govCount + bonfireCount;

  // Substring match in procurement_language gives a baseline boost — even
  // if the word didn't itself appear in a gov_contract row, terms like
  // "rfp" or "set-aside" are strategically procurement-flavored.
  const inProcVocab = categories.includes('procurement_language');

  let s = 0;
  s += Math.min(60, Math.log1p(total) * 14);   // log-scaled volume
  if (inProcVocab) s += 25;
  if (govCount >= 3) s += 10;                  // hard floor for federal
  if (bonfireCount >= 3) s += 5;
  return clamp(s);
}

// Operational pain: dominant when the word is in operational_pain or
// compliance_pressure dictionaries. Boosted by hiring + research
// signals (because pain attracts both staff and research attention).
function scoreOperationalPain({ categories = [], channelCounts = {} }) {
  const inPain = categories.includes('operational_pain');
  const inCompliance = categories.includes('compliance_pressure');
  const hiring = Number(channelCounts.ai_job || 0);
  const research = Number(channelCounts.research || 0);
  let s = 0;
  if (inPain) s += 55;
  if (inCompliance) s += 25;
  s += Math.min(15, Math.log1p(hiring) * 4);
  s += Math.min(10, Math.log1p(research) * 3);
  return clamp(s);
}

// Modernization: programmatic-transformation language + procurement
// presence + cloud/data infra adjacency.
function scoreModernization({ categories = [], channelCounts = {} }) {
  const inMod = categories.includes('modernization_language');
  const inInfra = categories.includes('infrastructure');
  const gov = Number(channelCounts.gov_contract || 0) + Number(channelCounts.bonfire || 0);
  let s = 0;
  if (inMod) s += 55;
  if (inInfra) s += 20;
  s += Math.min(25, Math.log1p(gov) * 7);
  return clamp(s);
}

// Commercialization: research → market trajectory signal.
function scoreCommercialization({ categories = [], channelCounts = {} }) {
  const inCommercial = categories.includes('commercialization_signals');
  const news = Number(channelCounts.ai_news || 0);
  const capital = Number(channelCounts.investment || 0);
  const hiring = Number(channelCounts.ai_job || 0);
  const research = Number(channelCounts.research || 0);
  const procurement = Number(channelCounts.gov_contract || 0)
    + Number(channelCounts.bonfire || 0) + Number(channelCounts.grant || 0);
  // Pure-research scores low; research + at least one commercial channel
  // scores high. Procurement evidence is the strongest single signal.
  let s = 0;
  if (inCommercial) s += 20;
  if (research > 0 && (capital > 0 || hiring > 0 || procurement > 0)) s += 30;
  s += Math.min(25, Math.log1p(procurement) * 10);
  s += Math.min(15, Math.log1p(capital) * 8);
  s += Math.min(10, Math.log1p(hiring) * 4);
  s += Math.min(10, Math.log1p(news) * 3);
  // Penalty: research-only.
  if (research > 0 && capital === 0 && hiring === 0 && procurement === 0) {
    s = Math.min(s, 25);
  }
  return clamp(s);
}

// Venture: AI-tool presence + emerging_ai vocabulary + cross-channel.
function scoreVenture({ toolCount = 0, categories = [], channelCounts = {} }) {
  const inEmerging = categories.includes('emerging_ai');
  const inAutomation = categories.includes('automation_categories');
  let s = 0;
  s += Math.min(35, Math.log1p(toolCount) * 12);
  if (inEmerging) s += 25;
  if (inAutomation) s += 20;
  const capital = Number(channelCounts.investment || 0);
  const news = Number(channelCounts.ai_news || 0);
  s += Math.min(10, Math.log1p(capital) * 6);
  s += Math.min(10, Math.log1p(news) * 2);
  return clamp(s);
}

// Research velocity: research channel count + how fresh the average age
// is. Newer mentions = higher velocity.
function scoreResearchVelocity({ channelCounts = {}, avgAgeDays = null }) {
  const research = Number(channelCounts.research || 0);
  let s = Math.min(80, Math.log1p(research) * 22);
  if (avgAgeDays != null) {
    const age = Number(avgAgeDays);
    if (age <= 3) s += 20;
    else if (age <= 7) s += 12;
    else if (age <= 14) s += 6;
    else if (age >= 30) s -= 10;
  }
  return clamp(s);
}

// Regulated-domain boost: presence in a regulated vertical multiplies
// procurement signal value. Returns a 0-100 score that's high only when
// the word is in BOTH a regulated domain AND another high-signal category.
function scoreRegulatedBoost({ categories = [] }) {
  const inRegulated = categories.includes('regulated_domains');
  if (!inRegulated) return 0;
  const overlap = ['operational_pain', 'compliance_pressure',
    'modernization_language', 'procurement_language',
    'automation_categories'].filter((c) => categories.includes(c));
  if (overlap.length === 0) return 50;  // regulated alone
  return clamp(60 + overlap.length * 10);
}

// Strategic rarity: discourage scoring purely-frequent words ("AI",
// "model", "platform") highly. Inverse of relative match volume.
function scoreStrategicRarity({ matchCount, totalMentions, maxMatchInCorpus = 1 }) {
  if (!matchCount || matchCount <= 0) return 50;
  const ratio = matchCount / Math.max(1, maxMatchInCorpus);
  // ratio of 0.0 → score 100 (rare); ratio of 1.0 → score 0 (most common).
  return clamp(100 - ratio * 100);
}

// Commercialization stage: a 6-level qualitative label from the sub-scores.
function classifyCommercializationStage({
  commercializationScore, researchVelocityScore, procurementScore, ventureScore,
}) {
  if (commercializationScore >= 70 && procurementScore >= 50) return 'mainstream';
  if (commercializationScore >= 55) return 'production_ready';
  if (commercializationScore >= 35) return 'commercializing';
  if (researchVelocityScore >= 50 || ventureScore >= 40) return 'early_signal';
  if (researchVelocityScore >= 25) return 'research_only';
  return 'unknown';
}

// Strategic priority: 4-level qualitative label from composite + convergence.
function classifyStrategicPriority({ strategicScore, convergenceScore }) {
  if (strategicScore >= 75 && convergenceScore >= 50) return 'critical';
  if (strategicScore >= 60) return 'high';
  if (strategicScore >= 40) return 'standard';
  return 'low';
}

// --- Top-level scorer -------------------------------------------------------

// scoreKeyword(row, ctx) — pure function over an aggregated keyword row.
// row: { word, matchCount, toolCount, totalMentions, channelCounts,
//        sentimentScore, avgAgeDays }
// ctx: { maxMatchInCorpus }
function scoreKeyword(row = {}, ctx = {}) {
  const word = String(row.word || '');
  const categories = dict.categoriesFor(word);

  const convergence = scoreConvergence(row);
  const procurement = scoreProcurement({ word, channelCounts: row.channelCounts, categories });
  const operationalPain = scoreOperationalPain({ categories, channelCounts: row.channelCounts });
  const modernization = scoreModernization({ categories, channelCounts: row.channelCounts });
  const commercialization = scoreCommercialization({ categories, channelCounts: row.channelCounts });
  const venture = scoreVenture({
    toolCount: row.toolCount, categories, channelCounts: row.channelCounts,
  });
  const researchVelocity = scoreResearchVelocity({
    channelCounts: row.channelCounts, avgAgeDays: row.avgAgeDays,
  });
  const regulatedBoost = scoreRegulatedBoost({ categories });
  const strategicRarity = scoreStrategicRarity({
    matchCount: row.matchCount, totalMentions: row.totalMentions,
    maxMatchInCorpus: ctx.maxMatchInCorpus || 1,
  });

  const strategicScore = clamp(
    convergence.score * WEIGHTS.convergence
    + commercialization * WEIGHTS.commercialization
    + procurement * WEIGHTS.procurement
    + operationalPain * WEIGHTS.operational_pain
    + modernization * WEIGHTS.modernization
    + venture * WEIGHTS.venture
    + researchVelocity * WEIGHTS.research_velocity
    + regulatedBoost * WEIGHTS.regulated_boost
    + strategicRarity * WEIGHTS.strategic_rarity,
  );

  const dominantCat = dict.dominantCategory(categories);
  const commercializationStage = classifyCommercializationStage({
    commercializationScore: commercialization,
    researchVelocityScore: researchVelocity,
    procurementScore: procurement,
    ventureScore: venture,
  });
  const strategicPriority = classifyStrategicPriority({
    strategicScore, convergenceScore: convergence.score,
  });

  return {
    word,
    strategic_score: strategicScore,
    sub_scores: {
      convergence_score: convergence.score,
      commercialization_score: commercialization,
      procurement_score: procurement,
      modernization_score: modernization,
      operational_pain_score: operationalPain,
      venture_score: venture,
      research_velocity_score: researchVelocity,
      regulated_boost: regulatedBoost,
      strategic_rarity: strategicRarity,
    },
    convergence_axes: convergence.axes,
    strategic_tags: categories,
    strategic_category: dominantCat,
    strategic_priority: strategicPriority,
    commercialization_stage: commercializationStage,
  };
}

// Convenience: enrich an entire keyword cloud array in one pass.
function enrichKeywords(rows = []) {
  const maxMatchInCorpus = rows.reduce(
    (m, r) => Math.max(m, Number(r.matchCount || r.match_count || 0)), 0,
  ) || 1;
  return rows.map((r) => {
    const normalized = {
      word: r.word,
      matchCount: r.matchCount != null ? r.matchCount : r.match_count,
      toolCount: r.toolCount != null ? r.toolCount : r.tool_count,
      totalMentions: r.totalMentions != null ? r.totalMentions : (r.total_mentions || r.count),
      channelCounts: r.channelCounts || r.channel_counts || {},
      sentimentScore: r.sentimentScore != null ? r.sentimentScore : r.sentiment_score,
      avgAgeDays: r.avgAgeDays != null ? r.avgAgeDays : r.avg_age_days,
    };
    return scoreKeyword(normalized, { maxMatchInCorpus });
  });
}

// summarize() — return basic stats over an enriched array for the
// strategic-discovery dashboard.
function summarizeEnriched(enriched = []) {
  if (!Array.isArray(enriched) || enriched.length === 0) {
    return { count: 0, by_priority: {}, by_stage: {}, by_category: {} };
  }
  const byPriority = {};
  const byStage = {};
  const byCategory = {};
  let strategicSum = 0;
  let commercializationSum = 0;
  let convergenceSum = 0;
  for (const e of enriched) {
    byPriority[e.strategic_priority] = (byPriority[e.strategic_priority] || 0) + 1;
    byStage[e.commercialization_stage] = (byStage[e.commercialization_stage] || 0) + 1;
    if (e.strategic_category) {
      byCategory[e.strategic_category] = (byCategory[e.strategic_category] || 0) + 1;
    }
    strategicSum += e.strategic_score;
    commercializationSum += e.sub_scores.commercialization_score;
    convergenceSum += e.sub_scores.convergence_score;
  }
  return {
    count: enriched.length,
    by_priority: byPriority,
    by_stage: byStage,
    by_category: byCategory,
    avg_strategic_score: Math.round(strategicSum / enriched.length),
    avg_commercialization_score: Math.round(commercializationSum / enriched.length),
    avg_convergence_score: Math.round(convergenceSum / enriched.length),
    weights: WEIGHTS,
  };
}

module.exports = {
  WEIGHTS, COMMERCIALIZATION_STAGES, CONVERGENCE_CHANNELS,
  clamp,
  scoreConvergence, scoreProcurement, scoreOperationalPain,
  scoreModernization, scoreCommercialization, scoreVenture,
  scoreResearchVelocity, scoreRegulatedBoost, scoreStrategicRarity,
  classifyCommercializationStage, classifyStrategicPriority,
  scoreKeyword, enrichKeywords, summarizeEnriched,
};
