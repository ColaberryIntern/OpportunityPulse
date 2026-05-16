// Deep Research Phase 10 — SLA + aging intelligence.
//
// Scans persisted Phase 6-9 state (compliance gaps, proposal timeline,
// proposal readiness scores, worker queue) for aging breaches. Emits
// typed sla_events with severity + escalation recommendations.
//
// RECOMMENDATION-ONLY. Never escalates automatically, never modifies the
// underlying records. Operator acknowledges / resolves / dismisses each
// event explicitly.

const { Op } = require('sequelize');
const {
  SlaEvent, ComplianceGap, ProposalTimelineEvent,
  ProposalReadinessScore, WorkerJob, PursuitWorkspace,
} = require('../models');
const logger = require('../logging/logger');

const VALID_KINDS = [
  'gap_aging', 'pursuit_stagnant', 'draft_stalled',
  'queue_aging', 'readiness_stagnant', 'blocker_aging',
];
const STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'];

const THRESHOLDS = {
  gap_aging_days: Number(process.env.DEEP_RESEARCH_SLA_GAP_DAYS) || 7,
  pursuit_stagnant_days: Number(process.env.DEEP_RESEARCH_SLA_PURSUIT_DAYS) || 14,
  draft_stalled_days: Number(process.env.DEEP_RESEARCH_SLA_DRAFT_DAYS) || 3,
  queue_aging_days: Number(process.env.DEEP_RESEARCH_SLA_QUEUE_DAYS) || 2,
  readiness_stagnant_days: Number(process.env.DEEP_RESEARCH_SLA_READINESS_DAYS) || 10,
  blocker_aging_days: Number(process.env.DEEP_RESEARCH_SLA_BLOCKER_DAYS) || 5,
};

const DAY_MS = 86400_000;
const daysSince = (date) => date ? Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS) : null;

function severityForAge({ ageDays, thresholdDays }) {
  if (ageDays == null) return 30;
  const over = Math.max(0, ageDays - thresholdDays);
  return Math.max(40, Math.min(100, 40 + over * 6));
}

function escalationFor(slaKind, ageDays) {
  switch (slaKind) {
    case 'gap_aging':
      return `Open compliance gap has aged ${ageDays} days — reassign owner or mitigate.`;
    case 'pursuit_stagnant':
      return `Pursuit has had no activity in ${ageDays} days — confirm continued interest or archive.`;
    case 'draft_stalled':
      return `Draft has been stalled ${ageDays} days — re-run or escalate to reviewer.`;
    case 'queue_aging':
      return `Worker job queued for ${ageDays} days — investigate worker health.`;
    case 'readiness_stagnant':
      return `Readiness score hasn't moved in ${ageDays} days — re-run scoring or recompute factors.`;
    case 'blocker_aging':
      return `Blocker has aged ${ageDays} days — escalate to capture lead.`;
    default:
      return `${slaKind} aged ${ageDays} days — review.`;
  }
}

// Persist (or update) an SLA event idempotently — one open event per
// (sla_kind, pursuit_id, subject_kind, subject_id).
async function upsertEvent({
  slaKind, pursuitId = null, subjectKind = null, subjectId = null,
  ageDays, thresholdDays, metadata = {},
  organizationId = null,  // Phase 12: tenant-stamp on every SLA event
}) {
  const where = { slaKind, pursuitId, subjectKind, subjectId, status: 'open' };
  const severity = severityForAge({ ageDays, thresholdDays });
  const escalation = escalationFor(slaKind, ageDays);
  const existing = await SlaEvent.findOne({ where });
  if (existing) {
    await existing.update({ severity, ageDays, escalation, metadata });
    return existing.toJSON();
  }
  const row = await SlaEvent.create({
    slaKind, pursuitId,
    subjectKind, subjectId: subjectId == null ? null : String(subjectId),
    severity, ageDays, thresholdDays,
    escalation, status: 'open', metadata,
    organizationId: organizationId == null ? null : Number(organizationId),
  });
  return row.toJSON();
}

// Scanner — gap aging.
async function scanGapAging() {
  const threshold = THRESHOLDS.gap_aging_days;
  const since = new Date(Date.now() - threshold * DAY_MS);
  const gaps = await ComplianceGap.findAll({
    where: { status: 'open', detectedAt: { [Op.lt]: since } }, limit: 200,
  });
  const out = [];
  for (const g of gaps) {
    const ageDays = daysSince(g.detectedAt);
    // eslint-disable-next-line no-await-in-loop
    const row = await upsertEvent({
      slaKind: 'gap_aging',
      pursuitId: g.pursuitId,
      subjectKind: 'compliance_gap',
      subjectId: g.id,
      ageDays, thresholdDays: threshold,
      metadata: { gap_kind: g.gapKind, label: g.label },
    });
    out.push(row);
  }
  return out;
}

// Scanner — pursuit stagnation (no updated_at in N days).
async function scanPursuitStagnant() {
  const threshold = THRESHOLDS.pursuit_stagnant_days;
  const cutoff = new Date(Date.now() - threshold * DAY_MS);
  const pursuits = await PursuitWorkspace.findAll({
    where: {
      status: { [Op.in]: ['open', 'in_progress'] },
      updatedAt: { [Op.lt]: cutoff },
    }, limit: 200,
  });
  const out = [];
  for (const p of pursuits) {
    const ageDays = daysSince(p.updatedAt);
    // eslint-disable-next-line no-await-in-loop
    const row = await upsertEvent({
      slaKind: 'pursuit_stagnant',
      pursuitId: p.id,
      subjectKind: 'pursuit',
      subjectId: p.id,
      ageDays, thresholdDays: threshold,
      metadata: { name: p.name, status: p.status },
    });
    out.push(row);
  }
  return out;
}

// Scanner — draft stalled (Phase 8 ReviewQueueHandoff with status running for too long).
async function scanDraftStalled() {
  // Implemented via worker_jobs status='processing' aged too long.
  const threshold = THRESHOLDS.draft_stalled_days;
  const cutoff = new Date(Date.now() - threshold * DAY_MS);
  const jobs = await WorkerJob.findAll({
    where: {
      jobKind: 'draft_generation',
      status: 'processing',
      startedAt: { [Op.lt]: cutoff },
    }, limit: 200,
  });
  const out = [];
  for (const j of jobs) {
    const ageDays = daysSince(j.startedAt);
    // eslint-disable-next-line no-await-in-loop
    const row = await upsertEvent({
      slaKind: 'draft_stalled',
      pursuitId: j.pursuitId,
      subjectKind: 'worker_job',
      subjectId: j.id,
      ageDays, thresholdDays: threshold,
      metadata: { job_kind: j.jobKind, attempt: j.attempt },
    });
    out.push(row);
  }
  return out;
}

// Scanner — queue aging (queued jobs that have been waiting too long).
async function scanQueueAging() {
  const threshold = THRESHOLDS.queue_aging_days;
  const cutoff = new Date(Date.now() - threshold * DAY_MS);
  const jobs = await WorkerJob.findAll({
    where: { status: 'queued', createdAt: { [Op.lt]: cutoff } }, limit: 200,
  });
  const out = [];
  for (const j of jobs) {
    const ageDays = daysSince(j.createdAt);
    // eslint-disable-next-line no-await-in-loop
    const row = await upsertEvent({
      slaKind: 'queue_aging',
      pursuitId: j.pursuitId,
      subjectKind: 'worker_job',
      subjectId: j.id,
      ageDays, thresholdDays: threshold,
      metadata: { job_kind: j.jobKind },
    });
    out.push(row);
  }
  return out;
}

// Scanner — readiness stagnant (no new score in N days for an active pursuit).
async function scanReadinessStagnant() {
  const threshold = THRESHOLDS.readiness_stagnant_days;
  const cutoff = new Date(Date.now() - threshold * DAY_MS);
  // Find active pursuits whose newest readiness row is older than cutoff.
  const activePursuits = await PursuitWorkspace.findAll({
    where: { status: { [Op.in]: ['open', 'in_progress'] } }, limit: 200,
  });
  const out = [];
  for (const p of activePursuits) {
    // eslint-disable-next-line no-await-in-loop
    const latest = await ProposalReadinessScore.findOne({
      where: { scopeKind: 'pursuit', scopeId: p.id },
      order: [['computed_at', 'DESC']],
    });
    if (!latest) continue;
    const computedAt = new Date(latest.computedAt);
    if (computedAt >= cutoff) continue;
    const ageDays = daysSince(computedAt);
    // eslint-disable-next-line no-await-in-loop
    const row = await upsertEvent({
      slaKind: 'readiness_stagnant',
      pursuitId: p.id,
      subjectKind: 'readiness_score',
      subjectId: latest.id,
      ageDays, thresholdDays: threshold,
      metadata: { composite_score: Number(latest.compositeScore), classification: latest.classification },
    });
    out.push(row);
  }
  return out;
}

// Scanner — blocker aging (timeline events with status 'blocked' aging).
async function scanBlockerAging() {
  const threshold = THRESHOLDS.blocker_aging_days;
  const cutoff = new Date(Date.now() - threshold * DAY_MS);
  const blockers = await ProposalTimelineEvent.findAll({
    where: { status: 'blocked', updatedAt: { [Op.lt]: cutoff } }, limit: 200,
  });
  const out = [];
  for (const e of blockers) {
    const ageDays = daysSince(e.updatedAt);
    // eslint-disable-next-line no-await-in-loop
    const row = await upsertEvent({
      slaKind: 'blocker_aging',
      pursuitId: e.pursuitId,
      subjectKind: 'timeline_event',
      subjectId: e.id,
      ageDays, thresholdDays: threshold,
      metadata: { label: e.label, event_kind: e.eventKind },
    });
    out.push(row);
  }
  return out;
}

// Run a full scan — drives the Capture Infra dashboard.
async function runFullScan() {
  const t0 = Date.now();
  const [gaps, pursuits, drafts, queue, readiness, blockers] = await Promise.all([
    scanGapAging().catch((e) => { logger.warn('sla: gap scan failed', { e: e.message }); return []; }),
    scanPursuitStagnant().catch((e) => { logger.warn('sla: pursuit scan failed', { e: e.message }); return []; }),
    scanDraftStalled().catch((e) => { logger.warn('sla: draft scan failed', { e: e.message }); return []; }),
    scanQueueAging().catch((e) => { logger.warn('sla: queue scan failed', { e: e.message }); return []; }),
    scanReadinessStagnant().catch((e) => { logger.warn('sla: readiness scan failed', { e: e.message }); return []; }),
    scanBlockerAging().catch((e) => { logger.warn('sla: blocker scan failed', { e: e.message }); return []; }),
  ]);
  return {
    duration_ms: Date.now() - t0,
    counts: {
      gap_aging: gaps.length,
      pursuit_stagnant: pursuits.length,
      draft_stalled: drafts.length,
      queue_aging: queue.length,
      readiness_stagnant: readiness.length,
      blocker_aging: blockers.length,
    },
    total: gaps.length + pursuits.length + drafts.length + queue.length + readiness.length + blockers.length,
  };
}

async function listEvents({ status = 'open', slaKind = null, pursuitId = null, limit = 100 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (slaKind) where.slaKind = slaKind;
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  const rows = await SlaEvent.findAll({
    where, order: [['severity', 'DESC'], ['detected_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function updateEventStatus(id, status, actor = null) {
  if (!STATUSES.includes(status)) {
    const err = new Error(`Invalid status: ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await SlaEvent.findByPk(id);
  if (!row) { const err = new Error(`SLA event ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const patch = { status };
  if (status === 'resolved' || status === 'dismissed') patch.resolvedAt = new Date();
  if (actor) patch.metadata = { ...(row.metadata || {}), resolved_by: actor };
  await row.update(patch);
  return row.toJSON();
}

module.exports = {
  VALID_KINDS, STATUSES, THRESHOLDS,
  severityForAge, escalationFor,
  upsertEvent,
  scanGapAging, scanPursuitStagnant, scanDraftStalled,
  scanQueueAging, scanReadinessStagnant, scanBlockerAging,
  runFullScan, listEvents, updateEventStatus,
};
