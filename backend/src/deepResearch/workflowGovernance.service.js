// Deep Research Phase 11 — operator workflow governance.
//
// Approval workflows, review checkpoints, escalation ownership, assignment
// history, operator workload visibility, operational accountability.

const { Op } = require('sequelize');
const { WorkflowAssignment, GovernanceEvent, User } = require('../models');
const logger = require('../logging/logger');
const auditTrail = require('./auditTrail.service');

const VALID_WORKFLOW_KINDS = [
  'pursuit_approval', 'draft_review', 'compliance_review',
  'submission_approval', 'sla_resolution', 'artifact_review',
  'package_release',
];

const VALID_STATUSES = [
  'open', 'acknowledged', 'in_progress', 'approved',
  'rejected', 'completed', 'cancelled', 'escalated',
];

async function createAssignment({
  organizationId = null, workflowKind, subjectKind, subjectId,
  pursuitId = null, assigneeUserId = null, assigneeEmail = null,
  assigneeRole = null, priority = 50, dueAt = null, assignedBy = null,
  notes = null,
} = {}) {
  if (!VALID_WORKFLOW_KINDS.includes(workflowKind)) {
    const err = new Error(`Invalid workflow_kind: ${workflowKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  if (!subjectKind || !subjectId) {
    const err = new Error('subjectKind + subjectId required'); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await WorkflowAssignment.create({
    organizationId: organizationId == null ? null : Number(organizationId),
    workflowKind, subjectKind, subjectId: String(subjectId),
    pursuitId: pursuitId == null ? null : Number(pursuitId),
    assigneeUserId: assigneeUserId == null ? null : Number(assigneeUserId),
    assigneeEmail, assigneeRole,
    status: 'open',
    priority: Math.min(100, Math.max(0, Number(priority) || 50)),
    dueAt: dueAt ? new Date(dueAt) : null,
    assignedBy,
    notes,
    history: [{
      at: new Date().toISOString(),
      action: 'created',
      actor_email: assignedBy,
    }],
  });
  try {
    await auditTrail.record({
      organizationId, actorEmail: assignedBy,
      actionKind: 'governance', actionVerb: 'workflow.create',
      subjectKind, subjectId,
      pursuitId,
      payload: { workflow_kind: workflowKind, assignee: assigneeEmail },
    });
  } catch (e) { /* swallow */ }
  return row.toJSON();
}

async function transition(id, {
  status, actorEmail = null, actorUserId = null,
  organizationId = null, notes = null,
} = {}) {
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`Invalid status: ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await WorkflowAssignment.findByPk(Number(id));
  if (!row) { const err = new Error('Workflow assignment not found'); err.code = 'NOT_FOUND'; throw err; }
  const prevStatus = row.status;
  row.status = status;
  if (status === 'acknowledged' && !row.acknowledgedAt) row.acknowledgedAt = new Date();
  if (['approved', 'rejected', 'completed', 'cancelled'].includes(status) && !row.completedAt) {
    row.completedAt = new Date();
  }
  row.history = [...(row.history || []), {
    at: new Date().toISOString(),
    action: `transition_${prevStatus}_to_${status}`,
    actor_email: actorEmail,
    notes,
  }];
  if (notes) row.notes = `${row.notes ? `${row.notes}\n` : ''}${notes}`;
  await row.save();

  await GovernanceEvent.create({
    organizationId,
    eventKind: `workflow.${status}`,
    severity: status === 'rejected' ? 70 : status === 'escalated' ? 80 : 40,
    subjectKind: row.subjectKind, subjectId: row.subjectId,
    pursuitId: row.pursuitId,
    actorEmail,
    summary: `${row.workflowKind} ${prevStatus} → ${status} by ${actorEmail || 'system'}`,
    metadata: { from: prevStatus, to: status, notes },
  });
  try {
    await auditTrail.record({
      organizationId, actorUserId, actorEmail,
      actionKind: 'governance', actionVerb: status,
      subjectKind: 'workflow_assignment', subjectId: String(row.id),
      pursuitId: row.pursuitId,
      payload: { from: prevStatus, to: status, workflow_kind: row.workflowKind },
    });
  } catch (e) { /* swallow */ }
  // Phase 15: lineage edge — workflow transition is an operator action
  // against a subject. Soft-fails.
  try {
    // eslint-disable-next-line global-require
    const lineageEdgeWriter = require('./lineageEdgeWriter.service');
    lineageEdgeWriter.helpers.workflowAssigned({
      workflowId: row.id, subjectKind: row.subjectKind, subjectId: row.subjectId,
      pursuitId: row.pursuitId, organizationId, actorEmail,
    });
    // eslint-disable-next-line global-require
    const sseHotPaths = require('./sseHotPaths.service');
    sseHotPaths.publish.workflowTransition({
      workflow_id: row.id, from: prevStatus, to: status,
      workflow_kind: row.workflowKind,
    }, { organizationId });
  } catch (e) { /* swallow */ }
  return row.toJSON();
}

async function listAssignments({
  organizationId = null, assigneeUserId = null, status = null,
  workflowKind = null, pursuitId = null, limit = 100,
} = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (assigneeUserId != null) where.assigneeUserId = Number(assigneeUserId);
  if (status) where.status = status;
  if (workflowKind) where.workflowKind = workflowKind;
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  const rows = await WorkflowAssignment.findAll({
    where, order: [['priority', 'DESC'], ['assigned_at', 'ASC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

// Operator workload — rolled up by assignee.
async function workloadByOperator({ organizationId = null } = {}) {
  const where = { status: { [Op.in]: ['open', 'acknowledged', 'in_progress'] } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await WorkflowAssignment.findAll({ where, limit: 1000 });
  const map = {};
  for (const r of rows) {
    const key = r.assigneeEmail || `user_${r.assigneeUserId || 'unassigned'}`;
    if (!map[key]) {
      map[key] = {
        assignee: key, assignee_user_id: r.assigneeUserId,
        count: 0, by_status: {}, by_workflow_kind: {},
        oldest_assigned_at: r.assignedAt,
        highest_priority: 0,
      };
    }
    map[key].count += 1;
    map[key].by_status[r.status] = (map[key].by_status[r.status] || 0) + 1;
    map[key].by_workflow_kind[r.workflowKind] = (map[key].by_workflow_kind[r.workflowKind] || 0) + 1;
    if (r.priority > map[key].highest_priority) map[key].highest_priority = r.priority;
    if (new Date(r.assignedAt) < new Date(map[key].oldest_assigned_at)) {
      map[key].oldest_assigned_at = r.assignedAt;
    }
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// Approval aging report — workflows older than N days still not completed.
async function approvalAging({ organizationId = null, agingDays = 3 } = {}) {
  const where = {
    status: { [Op.in]: ['open', 'acknowledged', 'in_progress'] },
    assignedAt: { [Op.lt]: new Date(Date.now() - Number(agingDays) * 86400_000) },
  };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await WorkflowAssignment.findAll({
    where, order: [['assigned_at', 'ASC']], limit: 100,
  });
  return rows.map((r) => {
    const ageMs = Date.now() - new Date(r.assignedAt).getTime();
    return {
      ...r.toJSON(),
      age_days: Math.floor(ageMs / 86400_000),
    };
  });
}

// Governance bottleneck detector — kinds where median age > 2x normal.
async function detectBottlenecks({ organizationId = null } = {}) {
  const where = { status: { [Op.in]: ['open', 'acknowledged'] } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await WorkflowAssignment.findAll({ where, limit: 1000 });
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
    ...b,
    avg_age_days: b.count > 0 ? Math.round(b.ageSum / b.count) : 0,
  })).sort((a, b) => b.avg_age_days - a.avg_age_days);
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const open = await WorkflowAssignment.count({ where: { ...where, status: 'open' } });
  const ack = await WorkflowAssignment.count({ where: { ...where, status: 'acknowledged' } });
  const inProgress = await WorkflowAssignment.count({ where: { ...where, status: 'in_progress' } });
  const overdue = await WorkflowAssignment.count({
    where: {
      ...where,
      status: { [Op.in]: ['open', 'acknowledged', 'in_progress'] },
      dueAt: { [Op.lt]: new Date(), [Op.ne]: null },
    },
  });
  return { open, acknowledged: ack, in_progress: inProgress, overdue };
}

module.exports = {
  VALID_WORKFLOW_KINDS, VALID_STATUSES,
  createAssignment, transition, listAssignments,
  workloadByOperator, approvalAging, detectBottlenecks, summarize,
};
