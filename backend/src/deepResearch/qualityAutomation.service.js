// Deep Research Phase 15 — automated proposal quality pipeline.
//
// Runs the 4 Phase 14 scorers (proposalQuality, groundedness,
// strategicCoherence, evaluatorAlignment) against an OpportunityOutput,
// then writes a consolidated quality_snapshots row + optionally enqueues
// a worker_job for retry-safe background execution.
//
// IMPORTANT: this is automated EVALUATION, not automated proposal
// modification. The proposal content is never changed.

const { Op } = require('sequelize');
const {
  QualitySnapshot, OpportunityOutput,
} = require('../models');
const proposalQuality = require('./proposalQuality.service');
const groundedness = require('./groundedness.service');
const strategicCoherence = require('./strategicCoherence.service');
const evaluatorAlignment = require('./evaluatorAlignment.service');
const logger = require('../logging/logger');

const VALID_TRIGGERS = [
  'on_output_create', 'on_pursuit_draft', 'on_review_handoff',
  'manual', 'scheduled', 'backfill',
];

// Run all 4 scorers for one output. Idempotent — re-running creates a
// fresh snapshot row but doesn't duplicate the underlying scorer rows
// (the Phase 14 scorers persist their own rows).
async function runForOutput(outputId, {
  organizationId = null, trigger = 'manual', actor = null,
} = {}) {
  if (!VALID_TRIGGERS.includes(trigger)) {
    const err = new Error(`Invalid quality automation trigger: ${trigger}`);
    err.code = 'BAD_INPUT'; throw err;
  }
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (!output) { const err = new Error(`Output ${outputId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const startedAt = Date.now();
  let runStatus = 'completed';
  const errors = [];

  // Run scorers in parallel for speed. Each scorer soft-fails: a single
  // scorer failure shouldn't kill the snapshot.
  const [pq, gr, sc, ea] = await Promise.all([
    proposalQuality.scoreOutput(Number(outputId), {
      organizationId, persist: true, actor,
    }).catch((e) => { errors.push({ scorer: 'quality', message: e.message }); return null; }),
    groundedness.analyze(Number(outputId), { organizationId, persist: true })
      .catch((e) => { errors.push({ scorer: 'groundedness', message: e.message }); return null; }),
    strategicCoherence.analyze(Number(outputId), { organizationId, persist: true })
      .catch((e) => { errors.push({ scorer: 'coherence', message: e.message }); return null; }),
    evaluatorAlignment.analyze(Number(outputId), { organizationId, persist: true })
      .catch((e) => { errors.push({ scorer: 'alignment', message: e.message }); return null; }),
  ]);
  if (errors.length === 4) runStatus = 'failed';
  else if (errors.length > 0) runStatus = 'partial';

  const composite = pq ? pq.composite_score : 0;
  const groundednessScore = gr ? gr.groundedness_score : 0;
  const coherenceScore = sc ? sc.coherence_score : 0;
  const alignmentScore = ea ? ea.alignment_score : 0;
  const classification = pq ? pq.classification : 'unscored';

  // Look up the most recent scorer rows to link them.
  const [pqRow, grRow, scRow, eaRow] = await Promise.all([
    pq ? proposalQuality.latestForOutput(Number(outputId)) : null,
    gr ? groundedness.latestForOutput(Number(outputId)) : null,
    sc ? strategicCoherence.latestForOutput(Number(outputId)) : null,
    ea ? evaluatorAlignment.latestForOutput(Number(outputId)) : null,
  ]);

  let snapshot = null;
  try {
    snapshot = await QualitySnapshot.create({
      organizationId: organizationId == null ? output.organizationId : Number(organizationId),
      opportunityOutputId: Number(outputId),
      pursuitId: pqRow ? pqRow.pursuitId : null,
      proposalQualityId: pqRow ? pqRow.id : null,
      groundednessId: grRow ? grRow.id : null,
      coherenceId: scRow ? scRow.id : null,
      alignmentId: eaRow ? eaRow.id : null,
      compositeScore: composite,
      groundednessScore, coherenceScore, alignmentScore,
      classification, runTrigger: trigger, runStatus,
      runDurationMs: Date.now() - startedAt,
      metadata: { actor, errors },
    });
  } catch (e) {
    logger.warn('qualityAutomation.runForOutput persist failed', { error: e.message });
  }
  return {
    output_id: Number(outputId),
    trigger, status: runStatus,
    duration_ms: Date.now() - startedAt,
    snapshot_id: snapshot ? Number(snapshot.id) : null,
    sub_scores: {
      composite, groundedness: groundednessScore,
      coherence: coherenceScore, alignment: alignmentScore,
    },
    classification, errors,
    governance_note: 'Automated quality evaluation only — proposal content unchanged.',
  };
}

// Worker-compatible handler. Used when qualityAutomation is wired into
// the Phase 10 captureWorker queue.
async function runWorkerJob(job) {
  const { outputId, organizationId, trigger = 'scheduled', actor = null } = job.payload || {};
  if (!outputId) {
    const err = new Error('Missing outputId in job payload'); err.code = 'BAD_INPUT'; throw err;
  }
  return runForOutput(outputId, { organizationId, trigger, actor });
}

// Enqueue a quality run for one output via the durable worker.
async function enqueueForOutput(outputId, {
  organizationId = null, trigger = 'on_output_create', actor = null, priority = 60,
} = {}) {
  try {
    // eslint-disable-next-line global-require
    const captureWorker = require('./captureWorker.service');
    if (!captureWorker.VALID_JOB_KINDS.includes('quality_automation')) {
      // Phase 15: extend the worker's job kinds. Not in the registry yet
      // (Phase 10 hard-coded the list), so fall back to running inline.
      return runForOutput(outputId, { organizationId, trigger, actor });
    }
    return captureWorker.enqueue({
      jobKind: 'quality_automation',
      pursuitId: null, opportunityId: null,
      payload: { outputId: Number(outputId), organizationId, trigger, actor },
      priority, actor,
    });
  } catch (e) {
    logger.warn('qualityAutomation.enqueueForOutput failed; running inline', { error: e.message });
    return runForOutput(outputId, { organizationId, trigger, actor });
  }
}

async function listSnapshots({ organizationId = null, limit = 50 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await QualitySnapshot.findAll({
    where, order: [['computed_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 50),
  });
  return rows.map((r) => r.toJSON());
}

async function latestForOutput(outputId) {
  const row = await QualitySnapshot.findOne({
    where: { opportunityOutputId: Number(outputId) },
    order: [['computed_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

async function summarize({ organizationId = null, sinceDays = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (sinceDays) where.computedAt = { [Op.gte]: new Date(Date.now() - Number(sinceDays) * 86400_000) };
  const rows = await QualitySnapshot.findAll({ where, limit: 1000 });
  if (rows.length === 0) {
    return {
      count: 0, by_trigger: {}, by_status: {},
      avg_composite: 0, avg_groundedness: 0, avg_coherence: 0, avg_alignment: 0,
    };
  }
  const byTrigger = {};
  const byStatus = {};
  for (const r of rows) {
    byTrigger[r.runTrigger || 'manual'] = (byTrigger[r.runTrigger || 'manual'] || 0) + 1;
    byStatus[r.runStatus] = (byStatus[r.runStatus] || 0) + 1;
  }
  const avg = (k) => Math.round(rows.reduce((a, r) => a + (r[k] || 0), 0) / rows.length);
  return {
    count: rows.length,
    by_trigger: byTrigger, by_status: byStatus,
    avg_composite: avg('compositeScore'),
    avg_groundedness: avg('groundednessScore'),
    avg_coherence: avg('coherenceScore'),
    avg_alignment: avg('alignmentScore'),
  };
}

module.exports = {
  VALID_TRIGGERS,
  runForOutput, runWorkerJob, enqueueForOutput,
  listSnapshots, latestForOutput, summarize,
};
