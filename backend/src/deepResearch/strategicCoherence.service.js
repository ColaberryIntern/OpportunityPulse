// Deep Research Phase 14 — strategic coherence intelligence.
//
// Reads the pursuit context (capture strategy + readiness blockers) at
// generation time + the OpportunityOutput content, and detects:
//   - contradictory positioning
//   - inconsistent value propositions
//   - weak differentiators
//   - pursuit-to-proposal mismatch
//   - readiness inconsistencies
//
// Deterministic + inspectable. No AI inference.

const { Op } = require('sequelize');
const {
  StrategicCoherence, OpportunityOutput, PromptProvenance,
} = require('../models');
const captureStrategy = require('./captureStrategy.service');
const logger = require('../logging/logger');

const CONTRADICTION_PAIRS = [
  ['low cost', 'premium'],
  ['low-cost', 'premium'],
  ['affordable', 'enterprise-grade'],
  ['agile', 'enterprise scale'],
  ['proven', 'experimental'],
  ['established', 'startup'],
  ['fully automated', 'human in the loop'],
  ['rapid', 'meticulous'],
];

function detectContradictions(text) {
  const lower = String(text || '').toLowerCase();
  const found = [];
  for (const [a, b] of CONTRADICTION_PAIRS) {
    if (lower.includes(a) && lower.includes(b)) {
      found.push({ a, b, evidence: 'both phrases present in the same draft' });
    }
  }
  return found;
}

function detectPursuitAlignment({ content, captureContext }) {
  if (!captureContext) return { score: 50, signals: [] };
  const lower = String(content || '').toLowerCase();
  const priorities = captureContext.evaluator_priorities || [];
  const differentiators = captureContext.differentiators || [];
  const signals = [];
  let prioritiesHit = 0;
  for (const p of priorities) {
    const term = String(p).toLowerCase().slice(0, 60);
    if (term.length >= 5 && lower.includes(term.slice(0, 20))) {
      prioritiesHit += 1;
      signals.push({ kind: 'priority_match', text: p });
    }
  }
  let diffHit = 0;
  for (const d of differentiators) {
    const term = String(d).toLowerCase().slice(0, 60);
    if (term.length >= 5 && lower.includes(term.slice(0, 20))) {
      diffHit += 1;
      signals.push({ kind: 'differentiator_match', text: d });
    }
  }
  const denom = Math.max(1, priorities.length + differentiators.length);
  const score = Math.round(((prioritiesHit + diffHit) / denom) * 100);
  return { score: Math.min(100, Math.max(0, score)), signals };
}

function detectPositioningAlignment({ content, captureContext }) {
  if (!captureContext) return { score: 50, signals: [] };
  const lower = String(content || '').toLowerCase();
  const positioning = captureContext.positioning_recommendations || [];
  let hits = 0;
  const signals = [];
  for (const p of positioning) {
    const term = String(p).toLowerCase().slice(0, 80);
    if (term.length >= 5 && lower.includes(term.slice(0, 20))) {
      hits += 1;
      signals.push({ kind: 'positioning_present', text: p });
    }
  }
  const score = positioning.length === 0 ? 60
    : Math.round((hits / positioning.length) * 100);
  return { score: Math.min(100, Math.max(0, score)), signals };
}

function detectReadinessAlignment({ content, readinessBlockers = [] }) {
  if (!readinessBlockers || readinessBlockers.length === 0) {
    return { score: 100, signals: [] };
  }
  const lower = String(content || '').toLowerCase();
  let acknowledged = 0;
  const signals = [];
  for (const b of readinessBlockers) {
    const phrase = String(b.text || b.label || '').toLowerCase().slice(0, 80);
    if (!phrase) continue;
    if (lower.includes(phrase.slice(0, 20))) {
      acknowledged += 1;
      signals.push({ kind: 'blocker_acknowledged', text: b.text || b.label });
    } else {
      signals.push({ kind: 'blocker_unacknowledged', text: b.text || b.label });
    }
  }
  const score = Math.round((acknowledged / readinessBlockers.length) * 100);
  return { score, signals };
}

async function analyze(outputId, { organizationId = null, persist = true } = {}) {
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (!output) { const err = new Error(`Output ${outputId} not found`); err.code = 'NOT_FOUND'; throw err; }

  let captureContext = null;
  let readinessBlockers = [];
  let pursuitId = null;
  if (output.promptProvenanceId) {
    const prov = await PromptProvenance.findByPk(Number(output.promptProvenanceId));
    if (prov) {
      pursuitId = prov.pursuitId;
      if (prov.contextInputs && prov.contextInputs.capture) {
        captureContext = prov.contextInputs.capture;
      }
      // Try to refresh capture strategy directly.
      if (pursuitId) {
        try {
          const cap = await captureStrategy.getForPursuit(pursuitId);
          if (cap) captureContext = cap;
        } catch (e) { /* */ }
      }
    }
  }

  const conflicts = detectContradictions(output.content);
  const pursuit = detectPursuitAlignment({ content: output.content, captureContext });
  const positioning = detectPositioningAlignment({ content: output.content, captureContext });
  const readiness = detectReadinessAlignment({ content: output.content, readinessBlockers });

  // Composite coherence: weighted average of the three alignments, minus
  // a penalty per detected contradiction.
  let coherence = Math.round(
    (pursuit.score * 0.45)
    + (positioning.score * 0.35)
    + (readiness.score * 0.20),
  );
  coherence -= Math.min(30, conflicts.length * 15);
  coherence = Math.max(0, Math.min(100, coherence));

  const consistencies = [];
  if (pursuit.score >= 70) consistencies.push('Pursuit priorities are well-reflected in the draft');
  if (positioning.score >= 70) consistencies.push('Positioning recommendations are present in the draft');
  if (readiness.score >= 80) consistencies.push('Readiness blockers are acknowledged in the draft');

  if (persist) {
    try {
      await StrategicCoherence.create({
        organizationId: organizationId == null ? output.organizationId : Number(organizationId),
        opportunityOutputId: Number(outputId),
        pursuitId,
        coherenceScore: coherence,
        conflicts,
        consistencies,
        pursuitAlignmentScore: pursuit.score,
        positioningAlignmentScore: positioning.score,
        readinessAlignmentScore: readiness.score,
        metadata: {
          pursuit_signals: pursuit.signals.slice(0, 5),
          positioning_signals: positioning.signals.slice(0, 5),
        },
      });
    } catch (e) {
      logger.warn('strategicCoherence.analyze persist failed', { error: e.message });
    }
  }
  return {
    output_id: Number(outputId),
    coherence_score: coherence,
    conflicts, consistencies,
    sub_scores: {
      pursuit_alignment: pursuit.score,
      positioning_alignment: positioning.score,
      readiness_alignment: readiness.score,
    },
    governance_note: 'Deterministic coherence detection. Recommendation-only.',
  };
}

async function latestForOutput(outputId) {
  const row = await StrategicCoherence.findOne({
    where: { opportunityOutputId: Number(outputId) },
    order: [['computed_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

async function summarize({ organizationId = null, sinceDays = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (sinceDays) where.computedAt = { [Op.gte]: new Date(Date.now() - Number(sinceDays) * 86400_000) };
  const rows = await StrategicCoherence.findAll({ where, limit: 1000 });
  if (rows.length === 0) return { count: 0, avg_coherence: 0 };
  const avg = Math.round(rows.reduce((a, r) => a + r.coherenceScore, 0) / rows.length);
  const withConflicts = rows.filter((r) => Array.isArray(r.conflicts) && r.conflicts.length > 0).length;
  return {
    count: rows.length, avg_coherence: avg,
    outputs_with_conflicts: withConflicts,
  };
}

module.exports = {
  CONTRADICTION_PAIRS,
  detectContradictions, detectPursuitAlignment,
  detectPositioningAlignment, detectReadinessAlignment,
  analyze, latestForOutput, summarize,
};
