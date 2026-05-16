// Deep Research Phase 11 — SLA escalation workflow.
//
// Wraps the Phase 10 sla_events table with operator workflow: acknowledge,
// assign, escalate, resolve. Generates a daily digest. RECOMMENDATION-ONLY:
// the service never auto-resolves, auto-reassigns, or auto-punishes.

const { Op } = require('sequelize');
const {
  SlaEvent, SlaAcknowledgement, WorkflowAssignment,
} = require('../models');
const logger = require('../logging/logger');
const auditTrail = require('./auditTrail.service');

const VALID_ACTIONS = [
  'acknowledge', 'assign', 'escalate', 'reassign', 'note', 'resolve', 'dismiss',
];

const ESCALATION_LADDER = ['observer', 'reviewer', 'proposal_writer',
  'capture_manager', 'org_admin', 'super_admin'];

function nextEscalationRole(currentRole) {
  if (!currentRole) return 'capture_manager';
  const idx = ESCALATION_LADDER.indexOf(currentRole);
  if (idx < 0 || idx >= ESCALATION_LADDER.length - 1) return 'org_admin';
  return ESCALATION_LADDER[idx + 1];
}

// One workflow action over an SLA event. All actions create an
// SlaAcknowledgement row for full audit history.
async function actOnEvent(slaEventId, {
  action, actorUserId = null, actorEmail = null, organizationId = null,
  assigneeUserId = null, assigneeEmail = null, assigneeRole = null,
  notes = null, metadata = {},
} = {}) {
  if (!VALID_ACTIONS.includes(action)) {
    const err = new Error(`Invalid SLA action: ${action}`); err.code = 'BAD_INPUT'; throw err;
  }
  const event = await SlaEvent.findByPk(Number(slaEventId));
  if (!event) {
    const err = new Error(`SLA event ${slaEventId} not found`); err.code = 'NOT_FOUND'; throw err;
  }

  const ack = await SlaAcknowledgement.create({
    slaEventId: event.id,
    organizationId: organizationId == null ? null : Number(organizationId),
    actorUserId: actorUserId == null ? null : Number(actorUserId),
    actorEmail,
    action,
    severityAtAction: event.severity,
    assigneeUserId: assigneeUserId == null ? null : Number(assigneeUserId),
    notes, metadata,
  });

  // Update the event itself for terminal actions.
  if (action === 'acknowledge' && event.status === 'open') {
    event.status = 'acknowledged';
  } else if (action === 'resolve') {
    event.status = 'resolved';
  } else if (action === 'dismiss') {
    event.status = 'dismissed';
  } else if (action === 'escalate') {
    event.severity = Math.min(100, Number(event.severity || 40) + 15);
  }
  await event.save();

  // Assign / reassign — create or update a WorkflowAssignment row.
  if ((action === 'assign' || action === 'reassign') && (assigneeUserId || assigneeEmail)) {
    const where = {
      subjectKind: 'sla_event', subjectId: String(event.id),
      status: { [Op.in]: ['open', 'acknowledged'] },
    };
    let assign = await WorkflowAssignment.findOne({ where });
    if (assign) {
      assign.history = [...(assign.history || []), {
        at: new Date().toISOString(),
        action: 'reassign',
        from_user_id: assign.assigneeUserId,
        from_email: assign.assigneeEmail,
        to_user_id: assigneeUserId,
        to_email: assigneeEmail,
        actor_email: actorEmail,
      }];
      assign.assigneeUserId = assigneeUserId == null ? null : Number(assigneeUserId);
      assign.assigneeEmail = assigneeEmail;
      assign.assigneeRole = assigneeRole;
      assign.assignedBy = actorEmail;
      assign.assignedAt = new Date();
      await assign.save();
    } else {
      assign = await WorkflowAssignment.create({
        organizationId: organizationId == null ? null : Number(organizationId),
        workflowKind: 'sla_resolution',
        subjectKind: 'sla_event', subjectId: String(event.id),
        pursuitId: event.scopeKind === 'pursuit' ? Number(event.scopeId) : null,
        assigneeUserId: assigneeUserId == null ? null : Number(assigneeUserId),
        assigneeEmail, assigneeRole, status: 'open',
        priority: Math.min(100, Math.max(10, Number(event.severity || 50))),
        assignedBy: actorEmail,
      });
    }
  }

  // Audit trail.
  try {
    await auditTrail.record({
      organizationId, actorUserId, actorEmail,
      actionKind: 'sla', actionVerb: action,
      subjectKind: 'sla_event', subjectId: String(event.id),
      pursuitId: event.scopeKind === 'pursuit' ? Number(event.scopeId) : null,
      payload: { severity: event.severity, status: event.status, notes },
    });
  } catch (e) { /* audit must not break flow */ }

  return {
    event: event.toJSON(),
    acknowledgement: ack.toJSON(),
  };
}

async function listOpen({ organizationId = null, limit = 100 } = {}) {
  // Phase 10 sla_events is not yet org-scoped; organizationId reserved for
  // a future Phase 10-table migration. See governanceDashboard for context.
  // eslint-disable-next-line no-unused-vars
  const _orgId = organizationId;
  const where = { status: { [Op.in]: ['open', 'acknowledged'] } };
  const rows = await SlaEvent.findAll({
    where, order: [['severity', 'DESC'], ['updated_at', 'ASC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function historyForEvent(slaEventId) {
  const rows = await SlaAcknowledgement.findAll({
    where: { slaEventId: Number(slaEventId) },
    order: [['created_at', 'ASC']], limit: 200,
  });
  return rows.map((r) => r.toJSON());
}

// Daily digest payload: open events + new-since-yesterday + ack/resolve
// counts. Service returns the structured payload; the actual email send is
// done by the existing source-health-agent pipeline (Phase 11 follow-up).
async function generateDigest({ organizationId = null } = {}) {
  // Phase 10 sla_events is not yet org-scoped (sla_acknowledgements IS).
  // Filtering only the ack table by org for now; full sla_events scoping
  // arrives with the planned Phase 10-table org_id migration.
  const open = await SlaEvent.count({ where: { status: 'open' } });
  const ack = await SlaEvent.count({ where: { status: 'acknowledged' } });
  const resolved24h = await SlaAcknowledgement.count({
    where: {
      ...(organizationId != null ? { organizationId: Number(organizationId) } : {}),
      action: 'resolve',
      createdAt: { [Op.gt]: new Date(Date.now() - 86400_000) },
    },
  });
  const newCritical = await SlaEvent.findAll({
    where: { severity: { [Op.gte]: 80 }, status: { [Op.in]: ['open', 'acknowledged'] } },
    order: [['severity', 'DESC']], limit: 10,
  });

  return {
    generated_at: new Date().toISOString(),
    organization_id: organizationId,
    counts: {
      open, acknowledged: ack, resolved_last_24h: resolved24h,
    },
    critical_open: newCritical.map((r) => r.toJSON()),
    recommendation: open === 0 ? 'No open SLA pressure.'
      : `Acknowledge ${open} open + ${ack} acknowledged events — escalate any > 80 severity.`,
  };
}

async function summarize({ organizationId = null } = {}) {
  const digest = await generateDigest({ organizationId });
  return digest.counts;
}

module.exports = {
  VALID_ACTIONS, ESCALATION_LADDER,
  nextEscalationRole, actOnEvent, listOpen, historyForEvent,
  generateDigest, summarize,
};
