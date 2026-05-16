// Deep Research Phase 11 — pursuit-context prompt composition.
//
// Composes a deterministic, inspectable prompt block that can be injected
// into actionGenerator's user-prompt builder. Every input is named,
// every output line is traceable to its source.
//
// IMPORTANT: NO hidden prompt augmentation. composePromptBlock() is a
// pure-data transform from a context object → a markdown block. Callers
// can preview the exact text before it ships to the LLM.

const pursuitContextInjector = require('./pursuitContextInjector.service');
const captureStrategy = require('./captureStrategy.service');
const proposalReadiness = require('./proposalReadiness.service');
const proposalAcceleration = require('./proposalAcceleration.service');
const logger = require('../logging/logger');

const MAX_BLOCK_CHARS = Number(process.env.DEEP_RESEARCH_CONTEXT_BLOCK_MAX) || 4500;
const MAX_LINE_CHARS = 240;

function fmtList(items, { max = 5, prefix = '- ' } = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items.slice(0, max).map((x) => {
    const s = typeof x === 'string' ? x : (x && x.text ? x.text : JSON.stringify(x));
    return `${prefix}${String(s).slice(0, MAX_LINE_CHARS)}`;
  }).join('\n');
}

function joinSection(title, body) {
  if (!body || !String(body).trim()) return '';
  return `\n## ${title}\n${body}`;
}

// Compose the full block. Inputs are an explicit pursuit context — every
// branch logs what was included for audit.
function composePromptBlock(context, { maxChars = MAX_BLOCK_CHARS } = {}) {
  if (!context || typeof context !== 'object') {
    return { block: '', included: [], excluded: ['no_context'] };
  }
  const included = [];
  const excluded = [];
  const lines = [];
  lines.push('# Pursuit Context (deterministic, audit-traceable)');

  // 1) Pursuit identity.
  if (context.pursuit) {
    included.push('pursuit');
    lines.push(joinSection('Pursuit', [
      context.pursuit.name ? `Name: ${context.pursuit.name}` : null,
      context.pursuit.classification ? `Classification: ${context.pursuit.classification}` : null,
      context.pursuit.status ? `Status: ${context.pursuit.status}` : null,
    ].filter(Boolean).join('\n')));
  } else excluded.push('pursuit');

  // 2) Capture strategy — evaluator priorities, differentiators, positioning.
  if (context.capture) {
    included.push('capture_strategy');
    const cap = context.capture;
    const capBody = [
      cap.evaluator_priorities && cap.evaluator_priorities.length
        ? `**Evaluator priorities**\n${fmtList(cap.evaluator_priorities, { max: 6 })}` : null,
      cap.agency_pain_points && cap.agency_pain_points.length
        ? `**Agency pain points**\n${fmtList(cap.agency_pain_points, { max: 6 })}` : null,
      cap.differentiators && cap.differentiators.length
        ? `**Differentiators**\n${fmtList(cap.differentiators, { max: 6 })}` : null,
      cap.positioning_recommendations && cap.positioning_recommendations.length
        ? `**Positioning recommendations**\n${fmtList(cap.positioning_recommendations, { max: 6 })}` : null,
      cap.incumbent_risks && cap.incumbent_risks.length
        ? `**Incumbent risks**\n${fmtList(cap.incumbent_risks, { max: 5 })}` : null,
      cap.partnership_opportunities && cap.partnership_opportunities.length
        ? `**Partnership opportunities**\n${fmtList(cap.partnership_opportunities, { max: 5 })}` : null,
      cap.reusable_language && cap.reusable_language.length
        ? `**Reusable language**\n${fmtList(cap.reusable_language, { max: 4 })}` : null,
    ].filter(Boolean).join('\n\n');
    lines.push(joinSection('Capture Strategy', capBody));
  } else excluded.push('capture_strategy');

  // 3) Readiness blockers.
  if (context.readiness && Array.isArray(context.readiness.blockers) && context.readiness.blockers.length) {
    included.push('readiness_blockers');
    lines.push(joinSection('Readiness Blockers',
      fmtList(context.readiness.blockers.map((b) => b.text || b.label || JSON.stringify(b)), { max: 8 })));
  } else excluded.push('readiness_blockers');

  // 4) Linked opportunities — list compactly.
  if (Array.isArray(context.opps) && context.opps.length) {
    included.push('linked_opps');
    lines.push(joinSection('Linked Opportunities',
      fmtList(context.opps.slice(0, 8).map((o) => o.title || o.name || `opp ${o.id}`), { max: 8 })));
  } else excluded.push('linked_opps');

  // 5) Suggested assets — past wins, capability statement excerpts.
  if (Array.isArray(context.assets) && context.assets.length) {
    included.push('suggested_assets');
    lines.push(joinSection('Suggested Acceleration Assets',
      fmtList(context.assets.slice(0, 6).map((a) => a.name || a.title || a.label || `asset ${a.id}`), { max: 6 })));
  } else excluded.push('suggested_assets');

  // 6) Strategic + recurring intelligence.
  if (Array.isArray(context.strategic_patterns) && context.strategic_patterns.length) {
    included.push('strategic_patterns');
    lines.push(joinSection('Strategic Patterns Active',
      fmtList(context.strategic_patterns, { max: 4 })));
  } else excluded.push('strategic_patterns');

  if (Array.isArray(context.recurring_agency) && context.recurring_agency.length) {
    included.push('recurring_agency');
    lines.push(joinSection('Recurring Agency Intelligence',
      fmtList(context.recurring_agency, { max: 4 })));
  } else excluded.push('recurring_agency');

  // 7) Governance footer.
  lines.push('\n---');
  lines.push('NOTE: All facts in this block came from deterministic capture'
    + ' intelligence. The draft below must remain consistent with the named'
    + ' priorities, blockers, and positioning. Do not invent agency stakeholders'
    + ' or commitments not present above.');

  let block = lines.join('\n').trim();
  if (block.length > maxChars) {
    block = `${block.slice(0, maxChars - 40)}\n\n[TRUNCATED FOR PROMPT BUDGET]`;
  }
  return { block, included, excluded };
}

// Build the full context object for one pursuit by composing every
// Phase 8/9 source. Soft-fails on each step — partial context > no context.
async function buildPursuitContext(pursuitId, { opportunityId = null } = {}) {
  const ctx = {};
  try {
    const base = await pursuitContextInjector.buildContext(Number(pursuitId), opportunityId);
    if (base) {
      ctx.pursuit = base.pursuit || null;
      ctx.capture = base.capture || null;
      ctx.readiness = base.readiness || null;
      ctx.opps = base.opps || [];
      ctx.assets = base.assets || [];
    }
  } catch (e) {
    logger.warn('pursuitContextPrompt: base context failed', { error: e.message });
  }
  // Strategic patterns + recurring agency are best-effort.
  try {
    const cap = await captureStrategy.getForPursuit(Number(pursuitId));
    if (cap && cap.strategic_patterns) ctx.strategic_patterns = cap.strategic_patterns;
    if (cap && cap.recurring_agency_summary) {
      ctx.recurring_agency = [cap.recurring_agency_summary];
    }
  } catch (e) { /* swallow */ }
  return ctx;
}

// Convenience: build the context for a pursuit and immediately compose
// the prompt block. Returns the block + which sections were included +
// audit hash so downstream code can record what shipped.
async function previewBlockForPursuit(pursuitId, { opportunityId = null, maxChars } = {}) {
  const context = await buildPursuitContext(pursuitId, { opportunityId });
  const composed = composePromptBlock(context, { maxChars });
  const crypto = require('crypto');
  const audit_hash = crypto.createHash('sha256').update(composed.block).digest('hex').slice(0, 16);
  return {
    pursuit_id: Number(pursuitId),
    opportunity_id: opportunityId == null ? null : Number(opportunityId),
    block: composed.block,
    char_length: composed.block.length,
    included_sections: composed.included,
    excluded_sections: composed.excluded,
    audit_hash,
    governance_note: 'Deterministic composition; every line traces to a Phase 8/9 source.',
  };
}

module.exports = {
  MAX_BLOCK_CHARS, MAX_LINE_CHARS,
  composePromptBlock, buildPursuitContext, previewBlockForPursuit,
};
