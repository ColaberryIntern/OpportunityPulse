// Deep Research Phase 12 — audit retention infrastructure.
//
// Configurable per-tenant retention with archive-before-delete safety.
// Default retention = 365 days, overridable via TenantSettings.retentionDays.
// Generates archive recommendations + retention pressure metrics.
//
// IMPORTANT: audit integrity must remain intact. archiveWindow() never
// deletes a row until a successful archive manifest is recorded in
// audit_archives. Today's v1 ships the manifest + the recommendation
// engine; the actual cold-storage write is deferred to v2 (operator
// triggers an export-to-S3 + then audit_events rows older than retention
// can be safely pruned).

const { Op } = require('sequelize');
const crypto = require('crypto');
const { AuditEvent, AuditArchive, TenantSettings } = require('../models');
const auditTrail = require('./auditTrail.service');
const logger = require('../logging/logger');

const DEFAULT_RETENTION_DAYS = Number(process.env.DEEP_RESEARCH_AUDIT_RETENTION_DAYS) || 365;
const ARCHIVE_BATCH_SIZE = 5000;

async function resolveRetention(orgId) {
  const settings = await TenantSettings.findOne({ where: { organizationId: Number(orgId) } });
  if (settings && settings.retentionDays) return Number(settings.retentionDays);
  return DEFAULT_RETENTION_DAYS;
}

// Pressure indicator: how close are we to needing an archive?
async function retentionPressure({ organizationId = null } = {}) {
  const retentionDays = organizationId != null
    ? await resolveRetention(organizationId) : DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const [total, eligible, archived] = await Promise.all([
    AuditEvent.count({ where }),
    AuditEvent.count({ where: { ...where, createdAt: { [Op.lt]: cutoff } } }),
    AuditArchive.count({
      where: organizationId != null
        ? { organizationId: Number(organizationId), status: 'completed' }
        : { status: 'completed' },
    }),
  ]);
  const ratio = total > 0 ? eligible / total : 0;
  const status = ratio >= 0.5 ? 'critical' : ratio >= 0.25 ? 'elevated' : ratio >= 0.1 ? 'watch' : 'healthy';
  return {
    total_audit_events: total,
    archive_eligible: eligible,
    archives_completed: archived,
    retention_days: retentionDays,
    eligible_ratio_pct: Math.round(ratio * 100),
    status,
    cutoff: cutoff.toISOString(),
  };
}

// Recommend an archive window. Returns the candidate {start, end}; does NOT
// archive anything yet.
async function recommendArchive({ organizationId = null, maxWindowDays = 90 } = {}) {
  const retentionDays = organizationId != null
    ? await resolveRetention(organizationId) : DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  const where = { createdAt: { [Op.lt]: cutoff } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const oldest = await AuditEvent.findOne({
    where, order: [['created_at', 'ASC']], limit: 1,
  });
  if (!oldest) return null;
  const start = oldest.createdAt;
  const end = new Date(Math.min(
    new Date(start).getTime() + Number(maxWindowDays) * 86400_000,
    cutoff.getTime(),
  ));
  const count = await AuditEvent.count({
    where: { ...where, createdAt: { [Op.gte]: start, [Op.lt]: end } },
  });
  return {
    organization_id: organizationId,
    window_start: start, window_end: end.toISOString(),
    record_count: count, recommended: true,
  };
}

// Create an archive manifest row WITHOUT deleting source rows. The actual
// cold-storage write (S3/MinIO) is a separate operator-driven step; this
// records intent + a stable hash so the export is auditable.
async function archiveWindow({
  organizationId = null, windowStart, windowEnd, archiveLocation = null,
  actor = null,
} = {}) {
  if (!windowStart || !windowEnd) {
    const err = new Error('windowStart + windowEnd required'); err.code = 'BAD_INPUT'; throw err;
  }
  const where = {
    createdAt: { [Op.gte]: new Date(windowStart), [Op.lt]: new Date(windowEnd) },
  };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await AuditEvent.findAll({
    where, order: [['created_at', 'ASC']], limit: ARCHIVE_BATCH_SIZE,
  });
  // Compute a stable hash over the (id, action_kind, action_verb, created_at)
  // tuple set so the archive manifest can be verified later.
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for (const r of rows) {
    const line = `${r.id}|${r.actionKind}|${r.actionVerb}|${r.createdAt}\n`;
    hash.update(line);
    bytes += line.length;
  }
  const archive = await AuditArchive.create({
    organizationId: organizationId == null ? null : Number(organizationId),
    windowStart: new Date(windowStart),
    windowEnd: new Date(windowEnd),
    recordCount: rows.length,
    bytesArchived: bytes,
    archiveLocation: archiveLocation || null,
    archiveHash: hash.digest('hex').slice(0, 128),
    status: archiveLocation ? 'completed' : 'pending',
    completedAt: archiveLocation ? new Date() : null,
  });
  await auditTrail.record({
    organizationId, actorEmail: actor,
    actionKind: 'governance', actionVerb: 'audit.archive',
    subjectKind: 'audit_archive', subjectId: String(archive.id),
    payload: {
      window_start: windowStart, window_end: windowEnd,
      record_count: rows.length, hash: archive.archiveHash,
    },
  });
  return archive.toJSON();
}

async function listArchives({ organizationId = null, limit = 50 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await AuditArchive.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 50),
  });
  return rows.map((r) => r.toJSON());
}

async function summarize({ organizationId = null } = {}) {
  const pressure = await retentionPressure({ organizationId });
  const archives = await listArchives({ organizationId, limit: 10 });
  return {
    pressure,
    recent_archives: archives,
  };
}

module.exports = {
  DEFAULT_RETENTION_DAYS, ARCHIVE_BATCH_SIZE,
  resolveRetention, retentionPressure, recommendArchive,
  archiveWindow, listArchives, summarize,
};
