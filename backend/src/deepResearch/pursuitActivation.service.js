// Deep Research Phase 8 — pursuit activation engine.
//
// Converts any strategic insight (cluster / pattern / agency / technology /
// opportunity_group / ecosystem / venture / research_run / manual) into a
// fully-loaded PursuitWorkspace + audit row in pursuit_activations.
//
// Reuses Phase 7 traceability + justification + acceleration. The pursuit
// row exists; the activation row records WHAT was attached at activation
// time so re-activation against the same source is auditable.
//
// MEASURE-ONLY at the activation step. The pursuit it produces still
// requires human work before anything operational happens — no
// auto-submission, no auto-bid.

const {
  PursuitWorkspace, PursuitActivation,
} = require('../models');
const deepResearchContext = require('./deepResearchContext.service');
const opportunityTraceability = require('./opportunityTraceability.service');
const opportunityJustification = require('./opportunityJustification.service');
const proposalAcceleration = require('./proposalAcceleration.service');

const VALID_SOURCE_KINDS = [
  'cluster', 'pattern', 'agency', 'technology', 'opportunity_group',
  'ecosystem', 'venture', 'research_run', 'recommendation',
  'intervention', 'manual',
];

// Map an activation source to a PursuitWorkspace anchor_kind. Several
// activation sources collapse onto a single anchor concept (e.g. 'agency'
// and 'technology' both anchor as 'opportunity_group' since the pursuit
// owns the opportunity-id set; the activation source records WHERE it
// came from).
function anchorKindFor(sourceKind) {
  switch (sourceKind) {
    case 'venture': return 'venture';
    case 'cluster': return 'cluster';
    case 'pattern': return 'pattern';
    case 'recommendation':
    case 'intervention':
    case 'agency':
    case 'technology':
    case 'opportunity_group':
    case 'ecosystem':
    case 'research_run': return 'custom';
    default: return 'custom';
  }
}

function defaultPursuitName(sourceKind, title) {
  const friendly = {
    cluster: 'Cluster',
    pattern: 'Pattern',
    agency: 'Agency',
    technology: 'Technology',
    opportunity_group: 'Opportunity group',
    ecosystem: 'Ecosystem',
    venture: 'Venture',
    research_run: 'Research run',
    recommendation: 'Strategic recommendation',
    intervention: 'Intervention',
    manual: 'Manual',
  }[sourceKind] || 'Insight';
  return `${friendly}: ${title} — pursuit`;
}

// Pull supporting opportunity ids from an arbitrary activation source via
// the existing context resolver. Returns [] when the source has no
// opportunities (legitimate state — the activation still proceeds).
async function resolveOpportunityIdsForSource(sourceKind, sourceId) {
  // Map source -> context kind. agency/technology pass through values; others
  // pass through ids.
  switch (sourceKind) {
    case 'cluster': return deepResearchContext.resolveOpportunityIds('cluster', sourceId);
    case 'pattern': return deepResearchContext.resolveOpportunityIds('pattern', sourceId);
    case 'venture': return deepResearchContext.resolveOpportunityIds('venture', sourceId);
    case 'research_run': return deepResearchContext.resolveOpportunityIds('researchRun', sourceId);
    case 'recommendation': return deepResearchContext.resolveOpportunityIds('recommendation', sourceId);
    case 'intervention': return deepResearchContext.resolveOpportunityIds('intervention', sourceId);
    case 'agency': return deepResearchContext.resolveOpportunityIds('agency', sourceId);
    case 'technology': return deepResearchContext.resolveOpportunityIds('technology', sourceId);
    case 'opportunity_group':
      // For opportunity_group, sourceId is a JSON-encoded array string of ids.
      try { return Array.isArray(JSON.parse(sourceId)) ? JSON.parse(sourceId).map(Number).filter(Number.isInteger) : []; }
      catch (_) { return []; }
    case 'ecosystem':
      // Ecosystem maps to a value lookup; reuse 'technology' as the closest
      // recurring-relationship surface in v1.
      return deepResearchContext.resolveOpportunityIds('technology', sourceId);
    default: return [];
  }
}

// Activate. Creates the PursuitWorkspace + the audit row + persists a
// justification snapshot for the anchor when appropriate. Returns the
// fully-shaped pursuit summary the caller can use to navigate.
async function activate({
  sourceKind, sourceId = null, name = null, summary = null,
  actor = null, attachJustification = true,
} = {}) {
  if (!VALID_SOURCE_KINDS.includes(sourceKind)) {
    const err = new Error(`Invalid source_kind ${sourceKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  // Resolve the context summary for header + auto-name.
  let contextSummary = null;
  if (['cluster', 'pattern', 'venture', 'recommendation', 'intervention', 'research_run']
    .includes(sourceKind)) {
    try {
      const ctxKind = sourceKind === 'research_run' ? 'researchRun' : sourceKind;
      contextSummary = await deepResearchContext.getContextSummary(ctxKind, sourceId);
    } catch (_) { contextSummary = null; }
  } else if (sourceKind === 'agency' || sourceKind === 'technology') {
    try {
      contextSummary = await deepResearchContext.getContextSummary(sourceKind, sourceId);
    } catch (_) { contextSummary = null; }
  }
  const finalName = name || (contextSummary && contextSummary.title
    ? defaultPursuitName(sourceKind, contextSummary.title)
    : defaultPursuitName(sourceKind, sourceId || 'untitled'));
  const finalSummary = summary
    || (contextSummary && contextSummary.description ? contextSummary.description : null);

  const opportunityIds = await resolveOpportunityIdsForSource(sourceKind, sourceId);
  const linkedOpps = Array.isArray(opportunityIds) ? opportunityIds.slice(0, 50) : [];

  // Anchor kind for the pursuit row. Custom-anchor activations (agency/tech)
  // store the source value via the activation row, NOT on the pursuit anchor.
  const anchorKind = anchorKindFor(sourceKind);
  const anchorId = ['venture', 'cluster', 'pattern', 'recommendation', 'intervention']
    .includes(sourceKind) ? Number(sourceId) : null;

  const pursuit = await PursuitWorkspace.create({
    name: finalName,
    anchorKind,
    anchorId,
    summary: finalSummary,
    status: 'open',
    linkedOpportunityIds: linkedOpps,
    createdBy: actor,
  });

  // Phase 7 justification snapshot when the anchor maps to a real insight.
  let justification = null;
  if (attachJustification && anchorId != null
    && ['venture', 'cluster', 'pattern', 'recommendation', 'intervention'].includes(sourceKind)) {
    try {
      const insightKind = sourceKind;
      justification = await opportunityJustification.persistJustification(insightKind, anchorId);
    } catch (_) { justification = null; }
  }

  // Acceleration suggestions touch up to 5 linked opps so the pursuit page
  // has assets to show on first render.
  let accelerationSuggestions = 0;
  for (const oppId of linkedOpps.slice(0, 5)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const suggested = await proposalAcceleration.suggestForOpportunity(oppId);
      accelerationSuggestions += suggested.length;
    } catch (_) { /* swallow */ }
  }

  const attachedCounts = {
    opportunities: linkedOpps.length,
    justification: justification ? 1 : 0,
    acceleration_suggestions: accelerationSuggestions,
  };

  const activation = await PursuitActivation.create({
    pursuitId: pursuit.id,
    sourceKind,
    sourceId: sourceId == null ? null : String(sourceId).slice(0, 200),
    attachedCounts,
    rationale: contextSummary && contextSummary.description
      ? `Activated from ${sourceKind} "${contextSummary.title}". `
        + `${linkedOpps.length} opportunit${linkedOpps.length === 1 ? 'y' : 'ies'} linked.`
      : `Activated from ${sourceKind}. ${linkedOpps.length} opportunit${linkedOpps.length === 1 ? 'y' : 'ies'} linked.`,
    actor,
  });

  // Phase 14: emit lineage edge from the source (cluster/pattern/venture/...)
  // to the new pursuit. Soft-fails so activation never breaks on lineage.
  try {
    // eslint-disable-next-line global-require
    const lineageEdgeWriter = require('./lineageEdgeWriter.service');
    lineageEdgeWriter.helpers.pursuitActivated({
      pursuitId: pursuit.id,
      sourceKind, sourceId,
      organizationId: pursuit.organizationId || null,
      actorEmail: actor || null,
    });
  } catch (e) { /* swallow */ }

  return {
    pursuit: pursuit.toJSON(),
    activation: activation.toJSON(),
    context: contextSummary,
    justification,
  };
}

async function listActivations({ pursuitId = null, limit = 100 } = {}) {
  const where = {};
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  const rows = await PursuitActivation.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  VALID_SOURCE_KINDS,
  anchorKindFor, defaultPursuitName,
  resolveOpportunityIdsForSource,
  activate, listActivations,
};
