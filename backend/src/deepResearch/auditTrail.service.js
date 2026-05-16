// Deep Research Phase 11 — append-only audit trail.
//
// Records every operator + system action with actor attribution. Designed
// to be cheap (single INSERT, no joins) so callers can log liberally
// without measurable perf cost.
//
// IMPORTANT: this table is append-only. There is no update() or delete()
// surface. All exports return immutable views of historical state.

const { Op } = require('sequelize');
const { AuditEvent } = require('../models');
const logger = require('../logging/logger');

// Canonical action_kind alphabet. Kept tight so dashboards stay aggregable.
const VALID_KINDS = [
  'pursuit', 'draft', 'compliance', 'artifact', 'package',
  'queue', 'worker', 'sla', 'governance', 'rbac', 'tenant',
  'observability', 'login', 'export', 'integration',
];

// Common verbs across kinds. Free-form is allowed for forward-compat.
const COMMON_VERBS = [
  'create', 'update', 'delete', 'activate', 'deactivate', 'cancel',
  'enqueue', 'drain', 'retry', 'acknowledge', 'assign', 'resolve',
  'approve', 'reject', 'upload', 'download', 'view', 'export',
  'grant', 'revoke', 'login', 'logout', 'subscribe', 'unsubscribe',
];

// Record one event. Soft-fails — never throw to the caller.
async function record({
  organizationId = null, actorUserId = null, actorEmail = null, actorRole = null,
  actionKind, actionVerb, subjectKind = null, subjectId = null,
  pursuitId = null, payload = {}, ipAddress = null, userAgent = null,
  correlationId = null,
} = {}) {
  if (!actionKind || !actionVerb) {
    logger.warn('auditTrail.record: missing kind/verb');
    return null;
  }
  try {
    return await AuditEvent.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      actorUserId: actorUserId == null ? null : Number(actorUserId),
      actorEmail, actorRole,
      actionKind: String(actionKind).slice(0, 64),
      actionVerb: String(actionVerb).slice(0, 64),
      subjectKind: subjectKind == null ? null : String(subjectKind).slice(0, 64),
      subjectId: subjectId == null ? null : String(subjectId).slice(0, 128),
      pursuitId: pursuitId == null ? null : Number(pursuitId),
      payload: payload || {},
      ipAddress: ipAddress == null ? null : String(ipAddress).slice(0, 64),
      userAgent: userAgent == null ? null : String(userAgent).slice(0, 512),
      correlationId,
    });
  } catch (e) {
    logger.warn('auditTrail.record failed', { error: e.message });
    return null;
  }
}

// Sugar that pulls actor + org out of an Express req.
function recordFromRequest(req, { actionKind, actionVerb, subjectKind, subjectId, pursuitId, payload }) {
  const actorEmail = req && req.user ? req.user.email : null;
  const actorUserId = req && req.user ? (req.user.userId || req.user.id) : null;
  const actorRole = req && req.user ? req.user.role : null;
  const ipAddress = req ? (req.ip || (req.connection && req.connection.remoteAddress)) : null;
  const userAgent = req && req.headers ? req.headers['user-agent'] : null;
  return record({
    organizationId: req ? req.tenantId : null,
    actorUserId, actorEmail, actorRole,
    actionKind, actionVerb, subjectKind, subjectId, pursuitId,
    payload, ipAddress, userAgent,
  });
}

// Query — supports filtering by tenant, actor, pursuit, action, date.
async function query({
  organizationId = null, actorUserId = null, pursuitId = null,
  actionKind = null, actionVerb = null, subjectKind = null, subjectId = null,
  since = null, until = null, limit = 100,
} = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (actorUserId != null) where.actorUserId = Number(actorUserId);
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  if (actionKind) where.actionKind = actionKind;
  if (actionVerb) where.actionVerb = actionVerb;
  if (subjectKind) where.subjectKind = subjectKind;
  if (subjectId) where.subjectId = String(subjectId);
  if (since || until) {
    where.createdAt = {};
    if (since) where.createdAt[Op.gte] = new Date(since);
    if (until) where.createdAt[Op.lte] = new Date(until);
  }
  const rows = await AuditEvent.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(1000, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function recent({ organizationId = null, limit = 50 } = {}) {
  return query({ organizationId, limit });
}

// CSV export for compliance. No streaming — caller is expected to apply a
// reasonable date filter.
async function exportCsv({
  organizationId = null, since = null, until = null, limit = 5000,
} = {}) {
  const rows = await query({ organizationId, since, until, limit });
  const header = [
    'created_at', 'organization_id', 'actor_email', 'actor_role',
    'action_kind', 'action_verb', 'subject_kind', 'subject_id',
    'pursuit_id', 'ip_address',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.createdAt, r.organizationId, r.actorEmail, r.actorRole,
      r.actionKind, r.actionVerb, r.subjectKind, r.subjectId,
      r.pursuitId, r.ipAddress,
    ].map((v) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

async function summarize({ organizationId = null, sinceMinutes = 24 * 60 } = {}) {
  const since = new Date(Date.now() - Number(sinceMinutes) * 60_000);
  const where = { createdAt: { [Op.gte]: since } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await AuditEvent.findAll({ where, limit: 5000 });
  const byKind = {};
  const byActor = {};
  const byVerb = {};
  for (const r of rows) {
    byKind[r.actionKind] = (byKind[r.actionKind] || 0) + 1;
    byVerb[r.actionVerb] = (byVerb[r.actionVerb] || 0) + 1;
    if (r.actorEmail) byActor[r.actorEmail] = (byActor[r.actorEmail] || 0) + 1;
  }
  return {
    window_minutes: Number(sinceMinutes),
    total: rows.length,
    by_kind: byKind,
    by_verb: byVerb,
    by_actor: byActor,
    most_active_actor: Object.entries(byActor).sort((a, b) => b[1] - a[1])[0] || null,
  };
}

module.exports = {
  VALID_KINDS, COMMON_VERBS,
  record, recordFromRequest, query, recent, summarize, exportCsv,
};
