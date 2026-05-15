// Deep Research Phase 8 — pursuit → Review Queue handoff.
//
// Generates Review Queue drafts for every linked opportunity in a pursuit
// by invoking the existing actionGenerator.generateOutput pipeline. Each
// attempt is audited in review_queue_handoffs so failures are retryable
// and successes are traceable back to the pursuit.
//
// HUMAN REVIEW + HUMAN SUBMISSION ARE STILL REQUIRED. The handoff drops
// drafts into OpportunityOutput (status: 'draft'), where the existing
// Review Queue picks them up. Nothing here approves or submits anything.

const logger = require('../logging/logger');
const {
  PursuitWorkspace, ReviewQueueHandoff, OpportunityOutput,
} = require('../models');
const actionGenerator = require('../oied/actionGenerator.service');

const DEFAULT_TYPE = 'proposal';
const SUPPORTED_TYPES = new Set(['proposal', 'offer', 'analysis']);

// Generate drafts for every linked opportunity in a pursuit. Per-opp
// failure is recorded but does NOT abort the run — the bridge wants
// partial success to be inspectable. Idempotency: if a successful handoff
// already exists for (pursuit_id, opportunity_id, output_type), the
// existing output is re-surfaced instead of re-generating.
async function generateDraftsForPursuit(pursuitId, {
  outputType = DEFAULT_TYPE,
  actor = null,
  generatedBy = null,
  skipExisting = true,
} = {}) {
  if (!SUPPORTED_TYPES.has(outputType)) {
    const err = new Error(`Unsupported output type ${outputType}`);
    err.code = 'BAD_INPUT'; throw err;
  }
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) {
    const err = new Error(`Pursuit ${pursuitId} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  const oppIds = Array.isArray(pursuit.linkedOpportunityIds)
    ? pursuit.linkedOpportunityIds.map(Number).filter(Number.isInteger) : [];
  if (oppIds.length === 0) {
    return { pursuit_id: pursuit.id, requested: 0, succeeded: 0, failed: 0, handoffs: [] };
  }

  const handoffs = [];
  let succeeded = 0; let failed = 0; let skipped = 0;
  for (const opportunityId of oppIds) {
    // Idempotency check.
    if (skipExisting) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await ReviewQueueHandoff.findOne({
        where: { pursuitId: pursuit.id, opportunityId, outputType, status: 'success' },
      });
      if (existing) {
        handoffs.push({ ...existing.toJSON(), reused: true });
        skipped += 1;
        continue;
      }
    }
    let outputRow = null;
    let errorMessage = null;
    let status = 'pending';
    try {
      // eslint-disable-next-line no-await-in-loop
      outputRow = await actionGenerator.generateOutput({
        opportunityId, type: outputType,
        generatedBy, userId: generatedBy,
      });
      status = 'success'; succeeded += 1;
    } catch (e) {
      errorMessage = e.message || String(e);
      status = 'failed'; failed += 1;
      logger.warn('reviewQueueBridge: draft generation failed', {
        pursuitId, opportunityId, outputType, error: errorMessage,
      });
    }
    // eslint-disable-next-line no-await-in-loop
    const row = await ReviewQueueHandoff.create({
      pursuitId: pursuit.id,
      opportunityId,
      outputId: outputRow ? outputRow.id : null,
      outputType,
      status,
      errorMessage,
      actor,
      completedAt: new Date(),
      metadata: outputRow ? { status: outputRow.status } : {},
    });
    handoffs.push(row.toJSON());
  }

  // Stamp the pursuit's linkedOutputIds with any successful drafts so the
  // pursuit page renders them under "linked outputs".
  if (succeeded > 0) {
    const successfulOutputIds = handoffs
      .filter((h) => h.status === 'success' && h.outputId)
      .map((h) => h.outputId);
    const existing = Array.isArray(pursuit.linkedOutputIds) ? pursuit.linkedOutputIds : [];
    const merged = Array.from(new Set([...existing, ...successfulOutputIds]));
    await pursuit.update({ linkedOutputIds: merged });
  }

  return {
    pursuit_id: pursuit.id,
    requested: oppIds.length,
    succeeded, failed, skipped,
    handoffs,
  };
}

async function listHandoffsForPursuit(pursuitId) {
  const rows = await ReviewQueueHandoff.findAll({
    where: { pursuitId: Number(pursuitId) },
    order: [['created_at', 'DESC']],
    limit: 200,
  });
  return rows.map((r) => r.toJSON());
}

async function getHandoffSummary(pursuitId) {
  const handoffs = await listHandoffsForPursuit(pursuitId);
  const counts = { total: handoffs.length, success: 0, failed: 0, skipped: 0, pending: 0 };
  for (const h of handoffs) counts[h.status] = (counts[h.status] || 0) + 1;
  return counts;
}

module.exports = {
  DEFAULT_TYPE, SUPPORTED_TYPES,
  generateDraftsForPursuit, listHandoffsForPursuit, getHandoffSummary,
};
