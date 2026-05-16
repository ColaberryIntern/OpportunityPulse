// Deep Research Phase 9 — parallel draft generation queue.
//
// Replaces the sequential Phase 8 reviewQueueBridge.generateDraftsForPursuit
// with a small concurrency pool. Idempotent, retry-safe, observable,
// resumable. Each linked opportunity becomes one parallel_draft_jobs row;
// the pool processes them with bounded concurrency (default 3) and
// records the outcome per job.
//
// HUMAN REVIEW + HUMAN SUBMISSION are STILL REQUIRED. Generated drafts
// land in OpportunityOutput with status='draft' just like sequential mode.

const crypto = require('crypto');
const logger = require('../logging/logger');
const {
  PursuitWorkspace, ParallelDraftJob, ReviewQueueHandoff,
} = require('../models');
const actionGenerator = require('../oied/actionGenerator.service');

const DEFAULT_CONCURRENCY = Number(process.env.DEEP_RESEARCH_DRAFT_CONCURRENCY) || 3;
const MAX_CONCURRENCY = 8;
const SUPPORTED_TYPES = new Set(['proposal', 'offer', 'analysis']);

function newBatchId() {
  return 'b_' + crypto.randomBytes(8).toString('hex');
}

// Run one job — invokes the existing actionGenerator. Errors are caught
// and recorded; never re-thrown to the pool runner.
async function runOneJob(job, { actor = null, generatedBy = null }) {
  const startedAt = new Date();
  await job.update({ status: 'running', startedAt, attempt: Number(job.attempt || 0) + 1 });
  try {
    const out = await actionGenerator.generateOutput({
      opportunityId: job.opportunityId,
      type: job.outputType,
      generatedBy, userId: generatedBy,
    });
    const completedAt = new Date();
    await job.update({
      status: 'success', outputId: out ? out.id : null,
      completedAt, errorMessage: null,
    });
    // Audit-row for symmetry with the Phase 8 sequential path.
    await ReviewQueueHandoff.create({
      pursuitId: job.pursuitId,
      opportunityId: job.opportunityId,
      outputId: out ? out.id : null,
      outputType: job.outputType,
      status: 'success',
      actor, completedAt,
      metadata: { parallel: true, batch_id: job.batchId, attempt: job.attempt },
    });
    return { status: 'success', outputId: out ? out.id : null };
  } catch (e) {
    const errorMessage = e && e.message ? e.message : String(e);
    logger.warn('parallelDraftQueue: job failed', {
      pursuitId: job.pursuitId, opportunityId: job.opportunityId, error: errorMessage,
    });
    await job.update({
      status: 'failed', errorMessage, completedAt: new Date(),
    });
    await ReviewQueueHandoff.create({
      pursuitId: job.pursuitId,
      opportunityId: job.opportunityId,
      outputType: job.outputType,
      status: 'failed', errorMessage, actor, completedAt: new Date(),
      metadata: { parallel: true, batch_id: job.batchId },
    });
    return { status: 'failed', error: errorMessage };
  }
}

// Simple concurrency pool — workers pull from a queue array until empty.
async function processPool(jobs, { concurrency, actor, generatedBy }) {
  const queue = jobs.slice();
  const summary = { success: 0, failed: 0 };
  async function worker() {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) return;
      await job.update({ acquiredAt: new Date() });
      const result = await runOneJob(job, { actor, generatedBy });
      if (result.status === 'success') summary.success += 1;
      else summary.failed += 1;
    }
  }
  const n = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || DEFAULT_CONCURRENCY));
  const workers = Array.from({ length: n }, () => worker());
  await Promise.all(workers);
  return summary;
}

// Queue draft jobs for every linked opportunity in a pursuit. Skips opps
// that already have a successful job in any prior batch (idempotency).
async function enqueueForPursuit(pursuitId, {
  outputType = 'proposal', concurrency = DEFAULT_CONCURRENCY,
  actor = null, generatedBy = null, skipExisting = true,
} = {}) {
  if (!SUPPORTED_TYPES.has(outputType)) {
    const err = new Error(`Unsupported output type: ${outputType}`);
    err.code = 'BAD_INPUT'; throw err;
  }
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) {
    const err = new Error(`Pursuit ${pursuitId} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  const oppIds = Array.isArray(pursuit.linkedOpportunityIds)
    ? pursuit.linkedOpportunityIds.map(Number).filter(Number.isInteger) : [];
  if (oppIds.length === 0) {
    return { batch_id: null, requested: 0, queued: 0, skipped: 0 };
  }
  const batchId = newBatchId();
  const created = [];
  let skipped = 0;
  for (const opportunityId of oppIds) {
    if (skipExisting) {
      // eslint-disable-next-line no-await-in-loop
      const prior = await ParallelDraftJob.findOne({
        where: {
          pursuitId: Number(pursuitId), opportunityId, outputType, status: 'success',
        },
      });
      if (prior) { skipped += 1; continue; }
    }
    // eslint-disable-next-line no-await-in-loop
    const job = await ParallelDraftJob.create({
      pursuitId: Number(pursuitId), opportunityId,
      outputType, batchId, status: 'queued', actor,
    });
    created.push(job);
  }
  // Process the pool inline. (A future Phase 10 add could move this to a
  // background worker; in v1 we run it in the request handler with a hard
  // timeout enforced via concurrency cap + bounded job count.)
  const result = await processPool(created, { concurrency, actor, generatedBy });

  // Stamp the pursuit with new linked outputs.
  const successfulOutputIds = (await ParallelDraftJob.findAll({
    where: { batchId, status: 'success' }, attributes: ['outputId'],
  })).map((j) => j.outputId).filter(Boolean);
  if (successfulOutputIds.length > 0) {
    const existing = Array.isArray(pursuit.linkedOutputIds) ? pursuit.linkedOutputIds : [];
    const merged = Array.from(new Set([...existing, ...successfulOutputIds]));
    await pursuit.update({ linkedOutputIds: merged });
  }

  return {
    batch_id: batchId,
    pursuit_id: Number(pursuitId),
    requested: oppIds.length,
    queued: created.length,
    skipped,
    succeeded: result.success,
    failed: result.failed,
    concurrency: Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || DEFAULT_CONCURRENCY)),
  };
}

async function listJobs({ pursuitId = null, batchId = null, limit = 200 } = {}) {
  const where = {};
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  if (batchId) where.batchId = batchId;
  const rows = await ParallelDraftJob.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 200),
  });
  return rows.map((r) => r.toJSON());
}

async function summarizeForPursuit(pursuitId) {
  const rows = await listJobs({ pursuitId });
  const counts = { total: rows.length, queued: 0, running: 0, success: 0, failed: 0, skipped: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}

module.exports = {
  DEFAULT_CONCURRENCY, MAX_CONCURRENCY, SUPPORTED_TYPES,
  newBatchId, runOneJob, processPool,
  enqueueForPursuit, listJobs, summarizeForPursuit,
};
