// Deep Research Phase 14 — groundedness + citation intelligence.
//
// Deterministic claim-classification heuristics over the OpportunityOutput
// content + the vault excerpts that were available at generation time.
// Returns groundedness_score + per-claim categorization + unsupported
// samples for the operator to inspect.

const { Op } = require('sequelize');
const {
  GroundednessAnalysis, OpportunityOutput,
} = require('../models');
const logger = require('../logging/logger');

// Strong-claim markers — assertions that should be grounded.
const CLAIM_MARKERS = [
  'we have', 'we deliver', 'we provide', 'we built', 'we developed',
  'we deployed', 'our team', 'our experience', 'years of',
  '% improvement', '% increase', '% reduction', '% cost savings',
  'patented', 'proprietary', 'certified', 'awarded',
  'industry-leading', 'best-in-class', 'world-class', 'unique',
  'exclusively', 'guarantee', 'proven',
];

// Evidence markers — phrases that indicate citation or evidence.
const EVIDENCE_MARKERS = [
  'as shown in', 'per ', 'according to', 'reference:',
  'see attached', 'see appendix', 'documented in', 'in section',
  '(see', 'cited', 'past performance #', 'contract #',
  'attached coi', 'attached resume', 'attached',
];

const WEAK_MARKERS = [
  'we believe', 'we feel', 'we think', 'likely', 'should be able',
  'we plan to', 'we intend to', 'in the future',
];

function splitIntoSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasMarker(sentence, markers) {
  const lower = sentence.toLowerCase();
  for (const m of markers) if (lower.includes(m)) return true;
  return false;
}

// Classify one sentence as supported / weak / unsupported / inert.
function classifySentence(sentence) {
  const isClaim = hasMarker(sentence, CLAIM_MARKERS);
  if (!isClaim) return 'inert';
  const isEvidence = hasMarker(sentence, EVIDENCE_MARKERS);
  const isWeak = hasMarker(sentence, WEAK_MARKERS);
  if (isEvidence) return 'supported';
  if (isWeak) return 'weak';
  return 'unsupported';
}

// Compute the groundedness analysis for one OpportunityOutput.
async function analyze(outputId, { organizationId = null, persist = true } = {}) {
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (!output) { const err = new Error(`Output ${outputId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const content = String(output.content || '');
  const sentences = splitIntoSentences(content);
  const buckets = { supported: 0, weak: 0, unsupported: 0, inert: 0 };
  const unsupportedSamples = [];
  for (const s of sentences) {
    const cls = classifySentence(s);
    buckets[cls] += 1;
    if (cls === 'unsupported' && unsupportedSamples.length < 5) {
      unsupportedSamples.push(s.slice(0, 240));
    }
  }
  const claimsTotal = buckets.supported + buckets.weak + buckets.unsupported;
  const claimsSupported = buckets.supported;
  const claimsWeak = buckets.weak;
  const claimsUnsupported = buckets.unsupported;
  let groundednessScore;
  if (claimsTotal === 0) {
    groundednessScore = 60;  // no strong claims = neutral
  } else {
    const supportedPct = (claimsSupported + claimsWeak * 0.3) / claimsTotal;
    groundednessScore = Math.round(supportedPct * 100);
  }
  const citationCoveragePct = claimsTotal > 0
    ? Math.round((claimsSupported / claimsTotal) * 10000) / 100 : 100;

  // Try to surface what evidence sources were available (vault excerpts).
  const evidenceSources = [];
  try {
    const md = output.metadata || {};
    if (Array.isArray(md.evergreen_docs_used)) {
      for (const d of md.evergreen_docs_used) {
        evidenceSources.push({ kind: d.type, name: d.name, scope: d.scope });
      }
    }
  } catch (e) { /* */ }

  if (persist) {
    try {
      await GroundednessAnalysis.create({
        organizationId: organizationId == null ? output.organizationId : Number(organizationId),
        opportunityOutputId: Number(outputId),
        pursuitId: null,
        groundednessScore,
        claimsTotal, claimsSupported, claimsWeak, claimsUnsupported,
        citationCoveragePct,
        unsupportedSamples,
        evidenceSources,
      });
    } catch (e) {
      logger.warn('groundedness.analyze persist failed', { error: e.message });
    }
  }
  return {
    output_id: Number(outputId),
    groundedness_score: groundednessScore,
    claims_total: claimsTotal,
    claims_supported: claimsSupported,
    claims_weak: claimsWeak,
    claims_unsupported: claimsUnsupported,
    citation_coverage_pct: citationCoveragePct,
    unsupported_samples: unsupportedSamples,
    evidence_sources: evidenceSources,
    governance_note: 'Deterministic claim heuristic. Recommendation-only.',
  };
}

async function latestForOutput(outputId) {
  const row = await GroundednessAnalysis.findOne({
    where: { opportunityOutputId: Number(outputId) },
    order: [['computed_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

async function summarize({ organizationId = null, sinceDays = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (sinceDays) where.computedAt = { [Op.gte]: new Date(Date.now() - Number(sinceDays) * 86400_000) };
  const rows = await GroundednessAnalysis.findAll({ where, limit: 1000 });
  if (rows.length === 0) return { count: 0, avg_groundedness: 0 };
  const avg = Math.round(rows.reduce((a, r) => a + r.groundednessScore, 0) / rows.length);
  return {
    count: rows.length, avg_groundedness: avg,
    avg_unsupported_per_output: Math.round(
      rows.reduce((a, r) => a + r.claimsUnsupported, 0) / rows.length,
    ),
  };
}

module.exports = {
  CLAIM_MARKERS, EVIDENCE_MARKERS, WEAK_MARKERS,
  splitIntoSentences, hasMarker, classifySentence,
  analyze, latestForOutput, summarize,
};
