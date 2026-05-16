// Deep Research Phase 10 — durable draft generation (worker-backed).
//
// Replaces the in-process Phase 8 parallelDraftQueue with worker-backed
// jobs. Each linked opportunity becomes one worker_job (job_kind=
// draft_generation). The captureWorker picks them up via its polling
// loop with bounded concurrency. Resumable, retry-safe, observable,
// cancelable.
//
// HUMAN REVIEW + HUMAN SUBMISSION still required. Drafts land in the
// Review Queue with status='draft'.

const { Op } = require('sequelize');
const {
  PursuitWorkspace, WorkerJob, ReviewQueueHandoff,
} = require('../models');
const captureWorker = require('./captureWorker.service');
const pursuitContextWiring = require('./pursuitContextWiring.service');

const SUPPORTED_TYPES = new Set(['proposal', 'offer', 'analysis']);

// Handler called by the captureWorker dispatcher for job_kind='draft_generation'.
async function runDraftJob(job) {
  const { opportunityId, outputType = 'proposal', pursuitId, useContextBlock = true } = job.payload || {};
  if (!opportunityId) {
    throw new Error('Missing opportunityId in payload');
  }
  if (!SUPPORTED_TYPES.has(outputType)) {
    throw new Error(`Unsupported output_type: ${outputType}`);
  }
  const effectivePursuitId = pursuitId != null ? pursuitId : job.pursuitId;

  // Run the actionGenerator via the Phase 10 wiring service so pursuit
  // context is included when available.
  let output;
  if (useContextBlock && effectivePursuitId) {
    output = await pursuitContextWiring.generateWithPursuitContext({
      pursuitId: effectivePursuitId,
      opportunityId,
      type: outputType,
      generatedBy: job.actor ? null : null,
    });
  } else {
    const actionGenerator = require('../oied/actionGenerator.service');
    output = await actionGenerator.generateOutput({
      opportunityId, type: outputType,
    });
  }

  // Audit-row for Phase 8 symmetry.
  await ReviewQueueHandoff.create({
    pursuitId: effectivePursuitId,
    opportunityId,
    outputId: output ? output.id : null,
    outputType,
    status: 'success',
    actor: job.actor,
    completedAt: new Date(),
    metadata: {
      durable: true, worker_job_id: job.id, batch_id: job.batchId,
      attempt: Number(job.attempt || 0),
    },
  });

  return {
    output_id: output ? output.id : null,
    opportunity_id: opportunityId,
    output_type: outputType,
    pursuit_id: effectivePursuitId,
  };
}

// Enqueue one worker_job per linked opportunity. Idempotent: skips opps
// that already have a successful draft job in any prior batch.
async function enqueueForPursuit(pursuitId, {
  outputType = 'proposal', priority = 50, useContextBlock = true,
  skipExisting = true, actor = null,
} = {}) {
  if (!SUPPORTED_TYPES.has(outputType)) {
    const err = new Error(`Unsupported output_type: ${outputType}`); err.code = 'BAD_INPUT'; throw err;
  }
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) { const err = new Error(`Pursuit ${pursuitId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const oppIds = Array.isArray(pursuit.linkedOpportunityIds)
    ? pursuit.linkedOpportunityIds.map(Number).filter(Number.isInteger) : [];
  if (oppIds.length === 0) {
    return { batch_id: null, requested: 0, queued: 0, skipped: 0 };
  }

  const batchId = captureWorker.newBatchId();
  let queued = 0; let skipped = 0;
  for (const opportunityId of oppIds) {
    if (skipExisting) {
      // eslint-disable-next-line no-await-in-loop
      const prior = await WorkerJob.findOne({
        where: {
          jobKind: 'draft_generation',
          pursuitId: Number(pursuitId), opportunityId,
          status: 'completed',
        },
      });
      if (prior) { skipped += 1; continue; }
    }
    // eslint-disable-next-line no-await-in-loop
    await captureWorker.enqueue({
      jobKind: 'draft_generation',
      pursuitId: Number(pursuitId),
      opportunityId,
      priority,
      batchId,
      actor,
      payload: { opportunityId, outputType, pursuitId: Number(pursuitId), useContextBlock },
    });
    queued += 1;
  }
  return {
    batch_id: batchId,
    pursuit_id: Number(pursuitId),
    requested: oppIds.length,
    queued, skipped,
  };
}

// Read-side summary for a pursuit — durable draft state.
async function summarizeForPursuit(pursuitId) {
  const rows = await WorkerJob.findAll({
    where: { pursuitId: Number(pursuitId), jobKind: 'draft_generation' },
    order: [['created_at', 'DESC']],
    limit: 200,
  });
  const counts = { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return { total: rows.length, by_status: counts, jobs: rows.slice(0, 20).map((r) => r.toJSON()) };
}

module.exports = {
  SUPPORTED_TYPES,
  runDraftJob, enqueueForPursuit, summarizeForPursuit,
};
