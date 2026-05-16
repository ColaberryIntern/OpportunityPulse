// Deep Research Phase 14 — evaluator alignment intelligence.
//
// Matches the proposal content against evaluator priorities + recurring
// agency signals + strategic patterns from the pursuit's capture strategy.
// Deterministic n-gram matching; no AI inference.

const { Op } = require('sequelize');
const {
  EvaluatorAlignment, OpportunityOutput, PromptProvenance,
} = require('../models');
const captureStrategy = require('./captureStrategy.service');
const logger = require('../logging/logger');

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Match a priority string against the content. Returns true if the first
// 18-char prefix of the normalized priority appears.
function matches(priority, content) {
  const p = normalize(priority);
  if (p.length < 5) return false;
  const probe = p.slice(0, 18);
  return normalize(content).includes(probe);
}

async function analyze(outputId, { organizationId = null, persist = true } = {}) {
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (!output) { const err = new Error(`Output ${outputId} not found`); err.code = 'NOT_FOUND'; throw err; }

  let pursuitId = null;
  let captureContext = null;
  if (output.promptProvenanceId) {
    const prov = await PromptProvenance.findByPk(Number(output.promptProvenanceId));
    if (prov) {
      pursuitId = prov.pursuitId;
      if (pursuitId) {
        try {
          const cap = await captureStrategy.getForPursuit(pursuitId);
          if (cap) captureContext = cap;
        } catch (e) { /* */ }
      }
    }
  }

  const priorities = (captureContext && Array.isArray(captureContext.evaluator_priorities))
    ? captureContext.evaluator_priorities : [];
  const recurring = (captureContext && captureContext.recurring_agency_summary)
    ? [captureContext.recurring_agency_summary] : [];
  const patterns = (captureContext && Array.isArray(captureContext.strategic_patterns))
    ? captureContext.strategic_patterns : [];

  const addressed = [];
  const missing = [];
  const recurringSignals = [];
  const patternsMatched = [];

  for (const p of priorities) {
    if (matches(p, output.content)) addressed.push(p);
    else missing.push(p);
  }
  for (const r of recurring) {
    if (matches(r, output.content)) recurringSignals.push(r);
  }
  for (const pat of patterns) {
    if (matches(pat, output.content)) patternsMatched.push(pat);
  }

  const total = priorities.length;
  let alignmentScore;
  if (total === 0) {
    alignmentScore = 50;  // no priorities to align against
  } else {
    const base = Math.round((addressed.length / total) * 80);
    const bonus = Math.min(20, recurringSignals.length * 5 + patternsMatched.length * 5);
    alignmentScore = Math.max(0, Math.min(100, base + bonus));
  }

  if (persist) {
    try {
      await EvaluatorAlignment.create({
        organizationId: organizationId == null ? output.organizationId : Number(organizationId),
        opportunityOutputId: Number(outputId),
        pursuitId,
        alignmentScore,
        prioritiesTotal: total,
        prioritiesAddressed: addressed.length,
        missingPriorities: missing.slice(0, 20),
        addressedPriorities: addressed.slice(0, 20),
        recurringAgencySignals: recurringSignals.slice(0, 10),
        strategicPatternsMatched: patternsMatched.slice(0, 10),
      });
    } catch (e) {
      logger.warn('evaluatorAlignment.analyze persist failed', { error: e.message });
    }
  }

  return {
    output_id: Number(outputId),
    alignment_score: alignmentScore,
    priorities_total: total,
    priorities_addressed: addressed.length,
    missing_priorities: missing,
    addressed_priorities: addressed,
    recurring_agency_signals: recurringSignals,
    strategic_patterns_matched: patternsMatched,
    governance_note: 'Deterministic n-gram match against the pursuit\'s capture strategy. Recommendation-only.',
  };
}

async function latestForOutput(outputId) {
  const row = await EvaluatorAlignment.findOne({
    where: { opportunityOutputId: Number(outputId) },
    order: [['computed_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

async function summarize({ organizationId = null, sinceDays = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (sinceDays) where.computedAt = { [Op.gte]: new Date(Date.now() - Number(sinceDays) * 86400_000) };
  const rows = await EvaluatorAlignment.findAll({ where, limit: 1000 });
  if (rows.length === 0) return { count: 0, avg_alignment: 0 };
  const avg = Math.round(rows.reduce((a, r) => a + r.alignmentScore, 0) / rows.length);
  return { count: rows.length, avg_alignment: avg };
}

module.exports = {
  normalize, matches,
  analyze, latestForOutput, summarize,
};
