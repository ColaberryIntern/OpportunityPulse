// Deep Research Phase 10 — durable background worker.
//
// Reads worker_jobs queue and dispatches each to its handler. Polling-based,
// in-process. Opt-in scheduler — defaults OFF. The worker itself is one
// processing loop with bounded concurrency; jobs are persistent, resumable,
// retry-safe, idempotent.
//
// Handlers are wired here lazily so any one handler's failure doesn't break
// the dispatcher.

const crypto = require('crypto');
const cron = require('node-cron');
const { Op } = require('sequelize');
const logger = require('../logging/logger');
const {
  WorkerJob, ExecutionFailure,
} = require('../models');

const VALID_JOB_KINDS = [
  'draft_generation', 'compliance_parse', 'package_assembly',
  'artifact_lifecycle_scan', 'sla_scan', 'storage_upload',
];

const DEFAULT_CONCURRENCY = Number(process.env.DEEP_RESEARCH_WORKER_CONCURRENCY) || 2;
const MAX_CONCURRENCY = 8;
const POLL_INTERVAL_MS = Number(process.env.DEEP_RESEARCH_WORKER_POLL_MS) || 5000;

// Handler registry — populated lazily so we don't require()-cycle through
// services that haven't loaded yet.
function loadHandler(jobKind) {
  switch (jobKind) {
    case 'draft_generation': {
      const svc = require('./durableDraftGeneration.service');
      return (job) => svc.runDraftJob(job);
    }
    case 'compliance_parse': {
      const cm = require('./complianceMatrix.service');
      return async (job) => {
        const { pursuitId, rfpText, sourceAttachmentId } = job.payload || {};
        return cm.buildForPursuit(pursuitId, { rfpText, sourceAttachmentId });
      };
    }
    case 'package_assembly': {
      const sp = require('./submissionPackage.service');
      return (job) => sp.assemblePackage({
        pursuitId: job.payload.pursuitId,
        outputIds: job.payload.outputIds,
        attachmentIds: job.payload.attachmentIds,
        artifactIds: job.payload.artifactIds,
        assembledBy: job.actor,
      });
    }
    case 'artifact_lifecycle_scan': {
      const al = require('./artifactLifecycle.service');
      return () => al.runNightlyScan();
    }
    case 'sla_scan': {
      const sla = require('./slaIntelligence.service');
      return () => sla.runFullScan();
    }
    case 'storage_upload': {
      // url_only/local registers metadata only; v1 just returns the ref.
      const st = require('./storage.service');
      return async (job) => st.registerAsset(job.payload || {});
    }
    default:
      throw new Error(`No handler registered for job_kind ${jobKind}`);
  }
}

// Public enqueue API. Returns the persisted WorkerJob row.
async function enqueue({
  jobKind, payload = {}, priority = 50, pursuitId = null, opportunityId = null,
  maxAttempts = 3, runAfter = null, batchId = null, actor = null,
} = {}) {
  if (!VALID_JOB_KINDS.includes(jobKind)) {
    const err = new Error(`Invalid job_kind: ${jobKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await WorkerJob.create({
    jobKind, payload, priority, pursuitId, opportunityId,
    maxAttempts, runAfter, batchId, actor,
    status: 'queued',
  });
  logger.info('captureWorker: enqueued', { id: row.id, jobKind, batchId });
  return row.toJSON();
}

// Acquire the next runnable job atomically. Postgres returns the row to one
// caller only because of the find-then-update sequence guarded by status
// 'queued' → 'processing' set inside the transaction.
async function acquireNext() {
  const candidate = await WorkerJob.findOne({
    where: {
      status: 'queued',
      [Op.or]: [{ runAfter: null }, { runAfter: { [Op.lt]: new Date() } }],
    },
    order: [['priority', 'DESC'], ['created_at', 'ASC']],
  });
  if (!candidate) return null;
  // Optimistic lock via where clause.
  const [updated] = await WorkerJob.update(
    { status: 'processing', acquiredAt: new Date(), startedAt: new Date() },
    { where: { id: candidate.id, status: 'queued' } },
  );
  if (updated === 0) return null;
  return WorkerJob.findByPk(candidate.id);
}

function classifyFailureKind(err) {
  const m = String(err && err.message || '').toLowerCase();
  if (m.includes('timeout')) return 'timeout';
  if (m.includes('not found') || m.includes('invalid')) return 'permanent';
  if (m.includes('config') || m.includes('missing')) return 'config';
  if (m.includes('upstream') || m.includes('502') || m.includes('503')) return 'upstream';
  return 'transient';
}

function backoffMs(attempt) {
  // 30s, 2m, 8m exponential with jitter.
  const base = Math.min(600_000, 30_000 * (4 ** Math.max(0, attempt - 1)));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

async function recordFailure(job, err) {
  const willRetry = (Number(job.attempt) + 1) < Number(job.maxAttempts);
  const failureKind = classifyFailureKind(err);
  const nextRetryAt = willRetry ? new Date(Date.now() + backoffMs(Number(job.attempt) + 1)) : null;
  await ExecutionFailure.create({
    workerJobId: job.id,
    pursuitId: job.pursuitId,
    jobKind: job.jobKind,
    failureKind,
    errorMessage: err && err.message ? err.message : String(err),
    errorClass: err && err.constructor ? err.constructor.name : null,
    attempt: Number(job.attempt) + 1,
    willRetry, nextRetryAt,
    stackSnippet: err && err.stack ? String(err.stack).slice(0, 500) : null,
  });
}

async function runOne(job) {
  const handler = loadHandler(job.jobKind);
  await job.update({ attempt: Number(job.attempt) + 1, progressPct: 5 });
  try {
    const result = await handler(job);
    await job.update({
      status: 'completed', result: result || {},
      completedAt: new Date(), progressPct: 100, errorMessage: null,
    });
    return { id: job.id, status: 'completed' };
  } catch (e) {
    logger.warn('captureWorker: job failed', {
      id: job.id, jobKind: job.jobKind, attempt: job.attempt, error: e.message,
    });
    await recordFailure(job, e);
    const willRetry = Number(job.attempt) < Number(job.maxAttempts);
    await job.update({
      status: willRetry ? 'queued' : 'failed',
      errorMessage: e && e.message ? e.message : String(e),
      runAfter: willRetry ? new Date(Date.now() + backoffMs(Number(job.attempt))) : null,
      completedAt: willRetry ? null : new Date(),
    });
    return { id: job.id, status: willRetry ? 'queued' : 'failed', error: e.message };
  }
}

// Run a single drain pass — pulls up to {concurrency} jobs, processes them.
async function drainOnce({ concurrency = DEFAULT_CONCURRENCY } = {}) {
  const n = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || DEFAULT_CONCURRENCY));
  const acquired = [];
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const next = await acquireNext();
    if (!next) break;
    acquired.push(next);
  }
  if (acquired.length === 0) return { ran: 0 };
  const results = await Promise.all(acquired.map((job) => runOne(job)));
  const ran = results.length;
  const succeeded = results.filter((r) => r.status === 'completed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return { ran, succeeded, failed, retried: ran - succeeded - failed };
}

let cronTaskRef = null;
function startScheduler() {
  if (process.env.DEEP_RESEARCH_WORKER_ENABLED !== 'true') {
    logger.info('captureWorker: scheduler disabled (set DEEP_RESEARCH_WORKER_ENABLED=true to enable)');
    return null;
  }
  if (cronTaskRef) return cronTaskRef;
  // node-cron supports "every N seconds" via `*/N * * * * *` (6-field syntax).
  // We default to a 10s poll; configurable via DEEP_RESEARCH_WORKER_CRON.
  const expr = process.env.DEEP_RESEARCH_WORKER_CRON || '*/10 * * * * *';
  if (!cron.validate(expr)) {
    logger.warn('captureWorker: invalid cron expression; not starting', { expr });
    return null;
  }
  cronTaskRef = cron.schedule(expr, async () => {
    try { await drainOnce(); }
    catch (e) { logger.error('captureWorker: drain failed', { error: e.message }); }
  });
  logger.info('captureWorker: scheduler started', { expr });
  return cronTaskRef;
}
function stopScheduler() { if (cronTaskRef) { cronTaskRef.stop(); cronTaskRef = null; } }

async function cancelJob(id, actor = null) {
  const row = await WorkerJob.findByPk(id);
  if (!row) { const err = new Error(`Job ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  if (['completed', 'cancelled'].includes(row.status)) return row.toJSON();
  await row.update({ status: 'cancelled', completedAt: new Date(), actor });
  return row.toJSON();
}

async function getJob(id) {
  const row = await WorkerJob.findByPk(id);
  return row ? row.toJSON() : null;
}

async function listJobs({
  status = null, jobKind = null, batchId = null, pursuitId = null, limit = 100,
} = {}) {
  const where = {};
  if (status) where.status = status;
  if (jobKind) where.jobKind = jobKind;
  if (batchId) where.batchId = batchId;
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  const rows = await WorkerJob.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

function newBatchId() { return `wb_${crypto.randomBytes(8).toString('hex')}`; }

module.exports = {
  VALID_JOB_KINDS, DEFAULT_CONCURRENCY, MAX_CONCURRENCY, POLL_INTERVAL_MS,
  loadHandler, classifyFailureKind, backoffMs,
  enqueue, acquireNext, runOne, drainOnce,
  startScheduler, stopScheduler,
  cancelJob, getJob, listJobs, newBatchId,
};
