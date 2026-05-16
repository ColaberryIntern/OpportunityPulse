// Deep Research Phase 13 — cross-system provenance.
//
// Append-only log answering "why does this exist / what created it /
// what context produced it" for every operational object. This is a
// generalized layer above Phase 12's prompt-specific provenance — it
// records arbitrary subject↔source links across pursuits, drafts,
// packages, compliance matrices, capture strategies, queue jobs,
// governance actions, SLA escalations, artifact selections, and
// approvals.

const { Op } = require('sequelize');
const { CrossProvenance } = require('../models');
const logger = require('../logging/logger');

const VALID_SUBJECT_KINDS = [
  'pursuit', 'opportunity', 'opportunity_output', 'submission_package',
  'compliance_matrix', 'compliance_item', 'capture_strategy',
  'worker_job', 'queue_entry', 'sla_event', 'workflow_assignment',
  'artifact', 'proposal_artifact', 'rfp_attachment',
  'governance_event', 'audit_event',
];

const VALID_PROVENANCE_KINDS = [
  'source', 'dependency', 'generation', 'operator', 'prompt',
  'workflow', 'derived_from', 'attached_to', 'evaluated_by',
  'approved_by', 'spawned_by', 'cancelled_by', 'augmented_by',
];

async function record({
  organizationId = null, subjectKind, subjectId,
  provenanceKind, sourceKind = null, sourceId = null,
  pursuitId = null, actorEmail = null, summary = null, payload = {},
} = {}) {
  if (!subjectKind || !subjectId || !provenanceKind) {
    logger.warn('crossProvenance.record: missing required fields');
    return null;
  }
  try {
    return await CrossProvenance.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      subjectKind: String(subjectKind).slice(0, 64),
      subjectId: String(subjectId).slice(0, 128),
      provenanceKind: String(provenanceKind).slice(0, 64),
      sourceKind: sourceKind ? String(sourceKind).slice(0, 64) : null,
      sourceId: sourceId == null ? null : String(sourceId).slice(0, 128),
      pursuitId: pursuitId == null ? null : Number(pursuitId),
      actorEmail,
      summary: summary == null ? null : String(summary).slice(0, 512),
      payload: payload || {},
    });
  } catch (e) {
    logger.warn('crossProvenance.record failed', { error: e.message });
    return null;
  }
}

// Record N edges in one call. Soft-fail per row.
async function recordBatch(rows = []) {
  const out = [];
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    const x = await record(r);
    if (x) out.push(x.toJSON());
  }
  return { recorded: out.length };
}

async function forSubject(subjectKind, subjectId, { organizationId = null, limit = 100 } = {}) {
  const where = { subjectKind, subjectId: String(subjectId) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await CrossProvenance.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function forPursuit(pursuitId, { organizationId = null, limit = 200 } = {}) {
  const where = { pursuitId: Number(pursuitId) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await CrossProvenance.findAll({
    where, order: [['created_at', 'ASC']],
    limit: Math.min(500, Number(limit) || 200),
  });
  return rows.map((r) => r.toJSON());
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await CrossProvenance.count({ where });
  const last24 = await CrossProvenance.count({
    where: { ...where, createdAt: { [Op.gt]: new Date(Date.now() - 86400_000) } },
  });
  return {
    total_records: total,
    records_last_24h: last24,
    valid_subject_kinds: VALID_SUBJECT_KINDS,
    valid_provenance_kinds: VALID_PROVENANCE_KINDS,
  };
}

module.exports = {
  VALID_SUBJECT_KINDS, VALID_PROVENANCE_KINDS,
  record, recordBatch, forSubject, forPursuit, summarize,
};
