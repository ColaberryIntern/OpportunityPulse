// Strategic Intelligence Overlay — commercialization transition detection.
//
// Surfaces keywords moving from research → procurement → market. The
// detector reads the current keyword_trends snapshot + the enriched
// strategic scores and identifies high-signal transitions.
//
// Determinism: every classification is a deterministic transform over
// (sub_scores, stage, channel_counts). No LLM in the detector.

const { Op } = require('sequelize');
const { KeywordTrend } = require('../models');
const strategicIntel = require('./strategicKeywordIntelligence.service');
const dict = require('./strategicKeywordDictionaries');
const logger = require('../logging/logger');

// A transition is "active" when commercialization_score has lifted while
// research signal is still strong (the term hasn't been picked up purely
// by news yet). These are the strongest venture-discovery moments.
const ACTIVE_THRESHOLDS = {
  minCommercializationScore: 35,
  minResearchVelocity: 30,
  minConvergenceScore: 20,
};

// Each detected transition row carries enough context for the UI + the
// "Run Deep Research" deep-link to seed itself.
function buildTransitionRow(enriched, rawRow) {
  const channelCounts = rawRow.channelCounts || rawRow.channel_counts || {};
  return {
    word: enriched.word,
    display_word: rawRow.displayWord || rawRow.display_word || enriched.word,
    strategic_score: enriched.strategic_score,
    strategic_priority: enriched.strategic_priority,
    commercialization_stage: enriched.commercialization_stage,
    convergence_axes: enriched.convergence_axes,
    strategic_tags: enriched.strategic_tags,
    sub_scores: enriched.sub_scores,
    channel_counts: channelCounts,
    match_count: rawRow.matchCount != null ? rawRow.matchCount : rawRow.match_count,
    tool_count: rawRow.toolCount != null ? rawRow.toolCount : rawRow.tool_count,
    last_computed_at: rawRow.lastComputedAt != null ? rawRow.lastComputedAt : rawRow.last_computed_at,
  };
}

// Identify rows currently in active commercialization transition. Returns
// a ranked array (highest commercialization_score first).
async function detectActiveTransitions({
  organizationId = null,  // reserved — keyword_trends is platform-wide today
  limit = 25,
} = {}) {
  const where = { matchCount: { [Op.gte]: 1 } };
  const rows = await KeywordTrend.findAll({
    where, order: [['commercialization_score', 'DESC']],
    limit: Math.min(200, Number(limit) * 4 || 100),
  });
  const enrichedRows = strategicIntel.enrichKeywords(rows.map((r) => r.toJSON()));
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const e = enrichedRows[i];
    if (e.sub_scores.commercialization_score < ACTIVE_THRESHOLDS.minCommercializationScore) continue;
    if (e.sub_scores.research_velocity_score < ACTIVE_THRESHOLDS.minResearchVelocity) continue;
    if (e.sub_scores.convergence_score < ACTIVE_THRESHOLDS.minConvergenceScore) continue;
    out.push(buildTransitionRow(e, rows[i].toJSON()));
    if (out.length >= limit) break;
  }
  return { active: out, count: out.length, thresholds: ACTIVE_THRESHOLDS };
}

// Identify research-to-market terms — high research_velocity, high
// procurement_score, but not yet mainstream. The single most actionable
// surface for pursuit + capture teams.
async function researchToMarketTerms({ limit = 15 } = {}) {
  const rows = await KeywordTrend.findAll({
    where: { matchCount: { [Op.gte]: 1 } },
    limit: 500,
  });
  const enrichedRows = strategicIntel.enrichKeywords(rows.map((r) => r.toJSON()));
  const candidates = [];
  for (let i = 0; i < rows.length; i += 1) {
    const e = enrichedRows[i];
    const r = e.sub_scores.research_velocity_score;
    const p = e.sub_scores.procurement_score;
    const stage = e.commercialization_stage;
    // Sweet spot: research signal AND procurement signal AND not mainstream.
    if (r < 25 || p < 25) continue;
    if (stage === 'mainstream') continue;
    candidates.push({
      ...buildTransitionRow(e, rows[i].toJSON()),
      crossover_score: Math.round((r + p) / 2),
    });
  }
  candidates.sort((a, b) => b.crossover_score - a.crossover_score);
  return {
    rows: candidates.slice(0, Math.min(50, Number(limit) || 15)),
    count: candidates.length,
  };
}

// Identify keywords with strongest cross-channel convergence — appearing
// across the most strategic axes (research / procurement / hiring /
// capital / news / demand).
async function strongestConvergence({ limit = 15 } = {}) {
  const rows = await KeywordTrend.findAll({
    where: { matchCount: { [Op.gte]: 1 } },
    limit: 500,
  });
  const enrichedRows = strategicIntel.enrichKeywords(rows.map((r) => r.toJSON()));
  const out = enrichedRows.map((e, i) => buildTransitionRow(e, rows[i].toJSON()))
    .sort((a, b) => b.sub_scores.convergence_score - a.sub_scores.convergence_score
                  || b.strategic_score - a.strategic_score)
    .slice(0, Math.min(50, Number(limit) || 15));
  return { rows: out, count: out.length };
}

// Identify the fastest-rising operational-pain terms — high pain score +
// fresh average age + high research/hiring activity.
async function risingOperationalPain({ limit = 15 } = {}) {
  const rows = await KeywordTrend.findAll({
    where: { matchCount: { [Op.gte]: 1 } },
    limit: 500,
  });
  const enrichedRows = strategicIntel.enrichKeywords(rows.map((r) => r.toJSON()));
  const candidates = [];
  for (let i = 0; i < rows.length; i += 1) {
    const e = enrichedRows[i];
    if (e.sub_scores.operational_pain_score < 35) continue;
    const age = Number(rows[i].avgAgeDays || 0);
    const freshness = age <= 3 ? 30 : age <= 7 ? 20 : age <= 14 ? 10 : 0;
    candidates.push({
      ...buildTransitionRow(e, rows[i].toJSON()),
      rising_score: e.sub_scores.operational_pain_score + freshness,
    });
  }
  candidates.sort((a, b) => b.rising_score - a.rising_score);
  return { rows: candidates.slice(0, Math.min(50, Number(limit) || 15)), count: candidates.length };
}

// Identify modernization-pressure terms — strong procurement modernization
// signals showing budget movement.
async function strongestModernization({ limit = 15 } = {}) {
  const rows = await KeywordTrend.findAll({
    where: { matchCount: { [Op.gte]: 1 } },
    limit: 500,
  });
  const enrichedRows = strategicIntel.enrichKeywords(rows.map((r) => r.toJSON()));
  const out = enrichedRows.map((e, i) => buildTransitionRow(e, rows[i].toJSON()))
    .filter((r) => r.sub_scores.modernization_score >= 40)
    .sort((a, b) => b.sub_scores.modernization_score - a.sub_scores.modernization_score)
    .slice(0, Math.min(50, Number(limit) || 15));
  return { rows: out, count: out.length };
}

// Discovery composite — single call that returns everything the
// StrategicDiscoveryPanel needs.
async function getDiscoveryDashboard({ perSectionLimit = 10 } = {}) {
  const [active, research, convergence, pain, modernization] = await Promise.all([
    detectActiveTransitions({ limit: perSectionLimit }),
    researchToMarketTerms({ limit: perSectionLimit }),
    strongestConvergence({ limit: perSectionLimit }),
    risingOperationalPain({ limit: perSectionLimit }),
    strongestModernization({ limit: perSectionLimit }),
  ]);
  return {
    generated_at: new Date().toISOString(),
    active_transitions: active.active,
    research_to_market: research.rows,
    strongest_convergence: convergence.rows,
    rising_operational_pain: pain.rows,
    strongest_modernization: modernization.rows,
    counts: {
      active_transitions: active.count,
      research_to_market: research.count,
      strongest_convergence: convergence.count,
      rising_operational_pain: pain.count,
      strongest_modernization: modernization.count,
    },
    thresholds: ACTIVE_THRESHOLDS,
    governance_note: 'Deterministic detection. Recommendation-only — never auto-creates pursuits or runs.',
  };
}

module.exports = {
  ACTIVE_THRESHOLDS,
  buildTransitionRow,
  detectActiveTransitions,
  researchToMarketTerms,
  strongestConvergence,
  risingOperationalPain,
  strongestModernization,
  getDiscoveryDashboard,
};
