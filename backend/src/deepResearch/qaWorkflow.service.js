// Deep Research Phase 15 — AI QA workflow integration.
//
// Quality-review assignments + remediation lifecycle. Wraps the
// qa_workflows table with create/assign/transition/note/override
// operations. Each action also writes a qa_assignments audit row +
// audit_events row + cross-provenance link.
//
// RECOMMENDATION + WORKFLOW only — never auto-modifies proposals.

const { Op } = require('sequelize');
const {
  QaWorkflow, QaAssignment,
} = require('../models');
const auditTrail = require('./auditTrail.service');
const crossProvenance = require('./crossProvenance.service');
const logger = require('../logging/logger');

const VALID_KINDS = [
  'quality_review', 'groundedness_remediation', 'coherence_review',
  'alignment_review', 'contradictions_resolution', 'provenance_backfill',
];

const VALID_STATUSES = [
  'open', 'acknowledged', 'in_progress',
  'completed', 'rejected', 'overridden', 'cancelled', 'escalated',
];

function severityForAlertKind(alertKind) {
  switch (alertKind) {
    case 'contradictions_detected': return 75;
    case 'low_groundedness': return 70;
    case 'low_quality': return 65;
    case 'low_alignment': return 60;
    case 'low_coherence': return 60;
    case 'weak_citation_coverage': return 55;
    case 'missing_provenance': return 50;
    case 'stale_quality': return 40;
    default: return 50;
  }
}

async function createWorkflow({
  organizationId = null, workflowKind,
  opportunityOutputId = null, pursuitId = null, qualityAlertId = null,
  assigneeUserId = null, assigneeEmail = null,
  severity = 50, dueAt = null, assignedBy = null,
  reviewerNotes = null, metadata = {},
}) {
  if (!VALID_KINDS.includes(workflowKind)) {
    const err = new Error(`Invalid qa workflow_kind: ${workflowKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await QaWorkflow.create({
    organizationId: organizationId == null ? null : Number(organizationId),
    workflowKind,
    opportunityOutputId: opportunityOutputId == null ? null : Number(opportunityOutputId),
    pursuitId: pursuitId == null ? null : Number(pursuitId),
    qualityAlertId: qualityAlertId == null ? null : Number(qualityAlertId),
    assigneeUserId: assigneeUserId == null ? null : Number(assigneeUserId),
    assigneeEmail,
    severity: Math.min(100, Math.max(0, Number(severity) || 50)),
    status: 'open',
    dueAt: dueAt ? new Date(dueAt) : null,
    reviewerNotes,
    history: [{ at: new Date().toISOString(), action: 'created', actor: assignedBy }],
    metadata,
  });
  if (assigneeUserId || assigneeEmail) {
    await QaAssignment.create({
      organizationId: row.organizationId,
      qaWorkflowId: row.id, action: 'assigned',
      toUserId: assigneeUserId, toEmail: assigneeEmail,
      assignedBy,
    });
  }
  try {
    await auditTrail.record({
      organizationId: row.organizationId, actorEmail: assignedBy,
      actionKind: 'governance', actionVerb: 'qa_workflow.create',
      subjectKind: 'qa_workflow', subjectId: String(row.id),
      pursuitId,
      payload: { workflow_kind: workflowKind, assignee: assigneeEmail },
    });
    if (opportunityOutputId) {
      await crossProvenance.record({
        organizationId: row.organizationId, actorEmail: assignedBy,
        subjectKind: 'qa_workflow', subjectId: String(row.id),
        provenanceKind: 'workflow',
        sourceKind: 'opportunity_output', sourceId: String(opportunityOutputId),
        pursuitId, summary: 'QA workflow created for output',
      });
    }
  } catch (e) { /* swallow */ }
  return row.toJSON();
}

async function transition(id, {
  status, actorEmail = null,
  reviewerNotes = null, remediationSummary = null, overrideReason = null,
  organizationId = null,
}) {
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`Invalid qa status: ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await QaWorkflow.findByPk(Number(id));
  if (!row) { const err = new Error('QA workflow not found'); err.code = 'NOT_FOUND'; throw err; }
  const prev = row.status;
  row.status = status;
  if (status === 'acknowledged' && !row.acknowledgedAt) row.acknowledgedAt = new Date();
  if (['completed', 'rejected', 'overridden', 'cancelled'].includes(status) && !row.completedAt) {
    row.completedAt = new Date();
  }
  row.history = [...(row.history || []), {
    at: new Date().toISOString(),
    action: `transition_${prev}_to_${status}`,
    actor: actorEmail, reviewerNotes, remediationSummary, overrideReason,
  }];
  if (reviewerNotes) row.reviewerNotes = `${row.reviewerNotes ? `${row.reviewerNotes}\n` : ''}${reviewerNotes}`;
  if (remediationSummary) row.remediationSummary = remediationSummary;
  if (overrideReason) row.overrideReason = overrideReason;
  await row.save();
  try {
    await auditTrail.record({
      organizationId: organizationId == null ? row.organizationId : organizationId,
      actorEmail,
      actionKind: 'governance', actionVerb: `qa_workflow.${status}`,
      subjectKind: 'qa_workflow', subjectId: String(row.id),
      pursuitId: row.pursuitId,
      payload: { from: prev, to: status },
    });
  } catch (e) { /* swallow */ }
  return row.toJSON();
}

async function reassign(id, {
  newAssigneeUserId = null, newAssigneeEmail = null,
  reassignedBy = null, notes = null, organizationId = null,
}) {
  const row = await QaWorkflow.findByPk(Number(id));
  if (!row) { const err = new Error('QA workflow not found'); err.code = 'NOT_FOUND'; throw err; }
  const fromEmail = row.assigneeEmail;
  const fromUserId = row.assigneeUserId;
  row.assigneeUserId = newAssigneeUserId;
  row.assigneeEmail = newAssigneeEmail;
  row.history = [...(row.history || []), {
    at: new Date().toISOString(),
    action: 'reassigned',
    actor: reassignedBy,
    from_email: fromEmail, to_email: newAssigneeEmail,
  }];
  await row.save();
  await QaAssignment.create({
    organizationId: organizationId == null ? row.organizationId : organizationId,
    qaWorkflowId: row.id, action: 'reassigned',
    fromUserId, fromEmail,
    toUserId: newAssigneeUserId, toEmail: newAssigneeEmail,
    assignedBy: reassignedBy, notes,
  });
  return row.toJSON();
}

async function listWorkflows({
  organizationId = null, status = null, assigneeUserId = null,
  workflowKind = null, limit = 100,
} = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (status) where.status = status;
  if (assigneeUserId != null) where.assigneeUserId = Number(assigneeUserId);
  if (workflowKind) where.workflowKind = workflowKind;
  const rows = await QaWorkflow.findAll({
    where, order: [['severity', 'DESC'], ['assigned_at', 'ASC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function workloadByReviewer({ organizationId = null } = {}) {
  const where = { status: { [Op.in]: ['open', 'acknowledged', 'in_progress'] } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await QaWorkflow.findAll({ where, limit: 1000 });
  const out = {};
  for (const r of rows) {
    const k = r.assigneeEmail || (r.assigneeUserId ? `user_${r.assigneeUserId}` : 'unassigned');
    if (!out[k]) {
      out[k] = {
        assignee: k, assignee_user_id: r.assigneeUserId,
        count: 0, by_status: {}, by_kind: {}, highest_severity: 0,
      };
    }
    out[k].count += 1;
    out[k].by_status[r.status] = (out[k].by_status[r.status] || 0) + 1;
    out[k].by_kind[r.workflowKind] = (out[k].by_kind[r.workflowKind] || 0) + 1;
    if (r.severity > out[k].highest_severity) out[k].highest_severity = r.severity;
  }
  return Object.values(out).sort((a, b) => b.count - a.count);
}

async function bottlenecks({ organizationId = null } = {}) {
  const where = { status: { [Op.in]: ['open', 'acknowledged', 'in_progress'] } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await QaWorkflow.findAll({ where, limit: 1000 });
  const byKind = {};
  const now = Date.now();
  for (const r of rows) {
    const ageDays = Math.floor((now - new Date(r.assignedAt).getTime()) / 86400_000);
    if (!byKind[r.workflowKind]) byKind[r.workflowKind] = { kind: r.workflowKind, count: 0, ageSum: 0, maxAge: 0 };
    byKind[r.workflowKind].count += 1;
    byKind[r.workflowKind].ageSum += ageDays;
    byKind[r.workflowKind].maxAge = Math.max(byKind[r.workflowKind].maxAge, ageDays);
  }
  return Object.values(byKind).map((b) => ({
    ...b, avg_age_days: b.count > 0 ? Math.round(b.ageSum / b.count) : 0,
  })).sort((a, b) => b.avg_age_days - a.avg_age_days);
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const open = await QaWorkflow.count({ where: { ...where, status: 'open' } });
  const ack = await QaWorkflow.count({ where: { ...where, status: 'acknowledged' } });
  const inProgress = await QaWorkflow.count({ where: { ...where, status: 'in_progress' } });
  const completed = await QaWorkflow.count({ where: { ...where, status: 'completed' } });
  const overdue = await QaWorkflow.count({
    where: {
      ...where,
      status: { [Op.in]: ['open', 'acknowledged', 'in_progress'] },
      dueAt: { [Op.lt]: new Date(), [Op.ne]: null },
    },
  });
  // Score: 100 - 4*open - 6*overdue.
  const score = Math.max(0, Math.min(100, 100 - open * 4 - overdue * 6));
  return {
    open, acknowledged: ack, in_progress: inProgress, completed,
    overdue, workflow_score: score, valid_kinds: VALID_KINDS,
  };
}

module.exports = {
  VALID_KINDS, VALID_STATUSES,
  severityForAlertKind,
  createWorkflow, transition, reassign,
  listWorkflows, workloadByReviewer, bottlenecks, summarize,
};
