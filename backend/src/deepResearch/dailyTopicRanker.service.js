// Deep Research — daily auto-topic ranker.
//
// Picks the highest-rated topic for an automatic daily Deep Research run
// by composing four deterministic signals:
//
//   1. recurring_frequency : weight = 0.40
//      Top recurring relationships (technologies + keywords) from
//      opportunity_relationships. Higher occurrence_count = stronger signal
//      that this topic is showing up across the platform's opportunity data.
//
//   2. research_momentum   : weight = 0.30
//      research_topics.momentum_score for any topic that lexically overlaps
//      the candidate. arXiv / research signal that the AI field around the
//      topic is moving.
//
//   3. opportunity_value   : weight = 0.15
//      Sum of recent (last 30 days) opportunity values whose title or
//      description mentions the candidate. Real revenue ahead of the topic.
//
//   4. coverage_freshness  : weight = 0.15
//      Inverse of how recently a Deep Research report was generated for
//      the candidate. Picks topics we haven't covered in the last 14 days
//      so the daily report doesn't keep re-running the same search.
//
// IMPORTANT: deterministic. No LLM in the picker — the LLM runs inside the
// Deep Research pipeline. The ranker is a pure-data scoring function so the
// daily pick is explainable and reproducible.

const { Op } = require('sequelize');
const {
  OpportunityRelationship, ResearchTopic, Opportunity, DeepResearchReport,
} = require('../models');
const logger = require('../logging/logger');

const WEIGHTS = {
  recurring_frequency: 0.40,
  research_momentum: 0.30,
  opportunity_value: 0.15,
  coverage_freshness: 0.15,
};

const RECENT_DAYS = 30;
const COVERAGE_WINDOW_DAYS = 14;
const TOP_RELATIONSHIPS = 20;
const MAX_CANDIDATES = 50;

// Stopwords to filter out useless candidate phrases. We pull these from
// recurring relationships, so we want to drop generic single words.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'inc', 'llc', 'corp', 'co',
  'services', 'service', 'solutions', 'systems', 'group',
  'data', 'platform', 'tool', 'software', 'system', 'company',
]);

function isUsefulCandidate(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length < 4) return false;
  if (v.length > 80) return false;
  if (STOPWORDS.has(v.toLowerCase())) return false;
  return true;
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Score a single candidate against the four signal sources.
function scoreCandidate(candidate, ctx) {
  const v = normalize(candidate.value);

  // 1. recurring_frequency: log-scaled occurrence_count over max.
  const maxOccurrence = ctx.maxOccurrence || 1;
  const recurringScore = candidate.occurrenceCount
    ? Math.min(100, Math.round((Math.log(candidate.occurrenceCount + 1)
        / Math.log(maxOccurrence + 1)) * 100))
    : 0;

  // 2. research_momentum: best lexical overlap with research_topics.
  let momentumScore = 0;
  for (const rt of ctx.researchTopics) {
    const tn = normalize(rt.topicName);
    if (!tn) continue;
    if (tn.includes(v) || v.includes(tn)) {
      const score = Math.min(100, Math.round(Number(rt.momentumScore || 0)));
      if (score > momentumScore) momentumScore = score;
    }
  }

  // 3. opportunity_value: sum of recent opps whose title/desc mentions v.
  let valueSum = 0;
  for (const opp of ctx.recentOpportunities) {
    const t = normalize(opp.title);
    const d = normalize(opp.description || '');
    if (t.includes(v) || d.includes(v)) {
      valueSum += Number(opp.value || 0);
    }
  }
  const maxValue = ctx.maxValue || 1;
  const valueScore = maxValue > 0
    ? Math.min(100, Math.round((valueSum / maxValue) * 100)) : 0;

  // 4. coverage_freshness: penalize topics covered in the last 14 days.
  let freshnessScore = 100;
  for (const r of ctx.recentReports) {
    const term = normalize(r.searchTerm);
    if (!term) continue;
    if (term.includes(v) || v.includes(term)) {
      // covered recently — drop freshness toward zero
      const daysAgo = Math.max(0, Math.floor(
        (Date.now() - new Date(r.createdAt).getTime()) / 86400_000,
      ));
      const penalty = Math.max(0, 100 - Math.round((daysAgo / COVERAGE_WINDOW_DAYS) * 100));
      if (penalty > 100 - freshnessScore) freshnessScore = 100 - penalty;
    }
  }

  const composite = Math.round(
    recurringScore * WEIGHTS.recurring_frequency
    + momentumScore * WEIGHTS.research_momentum
    + valueScore * WEIGHTS.opportunity_value
    + freshnessScore * WEIGHTS.coverage_freshness,
  );

  return {
    candidate: candidate.value,
    composite,
    sub_scores: {
      recurring_frequency: recurringScore,
      research_momentum: momentumScore,
      opportunity_value: valueScore,
      coverage_freshness: freshnessScore,
    },
    inputs: {
      occurrence_count: candidate.occurrenceCount || 0,
      relationship_type: candidate.relationshipType || null,
      matched_value_usd: valueSum,
    },
  };
}

// Pull the data we need to score every candidate.
async function loadContext({ recentDays = RECENT_DAYS } = {}) {
  const since = new Date(Date.now() - Number(recentDays) * 86400_000);
  const reportsSince = new Date(Date.now() - COVERAGE_WINDOW_DAYS * 86400_000);
  const [relationships, researchTopics, recentOpportunities, recentReports] = await Promise.all([
    OpportunityRelationship.findAll({
      where: { relationshipType: { [Op.in]: ['technology', 'keyword'] } },
      order: [['occurrence_count', 'DESC']],
      limit: TOP_RELATIONSHIPS * 2,
    }),
    ResearchTopic.findAll({
      where: { momentumScore: { [Op.ne]: null } },
      order: [['momentum_score', 'DESC']], limit: 100,
    }),
    Opportunity.findAll({
      where: { createdAt: { [Op.gte]: since } },
      attributes: ['id', 'title', 'description', 'value', 'createdAt'],
      limit: 2000,
    }),
    DeepResearchReport.findAll({
      where: { createdAt: { [Op.gte]: reportsSince } },
      attributes: ['id', 'searchTerm', 'createdAt'],
      limit: 200,
    }),
  ]);
  const maxOccurrence = relationships.reduce((m, r) => Math.max(m, Number(r.occurrenceCount || 0)), 0);
  const maxValue = recentOpportunities.reduce((m, o) => Math.max(m, Number(o.value || 0)), 0)
    || 1_000_000;  // floor so empty datasets don't divide by zero
  return {
    relationships: relationships.map((r) => r.toJSON()),
    researchTopics: researchTopics.map((r) => r.toJSON()),
    recentOpportunities: recentOpportunities.map((o) => o.toJSON()),
    recentReports: recentReports.map((r) => r.toJSON()),
    maxOccurrence, maxValue,
  };
}

// Build the candidate list — recurring relationships, plus any high-momentum
// research topics we'd otherwise miss.
function buildCandidates(ctx) {
  const seen = new Set();
  const out = [];
  for (const r of ctx.relationships) {
    if (!isUsefulCandidate(r.value)) continue;
    const k = normalize(r.value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      value: r.value, relationshipType: r.relationshipType,
      occurrenceCount: Number(r.occurrenceCount || 0),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  // Pull a handful of top research topics that aren't already covered.
  for (const rt of ctx.researchTopics.slice(0, 15)) {
    if (!isUsefulCandidate(rt.topicName)) continue;
    const k = normalize(rt.topicName);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      value: rt.topicName, relationshipType: 'research_topic',
      occurrenceCount: 0,
    });
  }
  return out;
}

// Main entry point: rank candidates + return the top N.
async function rankTopics({ topN = 5 } = {}) {
  const ctx = await loadContext();
  const candidates = buildCandidates(ctx);
  if (candidates.length === 0) {
    logger.warn('dailyTopicRanker: no candidates from data — falling back to defaults');
    return { ranked: [], fallback_used: true, ctx_inputs: summarizeCtx(ctx) };
  }
  const scored = candidates
    .map((c) => scoreCandidate(c, ctx))
    .sort((a, b) => b.composite - a.composite);
  return {
    ranked: scored.slice(0, Math.max(1, Number(topN) || 5)),
    fallback_used: false,
    weights: WEIGHTS,
    ctx_inputs: summarizeCtx(ctx),
  };
}

function summarizeCtx(ctx) {
  return {
    relationships_considered: ctx.relationships.length,
    research_topics_considered: ctx.researchTopics.length,
    recent_opportunities_considered: ctx.recentOpportunities.length,
    recent_reports_considered: ctx.recentReports.length,
    max_occurrence: ctx.maxOccurrence,
    max_opportunity_value: ctx.maxValue,
  };
}

// Convenience: pick the single highest-rated topic. Returns the term string
// suitable for passing to deepResearch.runDeepResearch({ searchTerm }).
// When no candidates rank above a confidence floor, returns null so the
// caller can fall back to env / default topics rather than silently picking
// noise.
async function pickTodaysTopic({ minComposite = 25 } = {}) {
  const out = await rankTopics({ topN: 5 });
  if (out.fallback_used || out.ranked.length === 0) {
    return { topic: null, reason: 'no_candidates', detail: out };
  }
  const top = out.ranked[0];
  if (top.composite < minComposite) {
    return { topic: null, reason: 'low_confidence', detail: out };
  }
  return {
    topic: top.candidate,
    composite_score: top.composite,
    sub_scores: top.sub_scores,
    inputs: top.inputs,
    runners_up: out.ranked.slice(1, 5).map((r) => ({
      candidate: r.candidate, composite: r.composite,
    })),
    ctx_inputs: out.ctx_inputs,
    weights: WEIGHTS,
    governance_note: 'Deterministic data-driven pick — recommendation only, never auto-submits or auto-bids.',
  };
}

module.exports = {
  WEIGHTS, RECENT_DAYS, COVERAGE_WINDOW_DAYS, TOP_RELATIONSHIPS, STOPWORDS,
  isUsefulCandidate, normalize,
  scoreCandidate, loadContext, buildCandidates,
  rankTopics, pickTodaysTopic,
};
