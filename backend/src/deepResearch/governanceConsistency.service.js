// Deep Research Phase 13 — governance consistency engine.
//
// Detects inconsistent / orphan / stale governance states across SLA
// events, workflow assignments, audit trail, and lineage. ALL findings
// are persisted as recommendations to governance_consistency. Never
// auto-corrects governance state.

const { Op } = require('sequelize');
const {
  SlaEvent, WorkflowAssignment, AuditEvent, GovernanceConsistency,
  PromptProvenance, OpportunityOutput, GovernanceEvent,
} = require('../models');
const logger = require('../logging/logger');

const VALID_CHECKS = [
  'stale_open_sla',           // SLA event > 60 days open with no actions
  'orphan_workflow',          // workflow_assignment with no matching subject
  'lineage_gap',              // OpportunityOutput with no provenance row
  'approval_bypass',          // governance_event.event_kind='workflow.approved' with no acknowledged predecessor
  'conflicting_approval',     // workflow ends 'rejected' but a 'approve' audit event exists
  'invalid_transition',       // workflow status transitions outside legal moves
  'lineage_governance_gap',   // pursuit with no governance_events recorded
];

const STALE_DAYS_SLA = Number(process.env.DEEP_RESEARCH_CONSISTENCY_STALE_SLA_DAYS) || 60;

async function recordFinding({
  organizationId = null, checkKind, severity = 50,
  subjectKind = null, subjectId = null, pursuitId = null,
  summary = null, recommendation = null, metadata = {},
}) {
  if (!VALID_CHECKS.includes(checkKind)) {
    logger.warn('governanceConsistency.recordFinding: invalid kind', { checkKind });
    return null;
  }
  try {
    // Idempotent on (check_kind, subject_kind, subject_id, status='open'):
    // re-running the scanner doesn't create duplicates.
    const where = {
      checkKind, subjectKind, subjectId: subjectId == null ? null : String(subjectId),
      status: 'open',
    };
    const existing = await GovernanceConsistency.findOne({ where });
    if (existing) {
      existing.severity = Math.max(existing.severity, severity);
      existing.metadata = { ...(existing.metadata || {}), ...metadata };
      await existing.save();
      return existing.toJSON();
    }
    const row = await GovernanceConsistency.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      checkKind, severity,
      subjectKind, subjectId: subjectId == null ? null : String(subjectId),
      pursuitId: pursuitId == null ? null : Number(pursuitId),
      summary: summary == null ? null : String(summary).slice(0, 512),
      recommendation,
      metadata: metadata || {},
    });
    return row.toJSON();
  } catch (e) {
    logger.warn('governanceConsistency.recordFinding failed', { error: e.message });
    return null;
  }
}

async function scanStaleSla({ organizationId = null } = {}) {
  const cutoff = new Date(Date.now() - STALE_DAYS_SLA * 86400_000);
  const where = { status: 'open', detectedAt: { [Op.lt]: cutoff } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const stale = await SlaEvent.findAll({ where, limit: 200 });
  const out = [];
  for (const e of stale) {
    // eslint-disable-next-line no-await-in-loop
    const f = await recordFinding({
      organizationId, checkKind: 'stale_open_sla',
      severity: Math.min(100, 50 + Math.floor((Date.now() - new Date(e.detectedAt).getTime()) / (86400_000 * 30)) * 10),
      subjectKind: 'sla_event', subjectId: String(e.id),
      pursuitId: e.scopeKind === 'pursuit' ? Number(e.scopeId) : null,
      summary: `SLA event ${e.id} (${e.slaKind}) open for >${STALE_DAYS_SLA} days`,
      recommendation: 'Acknowledge, assign, or resolve.',
      metadata: { sla_kind: e.slaKind, severity_at_check: e.severity },
    });
    if (f) out.push(f);
  }
  return { count: out.length, findings: out };
}

async function scanLineageGaps({ organizationId = null, limit = 100 } = {}) {
  const where = { promptProvenanceId: null };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const orphans = await OpportunityOutput.findAll({
    where, order: [['created_at', 'DESC']], limit: Math.min(500, Number(limit) || 100),
  });
  const out = [];
  for (const o of orphans) {
    // eslint-disable-next-line no-await-in-loop
    const f = await recordFinding({
      organizationId, checkKind: 'lineage_gap',
      severity: 40, subjectKind: 'opportunity_output', subjectId: String(o.id),
      summary: `OpportunityOutput ${o.id} (${o.type}) has no prompt provenance row`,
      recommendation: 'Outputs generated before Phase 12 won\'t have provenance. New drafts should be generated with a pursuitId for full traceability.',
    });
    if (f) out.push(f);
  }
  return { count: out.length, findings: out };
}

async function scanApprovalBypass({ organizationId = null } = {}) {
  // Find workflow_assignments that went straight to 'approved' or 'rejected'
  // without any acknowledged audit predecessor.
  const where = { status: { [Op.in]: ['approved', 'rejected'] } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const completed = await WorkflowAssignment.findAll({
    where, order: [['completed_at', 'DESC']], limit: 200,
  });
  const out = [];
  for (const w of completed) {
    const hist = Array.isArray(w.history) ? w.history : [];
    const acknowledged = hist.some((h) => /acknowledge/i.test(h.action || ''));
    if (acknowledged) continue;
    // eslint-disable-next-line no-await-in-loop
    const f = await recordFinding({
      organizationId, checkKind: 'approval_bypass',
      severity: 70,
      subjectKind: 'workflow_assignment', subjectId: String(w.id),
      pursuitId: w.pursuitId,
      summary: `Workflow ${w.id} (${w.workflowKind}) reached "${w.status}" without an acknowledge step`,
      recommendation: 'Verify the approver path. Add an acknowledge transition before approve/reject in future workflows.',
    });
    if (f) out.push(f);
  }
  return { count: out.length, findings: out };
}

async function scanOrphanWorkflows({ organizationId = null } = {}) {
  const where = { status: { [Op.in]: ['open', 'acknowledged'] } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const open = await WorkflowAssignment.findAll({ where, limit: 200 });
  const out = [];
  for (const w of open) {
    if (w.subjectKind && w.subjectId && (!w.assigneeEmail && !w.assigneeUserId)) {
      // eslint-disable-next-line no-await-in-loop
      const f = await recordFinding({
        organizationId, checkKind: 'orphan_workflow',
        severity: 50, subjectKind: 'workflow_assignment', subjectId: String(w.id),
        pursuitId: w.pursuitId,
        summary: `Workflow ${w.id} has no assignee`,
        recommendation: 'Assign an operator or close the workflow.',
      });
      if (f) out.push(f);
    }
  }
  return { count: out.length, findings: out };
}

async function runAllScans({ organizationId = null } = {}) {
  const [a, b, c, d] = await Promise.all([
    scanStaleSla({ organizationId }),
    scanLineageGaps({ organizationId, limit: 50 }),
    scanApprovalBypass({ organizationId }),
    scanOrphanWorkflows({ organizationId }),
  ]);
  return {
    organization_id: organizationId,
    counts: {
      stale_open_sla: a.count,
      lineage_gap: b.count,
      approval_bypass: c.count,
      orphan_workflow: d.count,
    },
    total_new_findings: a.count + b.count + c.count + d.count,
  };
}

async function listFindings({ organizationId = null, status = 'open', limit = 100 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (status) where.status = status;
  const rows = await GovernanceConsistency.findAll({
    where, order: [['severity', 'DESC'], ['detected_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function updateFindingStatus(id, { status, actorEmail }) {
  if (!['open', 'acknowledged', 'resolved', 'dismissed'].includes(status)) {
    const err = new Error(`Invalid status: ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await GovernanceConsistency.findByPk(Number(id));
  if (!row) { const err = new Error('Finding not found'); err.code = 'NOT_FOUND'; throw err; }
  row.status = status;
  if (status === 'resolved' || status === 'dismissed') row.resolvedAt = new Date();
  row.metadata = { ...(row.metadata || {}), last_actor: actorEmail };
  await row.save();
  return row.toJSON();
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const open = await GovernanceConsistency.count({ where: { ...where, status: 'open' } });
  const ack = await GovernanceConsistency.count({ where: { ...where, status: 'acknowledged' } });
  const resolved = await GovernanceConsistency.count({ where: { ...where, status: 'resolved' } });
  const byKind = {};
  const openRows = await GovernanceConsistency.findAll({
    where: { ...where, status: 'open' }, limit: 500,
  });
  for (const r of openRows) byKind[r.checkKind] = (byKind[r.checkKind] || 0) + 1;
  // Consistency score: 100 - penalty per open severity-weighted finding.
  let score = 100;
  const sumSeverity = openRows.reduce((acc, r) => acc + Number(r.severity || 0), 0);
  score -= Math.min(70, Math.round(sumSeverity / 10));
  score = Math.max(0, score);
  return {
    open, acknowledged: ack, resolved,
    by_kind: byKind, consistency_score: score, valid_checks: VALID_CHECKS,
  };
}

module.exports = {
  VALID_CHECKS, STALE_DAYS_SLA,
  recordFinding,
  scanStaleSla, scanLineageGaps, scanApprovalBypass, scanOrphanWorkflows,
  runAllScans, listFindings, updateFindingStatus, summarize,
};
