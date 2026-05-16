// Deep Research Phase 14 — proposal quality intelligence.
//
// Deterministic composite scorer over an OpportunityOutput. 8 dimensions:
// strategic_alignment, completeness, evaluator_alignment, differentiation,
// clarity, readiness_consistency, groundedness, operational_coherence.
//
// IMPORTANT: this is a measurement layer. It generates recommendations
// only — it never modifies the proposal content.

const { Op } = require('sequelize');
const {
  ProposalQuality, OpportunityOutput, PromptProvenance,
  PursuitWorkspace, GroundednessAnalysis, StrategicCoherence,
  EvaluatorAlignment, CrossProvenance,
} = require('../models');
const logger = require('../logging/logger');

const WEIGHTS = {
  strategic_alignment: 0.18,
  completeness: 0.14,
  evaluator_alignment: 0.16,
  differentiation: 0.10,
  clarity: 0.08,
  readiness_consistency: 0.10,
  groundedness: 0.14,
  operational_coherence: 0.10,
};

const CLASSIFICATION_THRESHOLDS = { excellent: 85, strong: 70, adequate: 50 };

function classify(score) {
  if (score >= CLASSIFICATION_THRESHOLDS.excellent) return 'excellent';
  if (score >= CLASSIFICATION_THRESHOLDS.strong) return 'strong';
  if (score >= CLASSIFICATION_THRESHOLDS.adequate) return 'adequate';
  return 'weak';
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

// Sub-scorers — pure functions over a context object.
function scoreCompleteness({ content, sections = [] }) {
  const text = String(content || '');
  if (!text) return 0;
  let score = Math.min(60, Math.floor(text.length / 80));
  const expected = ['executive summary', 'approach', 'past performance', 'staffing', 'pricing', 'timeline', 'compliance'];
  for (const s of expected) {
    if (new RegExp(s, 'i').test(text)) score += 5;
  }
  score += Math.min(10, sections.length);
  return clamp(score);
}

function scoreClarity({ content }) {
  const text = String(content || '');
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 50) return 25;
  const avgWordLen = words.reduce((a, w) => a + w.length, 0) / words.length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLen = words.length / Math.max(1, sentences.length);
  let s = 100;
  if (avgWordLen > 6.5) s -= Math.min(20, Math.round((avgWordLen - 6.5) * 15));
  if (avgSentenceLen > 30) s -= Math.min(25, Math.round((avgSentenceLen - 30) * 1.5));
  if (avgSentenceLen < 8) s -= 10;
  return clamp(s);
}

function scoreDifferentiation({ content }) {
  const text = String(content || '').toLowerCase();
  const diffPhrases = [
    'unlike', 'differentiat', 'unique', 'proprietary',
    'we are the only', 'our advantage', 'distinctive',
    'patented', 'exclusively', 'first to', 'specialized in',
  ];
  let hits = 0;
  for (const p of diffPhrases) if (text.includes(p)) hits += 1;
  return clamp(40 + hits * 10);
}

function scoreStrategicAlignment({ contextSections = [], hasProvenance = false }) {
  let s = hasProvenance ? 50 : 25;
  if (contextSections.includes('capture_strategy')) s += 20;
  if (contextSections.includes('pursuit')) s += 10;
  if (contextSections.includes('strategic_patterns')) s += 10;
  if (contextSections.includes('recurring_agency')) s += 10;
  return clamp(s);
}

function scoreReadinessConsistency({ readinessBlockers = [], content = '' }) {
  if (!readinessBlockers.length) return 90;
  const text = String(content).toLowerCase();
  let acknowledged = 0;
  for (const b of readinessBlockers) {
    const phrase = String(b.text || b.label || '').toLowerCase().slice(0, 80);
    if (phrase && text.includes(phrase.slice(0, 20))) acknowledged += 1;
  }
  const pct = acknowledged / readinessBlockers.length;
  return clamp(50 + pct * 50);
}

function scoreOperationalCoherence({ crossProvenanceCount = 0 }) {
  let s = 60;
  if (crossProvenanceCount >= 3) s = 85;
  if (crossProvenanceCount >= 6) s = 95;
  return clamp(s);
}

function summarizeStrengthsAndWeaknesses(scores) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const strengths = sorted.slice(0, 3).filter((e) => e[1] >= 65).map(([k, v]) => `${k}: ${v}`);
  const weaknesses = sorted.slice(-3).filter((e) => e[1] < 60).map(([k, v]) => `${k}: ${v}`);
  return { strengths, weaknesses };
}

function buildRecommendations(scores) {
  const recs = [];
  if (scores.strategic_alignment < 60) recs.push('Generate this draft with a pursuit context so the prompt-provenance block is included.');
  if (scores.completeness < 60) recs.push('Expand the draft to cover the standard sections (executive summary, approach, past performance, staffing, pricing, timeline, compliance).');
  if (scores.evaluator_alignment < 60) recs.push('Use evaluatorAlignment.service to identify missing evaluator priorities and add positioning to address them.');
  if (scores.differentiation < 60) recs.push('Add explicit differentiator phrasing (unique, proprietary, specialized, etc.) and tie each to a concrete proof point.');
  if (scores.clarity < 60) recs.push('Shorten long sentences and replace dense vocabulary; aim for 12-25 words per sentence and an average word length below 6.5.');
  if (scores.readiness_consistency < 60) recs.push('Acknowledge open readiness blockers explicitly in the draft so the proposal narrative matches the pursuit\'s actual state.');
  if (scores.groundedness < 60) recs.push('Run groundedness.analyze() to identify unsupported claims; add citations or remove unsupported language.');
  if (scores.operational_coherence < 60) recs.push('Ensure provenance/lineage hot-path wiring is firing for this draft — there should be at least 3 cross_provenance rows pointing at this output.');
  return recs;
}

async function scoreOutput(outputId, { organizationId = null, persist = true, actor = null } = {}) {
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (!output) { const err = new Error(`Output ${outputId} not found`); err.code = 'NOT_FOUND'; throw err; }

  // Pull context.
  let provenance = null;
  let contextSections = [];
  if (output.promptProvenanceId) {
    provenance = await PromptProvenance.findByPk(Number(output.promptProvenanceId));
    if (provenance) contextSections = Array.isArray(provenance.includedSections) ? provenance.includedSections : [];
  }
  let readinessBlockers = [];
  if (provenance && provenance.pursuitId) {
    try {
      const pursuit = await PursuitWorkspace.findByPk(Number(provenance.pursuitId));
      if (pursuit && pursuit.metadata && Array.isArray(pursuit.metadata.readiness_blockers)) {
        readinessBlockers = pursuit.metadata.readiness_blockers;
      }
    } catch (e) { /* */ }
  }
  // Latest groundedness / coherence / alignment sub-scores if already computed.
  const [g, c, a] = await Promise.all([
    GroundednessAnalysis.findOne({ where: { opportunityOutputId: Number(outputId) }, order: [['computed_at', 'DESC']] }),
    StrategicCoherence.findOne({ where: { opportunityOutputId: Number(outputId) }, order: [['computed_at', 'DESC']] }),
    EvaluatorAlignment.findOne({ where: { opportunityOutputId: Number(outputId) }, order: [['computed_at', 'DESC']] }),
  ]);
  const crossCount = await CrossProvenance.count({
    where: { subjectKind: 'opportunity_output', subjectId: String(outputId) },
  });

  const scores = {
    strategic_alignment: scoreStrategicAlignment({ contextSections, hasProvenance: !!provenance }),
    completeness: scoreCompleteness({ content: output.content }),
    evaluator_alignment: a ? a.alignmentScore : 50,
    differentiation: scoreDifferentiation({ content: output.content }),
    clarity: scoreClarity({ content: output.content }),
    readiness_consistency: scoreReadinessConsistency({ readinessBlockers, content: output.content }),
    groundedness: g ? g.groundednessScore : 50,
    operational_coherence: c ? c.coherenceScore : scoreOperationalCoherence({ crossProvenanceCount: crossCount }),
  };
  const composite = clamp(Object.entries(WEIGHTS).reduce(
    (acc, [k, w]) => acc + (scores[k] || 0) * w, 0,
  ));
  const classification = classify(composite);
  const { strengths, weaknesses } = summarizeStrengthsAndWeaknesses(scores);
  const recommendations = buildRecommendations(scores);

  if (persist) {
    try {
      await ProposalQuality.create({
        organizationId: organizationId == null ? output.organizationId : Number(organizationId),
        opportunityOutputId: Number(outputId),
        pursuitId: provenance ? provenance.pursuitId : null,
        compositeScore: composite,
        strategicAlignmentScore: scores.strategic_alignment,
        completenessScore: scores.completeness,
        evaluatorAlignmentScore: scores.evaluator_alignment,
        differentiationScore: scores.differentiation,
        clarityScore: scores.clarity,
        readinessConsistencyScore: scores.readiness_consistency,
        groundednessScore: scores.groundedness,
        operationalCoherenceScore: scores.operational_coherence,
        classification,
        strengths, weaknesses, recommendations,
        metadata: { actor, cross_provenance_count: crossCount },
      });
    } catch (e) {
      logger.warn('proposalQuality.scoreOutput persist failed', { error: e.message });
    }
  }
  return {
    output_id: Number(outputId),
    composite_score: composite, classification,
    sub_scores: scores, strengths, weaknesses, recommendations,
    weights: WEIGHTS,
    governance_note: 'Recommendation-only. The proposal content is unchanged.',
  };
}

async function latestForOutput(outputId) {
  const row = await ProposalQuality.findOne({
    where: { opportunityOutputId: Number(outputId) },
    order: [['computed_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

async function summarize({ organizationId = null, sinceDays = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (sinceDays) where.computedAt = { [Op.gte]: new Date(Date.now() - Number(sinceDays) * 86400_000) };
  const rows = await ProposalQuality.findAll({ where, limit: 1000 });
  if (rows.length === 0) return { count: 0, avg_composite: 0, by_classification: {} };
  const avg = Math.round(rows.reduce((a, r) => a + r.compositeScore, 0) / rows.length);
  const byClass = {};
  for (const r of rows) byClass[r.classification] = (byClass[r.classification] || 0) + 1;
  return { count: rows.length, avg_composite: avg, by_classification: byClass, weights: WEIGHTS };
}

async function topRecent({ organizationId = null, limit = 10 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await ProposalQuality.findAll({
    where, order: [['composite_score', 'DESC']],
    limit: Math.min(50, Number(limit) || 10),
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  WEIGHTS, CLASSIFICATION_THRESHOLDS,
  classify, clamp,
  scoreCompleteness, scoreClarity, scoreDifferentiation,
  scoreStrategicAlignment, scoreReadinessConsistency, scoreOperationalCoherence,
  buildRecommendations,
  scoreOutput, latestForOutput, summarize, topRecent,
};
