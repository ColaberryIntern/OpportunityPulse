// Deep Research Phase 13 — approval workflow provenance.
//
// Append-only log of every approval chain action, derived from
// WorkflowAssignment.history JSONB + AuditEvent. Supports per-subject
// replay, per-actor lineage, override tracking, bottleneck detection.

const { Op } = require('sequelize');
const {
  ApprovalLineage, WorkflowAssignment, AuditEvent,
} = require('../models');
const logger = require('../logging/logger');

const VALID_ACTIONS = [
  'created', 'acknowledged', 'in_progress', 'approved',
  'rejected', 'completed', 'cancelled', 'escalated',
  'reassigned', 'overridden', 'noted',
];

async function record({
  organizationId = null, workflowAssignmentId = null,
  subjectKind, subjectId, pursuitId = null,
  action, actorUserId = null, actorEmail = null,
  fromState = null, toState = null, durationSeconds = null,
  notes = null, overrideReason = null, metadata = {},
}) {
  if (!subjectKind || !subjectId || !action) {
    logger.warn('approvalProvenance.record: missing required fields');
    return null;
  }
  if (!VALID_ACTIONS.includes(action)) {
    logger.warn('approvalProvenance.record: invalid action', { action });
    return null;
  }
  try {
    return await ApprovalLineage.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      workflowAssignmentId: workflowAssignmentId == null ? null : Number(workflowAssignmentId),
      subjectKind, subjectId: String(subjectId),
      pursuitId: pursuitId == null ? null : Number(pursuitId),
      action,
      actorUserId: actorUserId == null ? null : Number(actorUserId),
      actorEmail,
      fromState, toState,
      durationSeconds,
      notes, overrideReason,
      metadata: metadata || {},
    });
  } catch (e) {
    logger.warn('approvalProvenance.record failed', { error: e.message });
    return null;
  }
}

// Synthesize approval lineage from existing WorkflowAssignment history
// JSONB. Idempotent — safe to re-run.
async function backfillFromWorkflows({ organizationId = null, limit = 200 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const workflows = await WorkflowAssignment.findAll({
    where, order: [['updated_at', 'DESC']], limit: Math.min(500, Number(limit) || 200),
  });
  let recorded = 0;
  let skipped = 0;
  for (const w of workflows) {
    const hist = Array.isArray(w.history) ? w.history : [];
    let prevAt = w.assignedAt;
    for (let i = 0; i < hist.length; i += 1) {
      const h = hist[i];
      const actionStr = String(h.action || '').toLowerCase();
      let action = 'noted';
      let fromState = null;
      let toState = null;
      const m = actionStr.match(/transition_(\w+)_to_(\w+)/);
      if (m) { fromState = m[1]; toState = m[2]; action = m[2] === 'completed' ? 'completed' : (VALID_ACTIONS.includes(m[2]) ? m[2] : 'noted'); }
      else if (VALID_ACTIONS.includes(actionStr)) action = actionStr;
      else if (actionStr.includes('reassign')) action = 'reassigned';
      else if (actionStr.includes('created')) action = 'created';
      const at = h.at ? new Date(h.at) : new Date();
      const dur = prevAt ? Math.round((at.getTime() - new Date(prevAt).getTime()) / 1000) : null;
      // Idempotency: check for an existing row at this (wa_id, action, created_at)
      // eslint-disable-next-line no-await-in-loop
      const existing = await ApprovalLineage.findOne({
        where: {
          workflowAssignmentId: w.id, action,
          createdAt: { [Op.between]: [new Date(at.getTime() - 1000), new Date(at.getTime() + 1000)] },
        },
      });
      if (existing) { skipped += 1; prevAt = at; continue; }
      // eslint-disable-next-line no-await-in-loop
      await record({
        organizationId: w.organizationId,
        workflowAssignmentId: w.id,
        subjectKind: w.subjectKind, subjectId: w.subjectId,
        pursuitId: w.pursuitId,
        action, actorEmail: h.actor_email || null,
        fromState, toState,
        durationSeconds: dur,
        notes: h.notes || null,
        metadata: { synthesized_from: 'workflow_history' },
      });
      recorded += 1;
      prevAt = at;
    }
  }
  return { workflows_scanned: workflows.length, recorded, skipped };
}

async function listForWorkflow(workflowAssignmentId) {
  const rows = await ApprovalLineage.findAll({
    where: { workflowAssignmentId: Number(workflowAssignmentId) },
    order: [['created_at', 'ASC']], limit: 200,
  });
  return rows.map((r) => r.toJSON());
}

async function listForSubject(subjectKind, subjectId, { organizationId = null, limit = 100 } = {}) {
  const where = { subjectKind, subjectId: String(subjectId) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await ApprovalLineage.findAll({
    where, order: [['created_at', 'ASC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function bottlenecks({ organizationId = null, limit = 25 } = {}) {
  // Rows with the longest durationSeconds = slowest steps.
  const where = { durationSeconds: { [Op.ne]: null } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await ApprovalLineage.findAll({
    where, order: [['duration_seconds', 'DESC']],
    limit: Math.min(100, Number(limit) || 25),
  });
  return rows.map((r) => ({
    ...r.toJSON(),
    duration_human: humanizeSeconds(r.durationSeconds),
  }));
}

function humanizeSeconds(s) {
  if (s == null) return null;
  const days = Math.floor(s / 86400);
  if (days > 0) return `${days}d ${Math.floor((s % 86400) / 3600)}h`;
  const hours = Math.floor(s / 3600);
  if (hours > 0) return `${hours}h ${Math.floor((s % 3600) / 60)}m`;
  const mins = Math.floor(s / 60);
  if (mins > 0) return `${mins}m`;
  return `${s}s`;
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await ApprovalLineage.count({ where });
  const overrides = await ApprovalLineage.count({
    where: { ...where, action: 'overridden' },
  });
  return {
    total_lineage_rows: total,
    overrides,
    valid_actions: VALID_ACTIONS,
  };
}

module.exports = {
  VALID_ACTIONS,
  record, backfillFromWorkflows,
  listForWorkflow, listForSubject, bottlenecks,
  humanizeSeconds, summarize,
};
