// Deep Research Phase 10 — queue observability.
//
// Reads worker_jobs + execution_failures + queue_metrics and produces
// throughput / failure / retry / latency rollups for the Capture Infra
// dashboard. Persists periodic snapshots into queue_metrics so the
// dashboard can render a time-series view.

const { Op } = require('sequelize');
const {
  WorkerJob, QueueMetric, ExecutionFailure,
} = require('../models');

const DEFAULT_WINDOW_MIN = 60;
const VALID_KINDS = [
  'draft_generation', 'compliance_parse', 'package_assembly',
  'artifact_lifecycle_scan', 'sla_scan', 'storage_upload',
];

function median(nums) {
  if (!Array.isArray(nums) || nums.length === 0) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function p95(nums) {
  if (!Array.isArray(nums) || nums.length === 0) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
  return sorted[idx];
}

async function rollupForKind(queueKind, { windowMinutes = DEFAULT_WINDOW_MIN } = {}) {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const jobs = await WorkerJob.findAll({
    where: { jobKind: queueKind, createdAt: { [Op.gte]: since } },
    limit: 5000,
  });
  const counts = {
    queued: 0, processing: 0, succeeded: 0, failed: 0, cancelled: 0,
  };
  const latencies = [];
  let totalAttempts = 0;
  let retriedAttempts = 0;
  for (const j of jobs) {
    if (j.status === 'queued') counts.queued += 1;
    else if (j.status === 'processing') counts.processing += 1;
    else if (j.status === 'completed') counts.succeeded += 1;
    else if (j.status === 'failed') counts.failed += 1;
    else if (j.status === 'cancelled') counts.cancelled += 1;
    if (j.startedAt && j.completedAt) {
      latencies.push(new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime());
    }
    totalAttempts += Number(j.attempt || 0);
    if (Number(j.attempt || 0) > 1) retriedAttempts += 1;
  }
  const medianLatencyMs = median(latencies);
  const p95LatencyMs = p95(latencies);
  const retryRate = totalAttempts > 0
    ? Number((retriedAttempts / Math.max(1, jobs.length)).toFixed(3)) : 0;
  return {
    queue_kind: queueKind,
    window_minutes: windowMinutes,
    jobs: jobs.length,
    counts,
    median_latency_ms: medianLatencyMs,
    p95_latency_ms: p95LatencyMs,
    retry_rate: retryRate,
  };
}

// Persist a snapshot. Idempotent on (queue_kind, captured_at) — multiple
// snapshots per kind per day are allowed.
async function snapshotAll({ windowMinutes = DEFAULT_WINDOW_MIN } = {}) {
  const out = [];
  for (const kind of VALID_KINDS) {
    // eslint-disable-next-line no-await-in-loop
    const r = await rollupForKind(kind, { windowMinutes });
    // eslint-disable-next-line no-await-in-loop
    await QueueMetric.create({
      queueKind: kind,
      windowMinutes,
      jobsQueued: r.counts.queued,
      jobsProcessing: r.counts.processing,
      jobsSucceeded: r.counts.succeeded,
      jobsFailed: r.counts.failed,
      jobsCancelled: r.counts.cancelled,
      medianLatencyMs: r.median_latency_ms,
      p95LatencyMs: r.p95_latency_ms,
      retryRate: r.retry_rate,
    });
    out.push(r);
  }
  return { captured: out.length, snapshots: out };
}

async function summarize({ windowMinutes = DEFAULT_WINDOW_MIN } = {}) {
  const out = [];
  for (const kind of VALID_KINDS) {
    // eslint-disable-next-line no-await-in-loop
    out.push(await rollupForKind(kind, { windowMinutes }));
  }
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const failures = await ExecutionFailure.findAll({
    where: { detectedAt: { [Op.gte]: since } }, limit: 2000,
  });
  const byClass = {};
  for (const f of failures) {
    byClass[f.failureKind] = (byClass[f.failureKind] || 0) + 1;
  }
  return {
    window_minutes: windowMinutes,
    by_kind: out,
    failures_by_class: byClass,
    failures_total: failures.length,
  };
}

async function recentSnapshots({ queueKind = null, limit = 24 } = {}) {
  const where = {};
  if (queueKind) where.queueKind = queueKind;
  const rows = await QueueMetric.findAll({
    where, order: [['captured_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 24),
  });
  return rows.map((r) => r.toJSON());
}

async function workerHealth() {
  const totalRecent = await WorkerJob.count({
    where: { createdAt: { [Op.gt]: new Date(Date.now() - 24 * 60 * 60_000) } },
  });
  const failedRecent = await WorkerJob.count({
    where: {
      status: 'failed',
      createdAt: { [Op.gt]: new Date(Date.now() - 24 * 60 * 60_000) },
    },
  });
  const queuedNow = await WorkerJob.count({ where: { status: 'queued' } });
  const processingNow = await WorkerJob.count({ where: { status: 'processing' } });
  const failureRate = totalRecent > 0 ? failedRecent / totalRecent : 0;
  let score = 100;
  score -= Math.min(40, failureRate * 100);
  score -= Math.min(30, queuedNow);
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    total_recent: totalRecent,
    failed_recent: failedRecent,
    failure_rate: Number(failureRate.toFixed(3)),
    queued_now: queuedNow,
    processing_now: processingNow,
  };
}

module.exports = {
  DEFAULT_WINDOW_MIN, VALID_KINDS,
  median, p95,
  rollupForKind, snapshotAll, summarize,
  recentSnapshots, workerHealth,
};
