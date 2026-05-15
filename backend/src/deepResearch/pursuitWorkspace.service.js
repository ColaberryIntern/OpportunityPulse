// Deep Research Phase 7 — proposal pursuit workspace.
//
// Anchored to a venture / cluster / pattern / custom set / individual
// opportunity. Composes a read-only planning view: linked opportunities,
// reusable proposal assets, readiness summary, staffing recommendation,
// suggested positioning. NEVER auto-submits.

const { Op } = require('sequelize');
const {
  PursuitWorkspace, Opportunity, OpportunityOutput,
  VentureIdea, ExecutionReadiness, StrategicCluster,
} = require('../models');
const opportunityTraceability = require('./opportunityTraceability.service');
const proposalAcceleration = require('./proposalAcceleration.service');
const opportunityJustification = require('./opportunityJustification.service');

const VALID_ANCHORS = ['venture', 'cluster', 'pattern', 'custom', 'opportunity'];
const VALID_STATUSES = ['open', 'in_progress', 'submitted', 'won', 'lost', 'archived'];

async function createPursuit({
  name, anchorKind, anchorId, summary = null, positioning = null,
  linkedOpportunityIds = [], createdBy = null,
} = {}) {
  if (!name || !anchorKind) {
    const err = new Error('name and anchorKind are required'); err.code = 'BAD_INPUT'; throw err;
  }
  if (!VALID_ANCHORS.includes(anchorKind)) {
    const err = new Error(`Invalid anchorKind ${anchorKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await PursuitWorkspace.create({
    name, anchorKind, anchorId: anchorId == null ? null : Number(anchorId),
    summary, positioning,
    status: 'open',
    linkedOpportunityIds: Array.isArray(linkedOpportunityIds)
      ? linkedOpportunityIds.map(Number).filter((n) => Number.isInteger(n)) : [],
    createdBy,
  });
  return row.toJSON();
}

async function updatePursuit(id, payload = {}) {
  const row = await PursuitWorkspace.findByPk(id);
  if (!row) { const err = new Error(`Pursuit ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const updates = {};
  if (payload.name != null) updates.name = payload.name;
  if (payload.summary != null) updates.summary = payload.summary;
  if (payload.positioning != null) updates.positioning = payload.positioning;
  if (payload.status != null) {
    if (!VALID_STATUSES.includes(payload.status)) {
      const err = new Error(`Invalid status ${payload.status}`); err.code = 'BAD_INPUT'; throw err;
    }
    updates.status = payload.status;
  }
  if (payload.linkedOpportunityIds != null) {
    updates.linkedOpportunityIds = Array.isArray(payload.linkedOpportunityIds)
      ? payload.linkedOpportunityIds.map(Number).filter((n) => Number.isInteger(n)) : [];
  }
  if (payload.linkedOutputIds != null) {
    updates.linkedOutputIds = Array.isArray(payload.linkedOutputIds)
      ? payload.linkedOutputIds.map(Number).filter((n) => Number.isInteger(n)) : [];
  }
  if (payload.note != null) {
    const notes = Array.isArray(row.notes) ? row.notes.slice() : [];
    notes.unshift({ note: String(payload.note), at: new Date().toISOString() });
    updates.notes = notes.slice(0, 50);
  }
  await row.update(updates);
  return row.toJSON();
}

async function deletePursuit(id) {
  const row = await PursuitWorkspace.findByPk(id);
  if (!row) { const err = new Error(`Pursuit ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.destroy();
  return { id, deleted: true };
}

async function listPursuits({ status = null, limit = 100 } = {}) {
  const where = {};
  if (status) where.status = status;
  const rows = await PursuitWorkspace.findAll({
    where, order: [['updated_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

function summarizeReadiness(opportunities) {
  if (opportunities.length === 0) return { count: 0, with_score: 0, mean_score: null };
  const scored = opportunities.filter((o) => o.aiScore != null);
  const mean = scored.length
    ? scored.reduce((acc, o) => acc + Number(o.aiScore || 0), 0) / scored.length
    : null;
  return {
    count: opportunities.length,
    with_score: scored.length,
    mean_score: mean != null ? Number(mean.toFixed(2)) : null,
  };
}

function recommendStaffing(opportunities) {
  // Very simple heuristic — count opportunities and propose a default team.
  const n = opportunities.length;
  if (n === 0) return { lead: null, support: [], note: 'No opportunities linked yet.' };
  if (n <= 2) {
    return { lead: 'tech lead', support: ['full-stack engineer'], note: 'Small pursuit — lean team.' };
  }
  if (n <= 6) {
    return { lead: 'tech lead', support: ['full-stack engineer', 'ai/ml engineer'],
      note: 'Mid-size pursuit — pair a lead with one engineer + one AI/ML role.' };
  }
  return { lead: 'tech lead', support: ['full-stack engineer', 'ai/ml engineer', 'second engineer'],
    note: 'Large pursuit — bring a full crew + a proposal writer.' };
}

async function getPursuit(id, { includeEvidence = true } = {}) {
  const row = await PursuitWorkspace.findByPk(id);
  if (!row) return null;
  const j = row.toJSON();
  const oppIds = Array.isArray(j.linkedOpportunityIds) ? j.linkedOpportunityIds : [];
  const opportunities = oppIds.length
    ? (await Opportunity.findAll({ where: { id: { [Op.in]: oppIds } } })).map((o) => o.toJSON())
    : [];
  // Anchor evidence — pull supporting opps via the anchor when explicit
  // linkedOpportunityIds aren't enough.
  let evidence = null;
  if (includeEvidence && j.anchorKind && j.anchorId) {
    try {
      const trace = await opportunityTraceability.getSupportingOpportunities(
        j.anchorKind, j.anchorId, { limit: 30 },
      );
      evidence = trace.opportunities;
    } catch (_) { evidence = null; }
  }
  // Anchor justification.
  let justification = null;
  if (j.anchorKind && j.anchorId) {
    try {
      justification = await opportunityJustification.getJustification(j.anchorKind, j.anchorId);
    } catch (_) { justification = null; }
  }
  // Linked OpportunityOutputs (proposals/offers/analyses).
  const outputs = oppIds.length
    ? (await OpportunityOutput.findAll({ where: { opportunityId: { [Op.in]: oppIds } } }))
      .map((o) => o.toJSON())
    : [];
  // Suggested proposal acceleration assets — best of all linked opps.
  const assetSuggestions = [];
  for (const oppId of oppIds.slice(0, 5)) {
    // eslint-disable-next-line no-await-in-loop
    const suggested = await proposalAcceleration.suggestForOpportunity(oppId);
    for (const s of suggested) assetSuggestions.push(s);
  }
  const dedupedAssets = Array.from(
    new Map(assetSuggestions.map((a) => [a.id, a])).values(),
  ).sort((a, b) => (b._suggest_score || 0) - (a._suggest_score || 0)).slice(0, 12);
  // Anchor-derived staffing recommendation if not stored.
  const staffing = j.staffingRecommendation && Object.keys(j.staffingRecommendation).length
    ? j.staffingRecommendation : recommendStaffing(opportunities);
  // Anchor metadata.
  let anchor = null;
  if (j.anchorKind === 'venture' && j.anchorId) {
    const v = await VentureIdea.findByPk(j.anchorId);
    anchor = v ? { kind: 'venture', id: v.id, title: v.title, lifecycle_state: v.lifecycleState } : null;
  } else if (j.anchorKind === 'cluster' && j.anchorId) {
    const c = await StrategicCluster.findByPk(j.anchorId);
    anchor = c ? { kind: 'cluster', id: c.id, name: c.name, slug: c.slug } : null;
  } else if (j.anchorKind) {
    anchor = { kind: j.anchorKind, id: j.anchorId };
  }
  return {
    ...j,
    anchor,
    opportunities,
    evidence_opportunities: evidence,
    justification,
    linked_outputs: outputs,
    asset_suggestions: dedupedAssets,
    staffing_recommendation: staffing,
    readiness_summary: summarizeReadiness(opportunities),
  };
}

module.exports = {
  VALID_ANCHORS, VALID_STATUSES,
  summarizeReadiness, recommendStaffing,
  createPursuit, updatePursuit, deletePursuit,
  listPursuits, getPursuit,
};
