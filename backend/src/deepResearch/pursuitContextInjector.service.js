// Deep Research Phase 9 — pursuit-aware proposal context injector.
//
// Composes a "Pursuit Context" block that the actionGenerator can append to
// its user prompt when generating a draft. The block carries: capture
// strategy positioning, evaluator priorities, agency pain points, recurring
// agency patterns, linked opportunity excerpts, proposal acceleration
// asset hints, readiness blockers, strategic differentiation.
//
// Pure composition — no AI dependency. Returns a string that callers can
// either prepend to the existing user prompt OR pass as the new
// `pursuitContext` arg once actionGenerator supports it (the actionGenerator
// extension itself is deferred; this service produces the payload).

const { Op } = require('sequelize');
const {
  PursuitWorkspace, Opportunity, CaptureStrategy,
  ProposalReadinessScore, OpportunityRelationship,
} = require('../models');
const proposalAcceleration = require('./proposalAcceleration.service');

const MAX_LINKED_OPP_LINES = 12;
const MAX_ASSETS = 6;

function fmtList(items, { max = 5, prefix = '- ' } = {}) {
  return (Array.isArray(items) ? items.slice(0, max) : [])
    .map((s) => `${prefix}${String(s).slice(0, 300)}`)
    .join('\n');
}

async function buildContext(pursuitId, opportunityId = null) {
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) return null;
  const capture = await CaptureStrategy.findOne({
    where: { scopeKind: 'pursuit', scopeId: pursuit.id },
    order: [['computed_at', 'DESC']],
  });
  const readiness = await ProposalReadinessScore.findOne({
    where: { scopeKind: 'pursuit', scopeId: pursuit.id },
    order: [['computed_at', 'DESC']],
  });
  const oppIds = Array.isArray(pursuit.linkedOpportunityIds)
    ? pursuit.linkedOpportunityIds : [];
  // Pull the focal opportunity first if requested, plus a handful of
  // siblings so the AI can read across the pursuit's bid set.
  let opps = [];
  if (oppIds.length > 0) {
    const focus = opportunityId != null ? Number(opportunityId) : null;
    const ordered = focus != null
      ? [focus, ...oppIds.filter((id) => Number(id) !== focus)]
      : oppIds.slice();
    opps = await Opportunity.findAll({
      where: { id: { [Op.in]: ordered.slice(0, MAX_LINKED_OPP_LINES) } },
      attributes: ['id', 'title', 'type', 'value', 'category'],
    });
  }
  // Recurring agency pattern matching the pursuit's first agency, if any.
  let recurringAgency = null;
  if (opps.length > 0) {
    const top = opps[0];
    const sourceAgency = (top.sourceData && (top.sourceData.agency_name || top.sourceData.agency)) || null;
    if (sourceAgency) {
      const rel = await OpportunityRelationship.findOne({
        where: { relationshipType: 'agency', value: String(sourceAgency) },
      });
      recurringAgency = rel ? rel.toJSON() : null;
    }
  }
  // Suggest acceleration assets matched to the focal opp (or first linked).
  let assets = [];
  const targetOpp = (opportunityId != null ? Number(opportunityId) : (oppIds[0] || null));
  if (targetOpp != null) {
    try {
      assets = await proposalAcceleration.suggestForOpportunity(targetOpp);
    } catch (_) { assets = []; }
  }
  return {
    pursuit, capture, readiness, opps, recurringAgency, assets,
  };
}

// Compose the prompt-ready Pursuit Context block. Bounded length so it
// doesn't blow the actionGenerator token budget.
function composeContextBlock(ctx) {
  if (!ctx || !ctx.pursuit) return '';
  const lines = ['', '## Pursuit Context (Phase 9 injection)'];
  lines.push(`Pursuit: ${ctx.pursuit.name}`);
  if (ctx.pursuit.summary) lines.push(`Summary: ${String(ctx.pursuit.summary).slice(0, 400)}`);
  if (ctx.pursuit.positioning) lines.push(`Positioning: ${String(ctx.pursuit.positioning).slice(0, 400)}`);
  if (ctx.capture) {
    const c = ctx.capture;
    if (c.narrative) lines.push(`\nCapture narrative: ${String(c.narrative).slice(0, 500)}`);
    if (Array.isArray(c.evaluatorPriorities) && c.evaluatorPriorities.length) {
      lines.push('\nEvaluator priorities:');
      lines.push(fmtList(c.evaluatorPriorities.map((p) => p.label), { max: 5 }));
    }
    if (Array.isArray(c.agencyPainPoints) && c.agencyPainPoints.length) {
      lines.push('\nAgency pain points:');
      lines.push(fmtList(c.agencyPainPoints.map((p) => p.label), { max: 5 }));
    }
    if (Array.isArray(c.differentiators) && c.differentiators.length) {
      lines.push('\nDifferentiators:');
      lines.push(fmtList(c.differentiators.map((p) => p.label), { max: 5 }));
    }
  }
  if (ctx.recurringAgency) {
    lines.push(`\nRecurring-agency pattern: ${ctx.recurringAgency.value} appears in ${ctx.recurringAgency.occurrenceCount} recent procurements.`);
  }
  if (Array.isArray(ctx.opps) && ctx.opps.length > 0) {
    lines.push(`\nLinked opportunities (${ctx.opps.length} of ${(ctx.pursuit.linkedOpportunityIds || []).length}):`);
    for (const o of ctx.opps.slice(0, MAX_LINKED_OPP_LINES)) {
      lines.push(`- #${o.id} [${o.type}] ${o.title}${o.value ? ` ($${Number(o.value).toLocaleString()})` : ''}`);
    }
  }
  if (Array.isArray(ctx.assets) && ctx.assets.length > 0) {
    lines.push('\nReusable proposal assets matched:');
    for (const a of ctx.assets.slice(0, MAX_ASSETS)) {
      lines.push(`- ${a.assetKind}: ${a.label}`);
    }
  }
  if (ctx.readiness && Array.isArray(ctx.readiness.blockers) && ctx.readiness.blockers.length > 0) {
    lines.push('\nReadiness blockers (address explicitly in the proposal narrative):');
    lines.push(fmtList(ctx.readiness.blockers, { max: 4 }));
  }
  lines.push('\nNOTE: Generated draft will land in the Review Queue for human review.');
  lines.push('NO auto-submission; the human reviewer + signatory submit through the agency portal.');
  return lines.join('\n');
}

// Public entry — builds + composes in one call.
async function buildContextBlock(pursuitId, opportunityId = null) {
  const ctx = await buildContext(pursuitId, opportunityId);
  return composeContextBlock(ctx);
}

module.exports = {
  MAX_LINKED_OPP_LINES, MAX_ASSETS,
  fmtList, buildContext, composeContextBlock, buildContextBlock,
};
