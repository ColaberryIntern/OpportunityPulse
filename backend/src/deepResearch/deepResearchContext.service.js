// Deep Research Phase 7.5 — strategic context resolver.
//
// Bridges Deep Research (the strategic intelligence overlay) and
// My Opportunities (the operational execution surface). Given a context
// kind + id, returns:
//   - the underlying opportunity ids
//   - a strategic summary for the banner (title, channel breakdown,
//     disclosed value, classification, pursuit linkage)
//   - linkage metadata for the traceability panel
//
// DETERMINISTIC + EXPLAINABLE. No new opportunity storage — reuses Phase 7
// traceability + existing Phase 1-6 relationships.
//
// Context kinds:
//   deepResearch    — DeepResearchReport.id (synonym: deepResearchId)
//   cluster         — StrategicCluster.id
//   pattern         — VentureTemplate.id   (a.k.a. strategic pattern)
//   venture         — VentureIdea.id
//   recommendation  — StrategicRecommendation.id
//   intervention    — InterventionRecommendation.id
//   pursuit         — PursuitWorkspace.id
//   researchRun     — CustomResearchRun.id
//   agency          — recurring agency value (string)
//   technology      — recurring technology keyword (string)

const { Op } = require('sequelize');
const {
  Opportunity, OpportunityClassification, OpportunityRelationship,
  DeepResearchReport, StrategicCluster, VentureTemplate, VentureIdea,
  StrategicRecommendation, InterventionRecommendation,
  PursuitWorkspace, CustomResearchRun,
} = require('../models');
const opportunityTraceability = require('./opportunityTraceability.service');

const VALID_KINDS = [
  'deepResearch', 'cluster', 'pattern', 'venture',
  'recommendation', 'intervention', 'pursuit', 'researchRun',
  'agency', 'technology',
];

// Bucket the resolved opportunity ids by Opportunity.type so the banner can
// display "Showing N gov_contract / M bonfire / K ai_job".
async function summarizeChannels(opportunityIds) {
  if (!Array.isArray(opportunityIds) || opportunityIds.length === 0) {
    return { total: 0, by_type: {}, disclosed_value: 0 };
  }
  const opps = await Opportunity.findAll({
    where: { id: { [Op.in]: opportunityIds.map(Number).filter(Number.isInteger) } },
    attributes: ['id', 'type', 'value'],
  });
  const byType = {};
  let disclosedValue = 0;
  for (const o of opps) {
    const k = o.type || 'unknown';
    byType[k] = (byType[k] || 0) + 1;
    if (o.value != null) disclosedValue += Number(o.value);
  }
  return { total: opps.length, by_type: byType, disclosed_value: disclosedValue };
}

// ---- per-kind resolvers ---------------------------------------------------

async function resolveDeepResearch(id) {
  const report = await DeepResearchReport.findByPk(id);
  if (!report) return null;
  const rj = report.reportJson || {};
  const ids = Array.isArray(rj.opportunity_ids) ? rj.opportunity_ids
    : (Array.isArray(rj.opportunityIds) ? rj.opportunityIds : []);
  return {
    kind: 'deepResearch',
    id: Number(id),
    title: report.searchTerm,
    description: report.executiveSummary || null,
    classification: report.marketStage || null,
    return_to: { label: 'Return to Research', href: `/admin/deep-research/${report.id}` },
    opportunity_ids: ids.map(Number).filter(Number.isInteger),
  };
}

async function resolveCluster(id) {
  const cluster = await StrategicCluster.findByPk(id);
  if (!cluster) return null;
  const classifications = await OpportunityClassification.findAll({
    where: { clusterId: id }, attributes: ['opportunityId'], limit: 500,
  });
  return {
    kind: 'cluster',
    id: Number(id),
    title: cluster.name,
    description: cluster.description || null,
    classification: cluster.slug || null,
    return_to: { label: 'Return to Cluster', href: `/admin/deep-research/clusters/${cluster.id}` },
    opportunity_ids: classifications.map((c) => c.opportunityId),
  };
}

async function resolvePattern(id) {
  const tmpl = await VentureTemplate.findByPk(id);
  if (!tmpl) return null;
  const links = await opportunityTraceability.resolveForPattern(id);
  return {
    kind: 'pattern',
    id: Number(id),
    title: tmpl.label || tmpl.templateKey,
    description: tmpl.description || null,
    classification: tmpl.templateKey,
    return_to: { label: 'Return to Portfolio', href: '/admin/deep-research/portfolio' },
    opportunity_ids: links.map((l) => l.opportunityId),
  };
}

async function resolveVenture(id) {
  const venture = await VentureIdea.findByPk(id);
  if (!venture) return null;
  const links = await opportunityTraceability.resolveForVenture(id);
  return {
    kind: 'venture',
    id: Number(id),
    title: venture.title,
    description: venture.description || null,
    classification: venture.lifecycleState || null,
    return_to: { label: 'Return to Venture', href: `/admin/deep-research/${venture.reportId}` },
    opportunity_ids: links.map((l) => l.opportunityId),
  };
}

async function resolveRecommendation(id) {
  const rec = await StrategicRecommendation.findByPk(id);
  if (!rec) return null;
  const links = await opportunityTraceability.resolveForStrategicRecommendation(id);
  return {
    kind: 'recommendation',
    id: Number(id),
    title: rec.title,
    description: rec.rationale || null,
    classification: rec.recommendationType,
    return_to: { label: 'Return to Planning', href: '/admin/deep-research/planning' },
    opportunity_ids: links.map((l) => l.opportunityId),
  };
}

async function resolveIntervention(id) {
  const rec = await InterventionRecommendation.findByPk(id);
  if (!rec) return null;
  const links = await opportunityTraceability.resolveForIntervention(id);
  return {
    kind: 'intervention',
    id: Number(id),
    title: rec.title,
    description: rec.rationale || null,
    classification: rec.interventionType,
    return_to: { label: 'Return to Planning', href: '/admin/deep-research/planning' },
    opportunity_ids: links.map((l) => l.opportunityId),
  };
}

async function resolvePursuit(id) {
  const p = await PursuitWorkspace.findByPk(id);
  if (!p) return null;
  return {
    kind: 'pursuit',
    id: Number(id),
    title: p.name,
    description: p.summary || null,
    classification: p.status,
    return_to: { label: 'Return to Pursuit', href: `/admin/deep-research/pursuits/${p.id}` },
    opportunity_ids: Array.isArray(p.linkedOpportunityIds) ? p.linkedOpportunityIds : [],
  };
}

async function resolveResearchRun(id) {
  const run = await CustomResearchRun.findByPk(id);
  if (!run) return null;
  const results = Array.isArray(run.lastResults) ? run.lastResults : [];
  return {
    kind: 'researchRun',
    id: Number(id),
    title: run.name,
    description: `Query: ${run.query}`,
    classification: 'custom_search',
    return_to: { label: 'Return to Research Runs', href: '/admin/deep-research/research-runs' },
    opportunity_ids: results.map((r) => Number(r.id)).filter(Number.isInteger),
  };
}

async function resolveAgency(value) {
  const row = await OpportunityRelationship.findOne({
    where: { relationshipType: 'agency', value: String(value) },
  });
  return {
    kind: 'agency',
    id: row ? row.id : null,
    title: String(value),
    description: 'Recurring agency across the opportunity corpus.',
    classification: 'recurring_agency',
    return_to: { label: 'Return to Action Intelligence', href: '/admin/deep-research/action-intelligence' },
    opportunity_ids: row && Array.isArray(row.opportunityIds) ? row.opportunityIds : [],
  };
}

async function resolveTechnology(value) {
  const row = await OpportunityRelationship.findOne({
    where: { relationshipType: 'technology', value: String(value) },
  });
  return {
    kind: 'technology',
    id: row ? row.id : null,
    title: String(value),
    description: 'Recurring technology theme across the opportunity corpus.',
    classification: 'recurring_technology',
    return_to: { label: 'Return to Action Intelligence', href: '/admin/deep-research/action-intelligence' },
    opportunity_ids: row && Array.isArray(row.opportunityIds) ? row.opportunityIds : [],
  };
}

// ---- public API -----------------------------------------------------------

// Parse a request's query params and return the first present context kind.
// Used by the My Opportunities controller to wire context into the existing
// list flow without breaking the no-context default.
function pickContextFromQuery(query = {}) {
  const map = {
    deepResearchId: 'deepResearch',
    clusterId: 'cluster',
    strategicPatternId: 'pattern',
    patternId: 'pattern',
    ventureId: 'venture',
    recommendationId: 'recommendation',
    interventionId: 'intervention',
    pursuitId: 'pursuit',
    researchRunId: 'researchRun',
    agencyValue: 'agency',
    technologyValue: 'technology',
  };
  for (const [param, kind] of Object.entries(map)) {
    if (query[param] != null && String(query[param]).length > 0) {
      return { kind, id: query[param] };
    }
  }
  return null;
}

async function resolveContext(kind, id) {
  if (!VALID_KINDS.includes(kind)) {
    const err = new Error(`Invalid context kind ${kind}`); err.code = 'BAD_INPUT'; throw err;
  }
  switch (kind) {
    case 'deepResearch': return resolveDeepResearch(id);
    case 'cluster': return resolveCluster(id);
    case 'pattern': return resolvePattern(id);
    case 'venture': return resolveVenture(id);
    case 'recommendation': return resolveRecommendation(id);
    case 'intervention': return resolveIntervention(id);
    case 'pursuit': return resolvePursuit(id);
    case 'researchRun': return resolveResearchRun(id);
    case 'agency': return resolveAgency(id);
    case 'technology': return resolveTechnology(id);
    default: return null;
  }
}

// Full context payload: resolver output + channel summary + pursuit link
// candidates. Used by both the banner read and the My Opportunities filter.
async function getContextSummary(kind, id) {
  const ctx = await resolveContext(kind, id);
  if (!ctx) return null;
  const summary = await summarizeChannels(ctx.opportunity_ids);
  // Linked pursuits for the banner's "Open Pursuit Workspace" CTA.
  const pursuits = await PursuitWorkspace.findAll({
    where: { anchorKind: ctx.kind, anchorId: ctx.id }, attributes: ['id', 'name', 'status'],
  });
  return {
    ...ctx,
    channel_summary: summary,
    linked_pursuits: pursuits.map((p) => p.toJSON()),
  };
}

// Returns the opportunity-id set for use as an additive filter in
// myOpportunities.listMyOpportunities. Empty array means "no opportunities
// match this context" — callers should short-circuit to an empty list.
async function resolveOpportunityIds(kind, id) {
  const ctx = await resolveContext(kind, id);
  if (!ctx) return null;
  return ctx.opportunity_ids;
}

// Per-opportunity traceability — given an opp + the active context, return
// the WHY rows for the traceability panel. Re-uses Phase 7 traceability.
async function getOpportunityTraceWithinContext(opportunityId, kind, id) {
  const oppId = Number(opportunityId);
  if (!Number.isInteger(oppId)) return [];
  const insights = await opportunityTraceability.getInsightsForOpportunity(oppId, { limit: 100 });
  // Surface the active-context insight first (if it's been persisted).
  const insightKind = kind === 'deepResearch' ? 'venture' : kind;
  const matches = insights.filter((r) => r.insightKind === insightKind && Number(r.insightId) === Number(id));
  const others = insights.filter((r) => !(r.insightKind === insightKind && Number(r.insightId) === Number(id)));
  return [...matches, ...others];
}

module.exports = {
  VALID_KINDS,
  pickContextFromQuery,
  summarizeChannels,
  resolveDeepResearch, resolveCluster, resolvePattern, resolveVenture,
  resolveRecommendation, resolveIntervention, resolvePursuit, resolveResearchRun,
  resolveAgency, resolveTechnology,
  resolveContext, resolveOpportunityIds, getContextSummary,
  getOpportunityTraceWithinContext,
};
