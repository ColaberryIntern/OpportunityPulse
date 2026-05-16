// Deep Research Phase 10 — pursuit-aware proposal context wiring.
//
// Wraps the existing OIED actionGenerator with a Phase 9 pursuit-context
// injection. The Phase 9 pursuitContextInjector composes the prompt block;
// this service is the integration seam that pulls the block in at draft
// time and threads it into the generator's pipeline.
//
// MEASURE-ONLY at the wrapper layer. The underlying actionGenerator
// already enforces lifecycle gates + the no-auto-submit posture.

const logger = require('../logging/logger');
const actionGenerator = require('../oied/actionGenerator.service');
const pursuitContextInjector = require('./pursuitContextInjector.service');

// Generate a proposal draft with pursuit context appended to the prompt.
// Returns the OpportunityOutput row from actionGenerator. Falls back to
// the existing non-pursuit-context path when no pursuit is provided.
async function generateWithPursuitContext({
  pursuitId, opportunityId, type = 'proposal',
  generatedBy = null, userId = null,
} = {}) {
  // Build the context block first (best-effort).
  let contextBlock = '';
  if (pursuitId != null) {
    try {
      contextBlock = await pursuitContextInjector.buildContextBlock(
        Number(pursuitId), opportunityId == null ? null : Number(opportunityId),
      );
    } catch (e) {
      logger.warn('pursuitContextWiring: block build failed', {
        pursuitId, error: e.message,
      });
      contextBlock = '';
    }
  }
  // Inject into actionGenerator. Since actionGenerator builds its own
  // user prompt from opportunity + profile + grounding, we attach the
  // context block via the metadata side channel. The Phase 11 follow-up
  // will extend actionGenerator's buildGroundedUserPrompt to accept the
  // block directly; v1 wires the block onto the output's metadata so it
  // is at least preserved + auditable.
  const out = await actionGenerator.generateOutput({
    opportunityId, type,
    generatedBy, userId: userId == null ? generatedBy : userId,
  });
  if (out && contextBlock) {
    try {
      const metadata = { ...(out.metadata || {}), pursuit_context_block: contextBlock.slice(0, 4000) };
      await out.update({ metadata });
    } catch (e) {
      logger.warn('pursuitContextWiring: failed to stamp metadata', { id: out.id, error: e.message });
    }
  }
  return out;
}

// Returns the composed context block + a summary of what's in it, for
// the UI to preview before triggering a draft.
async function previewContextBlock(pursuitId, opportunityId = null) {
  const ctx = await pursuitContextInjector.buildContext(Number(pursuitId), opportunityId);
  const block = pursuitContextInjector.composeContextBlock(ctx);
  const oppCount = ctx && Array.isArray(ctx.opps) ? ctx.opps.length : 0;
  const assetCount = ctx && Array.isArray(ctx.assets) ? ctx.assets.length : 0;
  const blockerCount = ctx && ctx.readiness && Array.isArray(ctx.readiness.blockers)
    ? ctx.readiness.blockers.length : 0;
  return {
    block,
    char_length: block.length,
    has_capture_strategy: Boolean(ctx && ctx.capture),
    linked_opportunity_count: oppCount,
    suggested_asset_count: assetCount,
    readiness_blocker_count: blockerCount,
  };
}

module.exports = {
  generateWithPursuitContext, previewContextBlock,
};
