// Deep Research Phase 10 — high-level proposal execution queue.
//
// Groups worker_jobs into operator-visible queue entries (one per pursuit
// batch). Tracks aggregate state (queued / processing / waiting / blocked /
// completed / failed / cancelled), priority, aging, retry rates. Each
// entry can contain N worker_jobs (drafts, compliance parse, package
// assembly, etc).

const { Op } = require('sequelize');
const {
  ProposalExecutionQueue, WorkerJob,
} = require('../models');
const captureWorker = require('./captureWorker.service');

const VALID_KINDS = [
  'draft_batch', 'compliance_build', 'package_assemble',
  'context_inject', 'artifact_scan', 'sla_scan',
];
const VALID_STATUSES = [
  'queued', 'processing', 'waiting', 'blocked',
  'completed', 'failed', 'cancelled',
];

function assertValidKind(k) {
  if (!VALID_KINDS.includes(k)) {
    const err = new Error(`Invalid queue_kind: ${k}`); err.code = 'BAD_INPUT'; throw err;
  }
}

// Enqueue a logical "execution" — produces the parent queue row + child
// worker_jobs. For a draft batch, one worker_job per linked opportunity.
async function enqueueDraftBatch({
  pursuitId, opportunityIds = [], priority = 50, slaDueAt = null, actor = null,
} = {}) {
  if (!pursuitId || !Array.isArray(opportunityIds) || opportunityIds.length === 0) {
    const err = new Error('pursuitId and opportunityIds[] required');
    err.code = 'BAD_INPUT'; throw err;
  }
  const batchId = captureWorker.newBatchId();
  const queueEntry = await ProposalExecutionQueue.create({
    pursuitId: Number(pursuitId),
    queueKind: 'draft_batch',
    status: 'queued',
    priority,
    totalJobs: opportunityIds.length,
    payload: { opportunity_ids: opportunityIds, batch_id: batchId },
    slaDueAt, actor,
  });
  for (const oppId of opportunityIds) {
    // eslint-disable-next-line no-await-in-loop
    await captureWorker.enqueue({
      jobKind: 'draft_generation',
      pursuitId: Number(pursuitId),
      opportunityId: Number(oppId),
      priority,
      batchId,
      actor,
      payload: { opportunityId: Number(oppId), outputType: 'proposal' },
    });
  }
  return queueEntry.toJSON();
}

// Enqueue a single-job execution (compliance / package / etc).
async function enqueueSingleJob({
  pursuitId, queueKind, payload = {}, priority = 50, slaDueAt = null, actor = null,
} = {}) {
  assertValidKind(queueKind);
  const jobKindMap = {
    compliance_build: 'compliance_parse',
    package_assemble: 'package_assembly',
    artifact_scan: 'artifact_lifecycle_scan',
    sla_scan: 'sla_scan',
    context_inject: 'compliance_parse', // placeholder kind
  };
  const jobKind = jobKindMap[queueKind] || queueKind;
  const batchId = captureWorker.newBatchId();
  const queueEntry = await ProposalExecutionQueue.create({
    pursuitId: Number(pursuitId),
    queueKind,
    status: 'queued',
    priority,
    totalJobs: 1,
    payload: { ...payload, batch_id: batchId },
    slaDueAt, actor,
  });
  await captureWorker.enqueue({
    jobKind,
    pursuitId: Number(pursuitId),
    priority,
    batchId,
    actor,
    payload: { ...payload, pursuitId: Number(pursuitId) },
  });
  return queueEntry.toJSON();
}

// Re-roll the parent queue's state by counting child worker_jobs.
async function refreshEntryFromJobs(queueEntryId) {
  const entry = await ProposalExecutionQueue.findByPk(queueEntryId);
  if (!entry) return null;
  const batchId = entry.payload && entry.payload.batch_id;
  if (!batchId) return entry.toJSON();
  const jobs = await WorkerJob.findAll({ where: { batchId } });
  const counts = { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const j of jobs) counts[j.status] = (counts[j.status] || 0) + 1;
  let status = entry.status;
  if (counts.completed + counts.failed + counts.cancelled === jobs.length && jobs.length > 0) {
    status = counts.failed > 0 ? 'completed' : 'completed';
    if (counts.failed === jobs.length) status = 'failed';
  } else if (counts.processing > 0) {
    status = 'processing';
  }
  const updates = {
    status,
    succeededJobs: counts.completed,
    failedJobs: counts.failed,
  };
  if (status === 'completed' || status === 'failed') updates.completedAt = new Date();
  if (status === 'processing' && !entry.startedAt) updates.startedAt = new Date();
  await entry.update(updates);
  return entry.toJSON();
}

async function listEntries({
  pursuitId = null, status = null, queueKind = null, limit = 100,
} = {}) {
  const where = {};
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  if (status) where.status = status;
  if (queueKind) where.queueKind = queueKind;
  const rows = await ProposalExecutionQueue.findAll({
    where, order: [['priority', 'DESC'], ['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function getEntryDetail(id) {
  const entry = await ProposalExecutionQueue.findByPk(id);
  if (!entry) return null;
  const j = entry.toJSON();
  const batchId = j.payload && j.payload.batch_id;
  const jobs = batchId
    ? (await WorkerJob.findAll({ where: { batchId }, order: [['created_at', 'ASC']] })).map((r) => r.toJSON())
    : [];
  return { ...j, jobs };
}

async function cancelEntry(id, actor = null) {
  const entry = await ProposalExecutionQueue.findByPk(id);
  if (!entry) { const err = new Error(`Queue entry ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await entry.update({ status: 'cancelled', completedAt: new Date(), actor });
  const batchId = entry.payload && entry.payload.batch_id;
  if (batchId) {
    const jobs = await WorkerJob.findAll({ where: { batchId, status: { [Op.in]: ['queued', 'processing'] } } });
    for (const j of jobs) {
      // eslint-disable-next-line no-await-in-loop
      await j.update({ status: 'cancelled', completedAt: new Date(), actor });
    }
  }
  return entry.toJSON();
}

async function summarize() {
  const rows = await ProposalExecutionQueue.findAll({
    order: [['created_at', 'DESC']], limit: 200,
  });
  const counts = { queued: 0, processing: 0, waiting: 0, blocked: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return { total: rows.length, by_status: counts };
}

module.exports = {
  VALID_KINDS, VALID_STATUSES,
  enqueueDraftBatch, enqueueSingleJob,
  refreshEntryFromJobs,
  listEntries, getEntryDetail, cancelEntry, summarize,
};
