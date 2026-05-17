// Deep Research Phase 15 — auto-alert generation engine.
//
// Reads a fresh QualitySnapshot + the Phase 14 quality scorer rows, and
// emits idempotent quality_alerts rows when a threshold is crossed.
// Persists every operator action on an alert to quality_alert_history.
//
// RECOMMENDATION-ONLY: never auto-modifies proposals; only surfaces risk.

const { Op } = require('sequelize');
const {
  QualityAlert, QualityAlertHistory,
  ProposalQuality, GroundednessAnalysis,
  StrategicCoherence, EvaluatorAlignment, OpportunityOutput,
} = require('../models');
const auditTrail = require('./auditTrail.service');
const logger = require('../logging/logger');

const VALID_ALERT_KINDS = [
  'low_groundedness', 'contradictions_detected', 'low_coherence',
  'low_alignment', 'low_quality', 'missing_provenance',
  'weak_citation_coverage', 'stale_quality',
];

const THRESHOLDS = {
  groundedness_below: Number(process.env.DEEP_RESEARCH_ALERT_GROUNDEDNESS_BELOW) || 50,
  coherence_below: Number(process.env.DEEP_RESEARCH_ALERT_COHERENCE_BELOW) || 50,
  alignment_below: Number(process.env.DEEP_RESEARCH_ALERT_ALIGNMENT_BELOW) || 50,
  quality_below: Number(process.env.DEEP_RESEARCH_ALERT_QUALITY_BELOW) || 50,
  citation_coverage_below: Number(process.env.DEEP_RESEARCH_ALERT_CITATION_BELOW) || 30,
  stale_after_days: Number(process.env.DEEP_RESEARCH_ALERT_STALE_DAYS) || 30,
};

function severityFor(kind, value) {
  // Lower scores → higher severity. Cap at 100.
  switch (kind) {
    case 'low_groundedness':
    case 'low_coherence':
    case 'low_alignment':
    case 'low_quality':
      return Math.max(40, Math.min(100, 100 - Number(value || 0)));
    case 'weak_citation_coverage':
      return Math.max(40, Math.min(100, 100 - Number(value || 0)));
    case 'contradictions_detected':
      return Math.min(100, 50 + Number(value || 1) * 10);
    case 'missing_provenance':
      return 60;
    case 'stale_quality':
      return Math.min(100, 40 + Number(value || 0) * 2);
    default: return 50;
  }
}

function summaryFor(kind, value, outputId) {
  switch (kind) {
    case 'low_groundedness':
      return `Output #${outputId} groundedness ${value} (below ${THRESHOLDS.groundedness_below})`;
    case 'low_coherence':
      return `Output #${outputId} strategic coherence ${value} (below ${THRESHOLDS.coherence_below})`;
    case 'low_alignment':
      return `Output #${outputId} evaluator alignment ${value} (below ${THRESHOLDS.alignment_below})`;
    case 'low_quality':
      return `Output #${outputId} composite quality ${value} (below ${THRESHOLDS.quality_below})`;
    case 'contradictions_detected':
      return `Output #${outputId} has ${value} detected contradiction(s)`;
    case 'weak_citation_coverage':
      return `Output #${outputId} citation coverage ${value}% (below ${THRESHOLDS.citation_coverage_below}%)`;
    case 'missing_provenance':
      return `Output #${outputId} has no prompt_provenance row`;
    case 'stale_quality':
      return `Output #${outputId} quality score is ${value} days stale`;
    default: return `Output #${outputId}: ${kind}`;
  }
}

function recommendationFor(kind) {
  switch (kind) {
    case 'low_groundedness':
      return 'Review unsupported claims in the proposal; add citations from the artifact vault or remove unsupported language.';
    case 'low_coherence':
      return 'Reconcile the draft with the pursuit\'s capture strategy and readiness state.';
    case 'low_alignment':
      return 'Identify evaluator priorities the draft does not address; revise to add coverage.';
    case 'low_quality':
      return 'Run a full quality review and regenerate sections that score poorly.';
    case 'contradictions_detected':
      return 'Resolve the contradictory positioning before submission.';
    case 'weak_citation_coverage':
      return 'Add citations / evidence markers (per, see, attached, contract #) for major claims.';
    case 'missing_provenance':
      return 'Re-generate the draft with a pursuitId so a prompt_provenance row is recorded.';
    case 'stale_quality':
      return 'Re-run quality scoring against the latest draft.';
    default: return 'Review and act per organizational governance.';
  }
}

// Create an alert idempotently — one open alert per (output, kind).
async function emit({
  organizationId = null, alertKind,
  opportunityOutputId, pursuitId = null,
  value = null, metadata = {},
}) {
  if (!VALID_ALERT_KINDS.includes(alertKind)) {
    logger.warn('qualityAlert.emit: invalid alert kind', { alertKind });
    return null;
  }
  if (!opportunityOutputId) {
    logger.warn('qualityAlert.emit: missing opportunityOutputId');
    return null;
  }
  const where = {
    alertKind, opportunityOutputId: Number(opportunityOutputId), status: 'open',
  };
  try {
    const existing = await QualityAlert.findOne({ where });
    if (existing) {
      const sev = severityFor(alertKind, value);
      if (sev > existing.severity) {
        existing.severity = sev;
        existing.metadata = { ...(existing.metadata || {}), ...metadata, last_value: value };
        await existing.save();
      }
      return existing.toJSON();
    }
    const row = await QualityAlert.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      alertKind, severity: severityFor(alertKind, value),
      opportunityOutputId: Number(opportunityOutputId),
      pursuitId: pursuitId == null ? null : Number(pursuitId),
      summary: summaryFor(alertKind, value, opportunityOutputId),
      recommendation: recommendationFor(alertKind),
      metadata: { ...metadata, value },
    });
    return row.toJSON();
  } catch (e) {
    logger.warn('qualityAlert.emit failed', { error: e.message });
    return null;
  }
}

// Evaluate the latest scorer rows for one output and emit any threshold-
// crossing alerts. Returns the list of emitted/updated alerts.
async function evaluateOutput(outputId, { organizationId = null } = {}) {
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (!output) { const err = new Error(`Output ${outputId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const pursuitId = output.metadata && output.metadata.pursuit_id ? output.metadata.pursuit_id : null;
  const orgId = organizationId == null ? output.organizationId : organizationId;
  const out = [];

  const [pq, gr, sc, ea] = await Promise.all([
    ProposalQuality.findOne({ where: { opportunityOutputId: Number(outputId) }, order: [['computed_at', 'DESC']] }),
    GroundednessAnalysis.findOne({ where: { opportunityOutputId: Number(outputId) }, order: [['computed_at', 'DESC']] }),
    StrategicCoherence.findOne({ where: { opportunityOutputId: Number(outputId) }, order: [['computed_at', 'DESC']] }),
    EvaluatorAlignment.findOne({ where: { opportunityOutputId: Number(outputId) }, order: [['computed_at', 'DESC']] }),
  ]);

  if (pq && pq.compositeScore < THRESHOLDS.quality_below) {
    const r = await emit({ organizationId: orgId, alertKind: 'low_quality',
      opportunityOutputId: outputId, pursuitId, value: pq.compositeScore });
    if (r) out.push(r);
  }
  if (gr && gr.groundednessScore < THRESHOLDS.groundedness_below) {
    const r = await emit({ organizationId: orgId, alertKind: 'low_groundedness',
      opportunityOutputId: outputId, pursuitId, value: gr.groundednessScore });
    if (r) out.push(r);
  }
  if (gr && Number(gr.citationCoveragePct) < THRESHOLDS.citation_coverage_below) {
    const r = await emit({ organizationId: orgId, alertKind: 'weak_citation_coverage',
      opportunityOutputId: outputId, pursuitId, value: Number(gr.citationCoveragePct) });
    if (r) out.push(r);
  }
  if (sc && sc.coherenceScore < THRESHOLDS.coherence_below) {
    const r = await emit({ organizationId: orgId, alertKind: 'low_coherence',
      opportunityOutputId: outputId, pursuitId, value: sc.coherenceScore });
    if (r) out.push(r);
  }
  if (sc && Array.isArray(sc.conflicts) && sc.conflicts.length > 0) {
    const r = await emit({ organizationId: orgId, alertKind: 'contradictions_detected',
      opportunityOutputId: outputId, pursuitId, value: sc.conflicts.length });
    if (r) out.push(r);
  }
  if (ea && ea.alignmentScore < THRESHOLDS.alignment_below) {
    const r = await emit({ organizationId: orgId, alertKind: 'low_alignment',
      opportunityOutputId: outputId, pursuitId, value: ea.alignmentScore });
    if (r) out.push(r);
  }
  if (!output.promptProvenanceId) {
    const r = await emit({ organizationId: orgId, alertKind: 'missing_provenance',
      opportunityOutputId: outputId, pursuitId });
    if (r) out.push(r);
  }
  // Stale: most recent scorer is older than the threshold.
  const newestScorer = Math.max(
    pq ? new Date(pq.computedAt).getTime() : 0,
    gr ? new Date(gr.computedAt).getTime() : 0,
    sc ? new Date(sc.computedAt).getTime() : 0,
    ea ? new Date(ea.computedAt).getTime() : 0,
  );
  if (newestScorer > 0) {
    const daysAgo = Math.floor((Date.now() - newestScorer) / 86400_000);
    if (daysAgo > THRESHOLDS.stale_after_days) {
      const r = await emit({ organizationId: orgId, alertKind: 'stale_quality',
        opportunityOutputId: outputId, pursuitId, value: daysAgo });
      if (r) out.push(r);
    }
  }
  return { output_id: Number(outputId), emitted: out.length, alerts: out };
}

async function updateAlertStatus(id, { status, actorEmail = null, notes = null }) {
  if (!['open', 'acknowledged', 'assigned', 'resolved', 'dismissed', 'escalated'].includes(status)) {
    const err = new Error(`Invalid status: ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await QualityAlert.findByPk(Number(id));
  if (!row) { const err = new Error('Alert not found'); err.code = 'NOT_FOUND'; throw err; }
  const fromStatus = row.status;
  row.status = status;
  if (status === 'resolved' || status === 'dismissed') row.resolvedAt = new Date();
  if (notes) row.metadata = { ...(row.metadata || {}), last_notes: notes };
  await row.save();
  await QualityAlertHistory.create({
    organizationId: row.organizationId,
    qualityAlertId: row.id, action: status,
    actorEmail, fromStatus, toStatus: status, notes,
  });
  await auditTrail.record({
    organizationId: row.organizationId, actorEmail,
    actionKind: 'governance', actionVerb: `quality_alert.${status}`,
    subjectKind: 'quality_alert', subjectId: String(row.id),
    payload: { from: fromStatus, to: status },
  });
  return row.toJSON();
}

async function listAlerts({ organizationId = null, status = 'open', limit = 100 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (status) where.status = status;
  const rows = await QualityAlert.findAll({
    where, order: [['severity', 'DESC'], ['detected_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function alertHistory(alertId) {
  const rows = await QualityAlertHistory.findAll({
    where: { qualityAlertId: Number(alertId) },
    order: [['created_at', 'ASC']], limit: 200,
  });
  return rows.map((r) => r.toJSON());
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const open = await QualityAlert.count({ where: { ...where, status: 'open' } });
  const ack = await QualityAlert.count({ where: { ...where, status: 'acknowledged' } });
  const resolved = await QualityAlert.count({ where: { ...where, status: 'resolved' } });
  const critical = await QualityAlert.count({
    where: { ...where, status: 'open', severity: { [Op.gte]: 80 } },
  });
  const byKind = {};
  const openRows = await QualityAlert.findAll({
    where: { ...where, status: 'open' }, limit: 500,
  });
  for (const r of openRows) byKind[r.alertKind] = (byKind[r.alertKind] || 0) + 1;
  return {
    open, acknowledged: ack, resolved, critical,
    by_kind: byKind, valid_kinds: VALID_ALERT_KINDS, thresholds: THRESHOLDS,
  };
}

module.exports = {
  VALID_ALERT_KINDS, THRESHOLDS,
  severityFor, summaryFor, recommendationFor,
  emit, evaluateOutput, updateAlertStatus,
  listAlerts, alertHistory, summarize,
};
