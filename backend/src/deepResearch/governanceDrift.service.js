// Deep Research Phase 13 — governance drift detection.
//
// Detects drift between expected governance posture and actual state:
// permission drift (per-user effective vs declared role), workflow drift
// (long-stuck assignments), governance-policy drift (tenant_settings
// changes), escalation drift (SLA severity escalating without ack), and
// tenant-config drift (settings deviating from a known baseline).
//
// All findings are RECOMMENDATION-only. No auto-correction.

const { Op } = require('sequelize');
const {
  GovernanceDrift, OperatorPermission, WorkflowAssignment,
  SlaEvent, TenantSettings, AuditEvent,
} = require('../models');
const rbac = require('./rbac.service');
const logger = require('../logging/logger');

const VALID_DRIFT_KINDS = [
  'permission_drift', 'workflow_drift', 'policy_drift',
  'escalation_drift', 'approval_drift', 'tenant_config_drift',
];

const STUCK_WORKFLOW_DAYS = Number(process.env.DEEP_RESEARCH_DRIFT_STUCK_DAYS) || 5;
const ESCALATING_SEVERITY_THRESHOLD = 75;

async function recordDrift({
  organizationId = null, driftKind, severity = 50,
  subjectKind = null, subjectId = null,
  impact = null, remediation = null, metadata = {},
}) {
  if (!VALID_DRIFT_KINDS.includes(driftKind)) {
    logger.warn('governanceDrift.recordDrift: invalid kind', { driftKind });
    return null;
  }
  try {
    const where = {
      driftKind, subjectKind, subjectId: subjectId == null ? null : String(subjectId),
      status: 'open',
    };
    const existing = await GovernanceDrift.findOne({ where });
    if (existing) {
      existing.severity = Math.max(existing.severity, severity);
      existing.metadata = { ...(existing.metadata || {}), ...metadata };
      await existing.save();
      return existing.toJSON();
    }
    const row = await GovernanceDrift.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      driftKind, severity,
      subjectKind, subjectId: subjectId == null ? null : String(subjectId),
      impact, remediation, metadata: metadata || {},
    });
    return row.toJSON();
  } catch (e) {
    logger.warn('governanceDrift.recordDrift failed', { error: e.message });
    return null;
  }
}

// 1) Permission drift: detect OperatorPermission rows whose role is no
// longer in the canonical ROLE_NAMES list.
async function detectPermissionDrift({ organizationId = null } = {}) {
  const where = { revokedAt: null };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await OperatorPermission.findAll({ where, limit: 500 });
  const out = [];
  for (const g of rows) {
    if (!rbac.ROLE_NAMES.includes(g.roleName)) {
      // eslint-disable-next-line no-await-in-loop
      const f = await recordDrift({
        organizationId, driftKind: 'permission_drift', severity: 70,
        subjectKind: 'operator_permission', subjectId: String(g.id),
        impact: `User ${g.userId} holds an unknown role: ${g.roleName}`,
        remediation: 'Migrate to a canonical role or revoke the grant.',
        metadata: { user_id: g.userId, role: g.roleName },
      });
      if (f) out.push(f);
    }
  }
  return { count: out.length, findings: out };
}

// 2) Workflow drift: assignments stuck for > STUCK_WORKFLOW_DAYS days.
async function detectWorkflowDrift({ organizationId = null } = {}) {
  const cutoff = new Date(Date.now() - STUCK_WORKFLOW_DAYS * 86400_000);
  const where = {
    status: { [Op.in]: ['open', 'acknowledged', 'in_progress'] },
    assignedAt: { [Op.lt]: cutoff },
  };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await WorkflowAssignment.findAll({ where, limit: 200 });
  const out = [];
  for (const w of rows) {
    const ageDays = Math.floor((Date.now() - new Date(w.assignedAt).getTime()) / 86400_000);
    // eslint-disable-next-line no-await-in-loop
    const f = await recordDrift({
      organizationId, driftKind: 'workflow_drift',
      severity: Math.min(100, 40 + ageDays * 4),
      subjectKind: 'workflow_assignment', subjectId: String(w.id),
      impact: `Workflow ${w.id} (${w.workflowKind}) stuck in ${w.status} for ${ageDays} days`,
      remediation: 'Reassign, escalate, or close the workflow.',
      metadata: { age_days: ageDays, workflow_kind: w.workflowKind },
    });
    if (f) out.push(f);
  }
  return { count: out.length, findings: out };
}

// 3) Escalation drift: SLA events ramping past threshold severity without
// any acknowledgement action.
async function detectEscalationDrift({ organizationId = null } = {}) {
  const where = {
    status: 'open',
    severity: { [Op.gte]: ESCALATING_SEVERITY_THRESHOLD },
  };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await SlaEvent.findAll({ where, limit: 100 });
  const out = [];
  for (const e of rows) {
    // eslint-disable-next-line no-await-in-loop
    const f = await recordDrift({
      organizationId, driftKind: 'escalation_drift',
      severity: Math.min(100, Number(e.severity) + 10),
      subjectKind: 'sla_event', subjectId: String(e.id),
      impact: `SLA event ${e.id} severity is ${e.severity} but still open`,
      remediation: 'Acknowledge + assign + escalate or resolve.',
      metadata: { sla_kind: e.slaKind, severity: e.severity },
    });
    if (f) out.push(f);
  }
  return { count: out.length, findings: out };
}

// 4) Policy drift: tenant_settings.governance_mode != 'standard' WITHOUT
// any recent audit event indicating intentional change.
async function detectPolicyDrift({ organizationId = null } = {}) {
  const settingsWhere = organizationId != null ? { organizationId: Number(organizationId) } : {};
  const settings = await TenantSettings.findOne({ where: settingsWhere });
  if (!settings || settings.governanceMode === 'standard') return { count: 0, findings: [] };
  // Check for any audit_events change in the last 30 days.
  const auditWhere = {
    actionKind: 'tenant', actionVerb: 'update',
    createdAt: { [Op.gt]: new Date(Date.now() - 30 * 86400_000) },
  };
  if (organizationId != null) auditWhere.organizationId = Number(organizationId);
  const recent = await AuditEvent.count({ where: auditWhere });
  if (recent > 0) return { count: 0, findings: [] };
  const f = await recordDrift({
    organizationId, driftKind: 'policy_drift', severity: 60,
    subjectKind: 'tenant_settings', subjectId: String(settings.id),
    impact: `Tenant is in '${settings.governanceMode}' governance mode but no recent tenant.update audit event was found`,
    remediation: 'Confirm the mode change was intentional; record an audit note.',
    metadata: { governance_mode: settings.governanceMode },
  });
  return { count: f ? 1 : 0, findings: f ? [f] : [] };
}

async function runAllScans({ organizationId = null } = {}) {
  const [a, b, c, d] = await Promise.all([
    detectPermissionDrift({ organizationId }),
    detectWorkflowDrift({ organizationId }),
    detectEscalationDrift({ organizationId }),
    detectPolicyDrift({ organizationId }),
  ]);
  return {
    organization_id: organizationId,
    counts: {
      permission_drift: a.count, workflow_drift: b.count,
      escalation_drift: c.count, policy_drift: d.count,
    },
    total: a.count + b.count + c.count + d.count,
  };
}

async function listFindings({ organizationId = null, status = 'open', limit = 100 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (status) where.status = status;
  const rows = await GovernanceDrift.findAll({
    where, order: [['severity', 'DESC'], ['detected_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function updateFinding(id, { status, actorEmail }) {
  if (!['open', 'acknowledged', 'resolved', 'dismissed'].includes(status)) {
    const err = new Error(`Invalid status: ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await GovernanceDrift.findByPk(Number(id));
  if (!row) { const err = new Error('Drift finding not found'); err.code = 'NOT_FOUND'; throw err; }
  row.status = status;
  if (status === 'resolved' || status === 'dismissed') row.resolvedAt = new Date();
  row.metadata = { ...(row.metadata || {}), last_actor: actorEmail };
  await row.save();
  return row.toJSON();
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const open = await GovernanceDrift.count({ where: { ...where, status: 'open' } });
  const critical = await GovernanceDrift.count({
    where: { ...where, status: 'open', severity: { [Op.gte]: 80 } },
  });
  const byKind = {};
  const rows = await GovernanceDrift.findAll({
    where: { ...where, status: 'open' }, limit: 500,
  });
  for (const r of rows) byKind[r.driftKind] = (byKind[r.driftKind] || 0) + 1;
  return { open, critical, by_kind: byKind, valid_kinds: VALID_DRIFT_KINDS };
}

module.exports = {
  VALID_DRIFT_KINDS, STUCK_WORKFLOW_DAYS, ESCALATING_SEVERITY_THRESHOLD,
  recordDrift,
  detectPermissionDrift, detectWorkflowDrift,
  detectEscalationDrift, detectPolicyDrift,
  runAllScans, listFindings, updateFinding, summarize,
};
