// Deep Research Phase 10 — Capture Infrastructure dashboard aggregator.
//
// Read-only composite over all Phase 10 surfaces — feeds the
// /admin/deep-research/capture-infra page.

const { Op } = require('sequelize');
const {
  WorkerJob, ProposalExecutionQueue, SlaEvent, StorageAsset, ExecutionFailure,
} = require('../models');
const queueObservability = require('./queueObservability.service');
const slaIntelligence = require('./slaIntelligence.service');
const artifactLifecycle = require('./artifactLifecycle.service');
const storage = require('./storage.service');
const captureWorker = require('./captureWorker.service');

async function workerStatus() {
  const enabled = process.env.DEEP_RESEARCH_WORKER_ENABLED === 'true';
  const health = await queueObservability.workerHealth();
  return {
    enabled,
    poll_ms: captureWorker.POLL_INTERVAL_MS,
    default_concurrency: captureWorker.DEFAULT_CONCURRENCY,
    max_concurrency: captureWorker.MAX_CONCURRENCY,
    health,
  };
}

async function queueStatus() {
  const [queued, processing, failed24, cancelled24] = await Promise.all([
    WorkerJob.count({ where: { status: 'queued' } }),
    WorkerJob.count({ where: { status: 'processing' } }),
    WorkerJob.count({
      where: { status: 'failed', updatedAt: { [Op.gt]: new Date(Date.now() - 86400_000) } },
    }),
    WorkerJob.count({
      where: { status: 'cancelled', updatedAt: { [Op.gt]: new Date(Date.now() - 86400_000) } },
    }),
  ]);
  const summary = await queueObservability.summarize({ windowMinutes: 60 });
  return { queued, processing, failed_24h: failed24, cancelled_24h: cancelled24, ...summary };
}

async function slaPressure() {
  const open = await SlaEvent.findAll({
    where: { status: 'open' }, order: [['severity', 'DESC']], limit: 30,
  });
  const byKind = {};
  let topSeverity = 0;
  for (const e of open) {
    byKind[e.slaKind] = (byKind[e.slaKind] || 0) + 1;
    if (Number(e.severity) > topSeverity) topSeverity = Number(e.severity);
  }
  return {
    open_count: open.length,
    by_kind: byKind,
    top_severity: topSeverity,
    sample: open.slice(0, 10).map((e) => e.toJSON()),
  };
}

async function executionQueueStatus() {
  const rows = await ProposalExecutionQueue.findAll({
    order: [['created_at', 'DESC']], limit: 50,
  });
  const counts = { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return {
    total: rows.length,
    by_status: counts,
    recent: rows.slice(0, 10).map((r) => r.toJSON()),
  };
}

async function failureBreakdown() {
  const recent = await ExecutionFailure.findAll({
    where: { detectedAt: { [Op.gt]: new Date(Date.now() - 7 * 86400_000) } },
    order: [['detected_at', 'DESC']], limit: 500,
  });
  const byKind = {};
  const byJobKind = {};
  for (const r of recent) {
    byKind[r.failureKind] = (byKind[r.failureKind] || 0) + 1;
    byJobKind[r.jobKind] = (byJobKind[r.jobKind] || 0) + 1;
  }
  return {
    last_7d_total: recent.length,
    by_failure_kind: byKind,
    by_job_kind: byJobKind,
    sample: recent.slice(0, 10).map((r) => r.toJSON()),
  };
}

async function storageStatus() {
  const health = await storage.getStorageHealth();
  const recent = await StorageAsset.findAll({
    order: [['created_at', 'DESC']], limit: 10,
  });
  return { ...health, recent_assets: recent.map((r) => r.toJSON()) };
}

async function getCaptureInfra() {
  const [worker, queue, sla, artifacts, execQueue, failures, storageInfo] = await Promise.all([
    workerStatus(),
    queueStatus(),
    slaPressure(),
    artifactLifecycle.summarize(),
    executionQueueStatus(),
    failureBreakdown(),
    storageStatus(),
  ]);
  return {
    generated_at: new Date().toISOString(),
    worker,
    queue,
    sla,
    artifacts,
    execution_queue: execQueue,
    failures,
    storage: storageInfo,
  };
}

module.exports = {
  workerStatus, queueStatus, slaPressure, executionQueueStatus,
  failureBreakdown, storageStatus, getCaptureInfra,
};
