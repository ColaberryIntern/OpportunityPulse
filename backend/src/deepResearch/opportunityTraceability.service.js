// Deep Research Phase 7 — opportunity traceability engine.
//
// For every insight (a venture / cluster / pattern / recommendation / etc.)
// the platform must be able to answer "WHICH opportunities support this?".
// This service maps insights → underlying Opportunity rows with a relevance
// score and a typed contribution channel so the trail is auditable.
//
// MEASURE-ONLY. Does not mutate anything outside opportunity_traceability.
//
// Insight kinds supported in v1:
//   venture        — links to opps from the source DeepResearchReport.reportJson
//   cluster        — links via OpportunityClassification.cluster_id
//   recommendation — links via supportingMetrics.related_venture_ids → reports
//   intervention   — same as recommendation
//   research_run   — links to the snapshot results stored on the run row
//   pursuit        — links via PursuitWorkspace.linkedOpportunityIds
//   pattern        — links via VentureTemplate.applicableTo → ventures → reports

const { Op } = require('sequelize');
const {
  Opportunity, OpportunityClassification, OpportunityTraceability,
  VentureIdea, DeepResearchReport, InterventionRecommendation,
  StrategicRecommendation, CustomResearchRun, PursuitWorkspace,
  StrategicCluster, VentureTemplate,
} = require('../models');

const VALID_KINDS = [
  'venture', 'cluster', 'recommendation', 'intervention', 'research_run',
  'pursuit', 'pattern', 'ecosystem',
];

// Resolve the list of supporting opportunity ids for an insight, including
// the contribution channel + reasoning so we can persist a traceability row
// per link.
async function resolveSupportingOpportunities(insightKind, insightId) {
  switch (insightKind) {
    case 'venture': return resolveForVenture(insightId);
    case 'cluster': return resolveForCluster(insightId);
    case 'recommendation': return resolveForStrategicRecommendation(insightId);
    case 'intervention': return resolveForIntervention(insightId);
    case 'research_run': return resolveForResearchRun(insightId);
    case 'pursuit': return resolveForPursuit(insightId);
    case 'pattern': return resolveForPattern(insightId);
    default: return [];
  }
}

async function resolveForVenture(ventureIdeaId) {
  const venture = await VentureIdea.findByPk(ventureIdeaId);
  if (!venture) return [];
  const report = await DeepResearchReport.findByPk(venture.reportId);
  if (!report) return [];
  const rj = report.reportJson || {};
  const ids = Array.isArray(rj.opportunity_ids) ? rj.opportunity_ids
    : (Array.isArray(rj.opportunityIds) ? rj.opportunityIds : []);
  return ids.slice(0, 200).map((id) => ({
    opportunityId: Number(id),
    relevance: 70,
    contribution: 'report_source',
    reasoning: `Sourced from deep research report "${report.searchTerm}" that produced this venture.`,
  }));
}

async function resolveForCluster(clusterId) {
  const classifications = await OpportunityClassification.findAll({
    where: { clusterId }, limit: 200,
  });
  return classifications.map((c) => ({
    opportunityId: c.opportunityId,
    relevance: Math.max(0, Math.min(100,
      Number(c.demandScore || 0) || Number(c.domainConfidence || 0) || 60)),
    contribution: 'cluster_classification',
    reasoning: 'Opportunity classified into this cluster by the deterministic clustering engine.',
  }));
}

async function resolveForStrategicRecommendation(id) {
  const row = await StrategicRecommendation.findByPk(id);
  if (!row) return [];
  return resolveForRecommendationLike(row, 'strategic');
}
async function resolveForIntervention(id) {
  const row = await InterventionRecommendation.findByPk(id);
  if (!row) return [];
  return resolveForRecommendationLike(row, 'intervention');
}
async function resolveForRecommendationLike(row, kind) {
  const ventureIds = Array.isArray(row.relatedVentureIds) ? row.relatedVentureIds : [];
  if (ventureIds.length === 0) return [];
  const ventures = await VentureIdea.findAll({ where: { id: { [Op.in]: ventureIds } } });
  const reportIds = [...new Set(ventures.map((v) => v.reportId).filter(Boolean))];
  if (reportIds.length === 0) return [];
  const reports = await DeepResearchReport.findAll({ where: { id: { [Op.in]: reportIds } } });
  const oppIds = new Set();
  for (const r of reports) {
    const rj = r.reportJson || {};
    const ids = Array.isArray(rj.opportunity_ids) ? rj.opportunity_ids
      : (Array.isArray(rj.opportunityIds) ? rj.opportunityIds : []);
    for (const id of ids) oppIds.add(Number(id));
  }
  return Array.from(oppIds).slice(0, 200).map((id) => ({
    opportunityId: Number(id),
    relevance: 55,
    contribution: 'pattern_match',
    reasoning: `${kind === 'strategic' ? 'Strategic' : 'Intervention'} recommendation references `
      + `${ventureIds.length} venture${ventureIds.length === 1 ? '' : 's'}; this opportunity is in `
      + 'the source report for at least one of those ventures.',
  }));
}

async function resolveForResearchRun(runId) {
  const run = await CustomResearchRun.findByPk(runId);
  if (!run) return [];
  const results = Array.isArray(run.lastResults) ? run.lastResults : [];
  return results.slice(0, 200).map((r) => ({
    opportunityId: Number(r.id),
    relevance: Math.max(0, Math.min(100, Number(r.relevance || r.score || 50))),
    contribution: 'direct_link',
    reasoning: `Matched custom research run "${run.name}" on query "${run.query}".`,
  }));
}

async function resolveForPursuit(pursuitId) {
  const p = await PursuitWorkspace.findByPk(pursuitId);
  if (!p) return [];
  const ids = Array.isArray(p.linkedOpportunityIds) ? p.linkedOpportunityIds : [];
  return ids.map((id) => ({
    opportunityId: Number(id),
    relevance: 80,
    contribution: 'manual',
    reasoning: `Explicitly added to pursuit workspace "${p.name}".`,
  }));
}

async function resolveForPattern(templateId) {
  const tmpl = await VentureTemplate.findByPk(templateId);
  if (!tmpl) return [];
  const applicableTo = Array.isArray(tmpl.applicableTo) ? tmpl.applicableTo : [];
  if (applicableTo.length === 0) return [];
  const ventures = await VentureIdea.findAll({ where: { id: { [Op.in]: applicableTo } } });
  const reportIds = [...new Set(ventures.map((v) => v.reportId).filter(Boolean))];
  const reports = reportIds.length
    ? await DeepResearchReport.findAll({ where: { id: { [Op.in]: reportIds } } }) : [];
  const oppIds = new Set();
  for (const r of reports) {
    const rj = r.reportJson || {};
    const ids = Array.isArray(rj.opportunity_ids) ? rj.opportunity_ids
      : (Array.isArray(rj.opportunityIds) ? rj.opportunityIds : []);
    for (const id of ids) oppIds.add(Number(id));
  }
  return Array.from(oppIds).slice(0, 200).map((id) => ({
    opportunityId: Number(id),
    relevance: 50,
    contribution: 'pattern_match',
    reasoning: `Underpins venture template "${tmpl.label || tmpl.templateKey}".`,
  }));
}

// Persist a fresh set of traceability rows for an insight (idempotent: clears
// existing rows for the same insight before writing new ones).
async function rebuildTraceability(insightKind, insightId) {
  if (!VALID_KINDS.includes(insightKind)) {
    const err = new Error(`Invalid insight kind: ${insightKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  const links = await resolveSupportingOpportunities(insightKind, insightId);
  await OpportunityTraceability.destroy({ where: { insightKind, insightId } });
  const persisted = [];
  for (const link of links) {
    if (!link.opportunityId || !Number.isInteger(link.opportunityId)) continue;
    // eslint-disable-next-line no-await-in-loop
    const row = await OpportunityTraceability.create({
      insightKind, insightId,
      opportunityId: link.opportunityId,
      relevance: link.relevance,
      contribution: link.contribution,
      reasoning: link.reasoning,
      metadata: link.metadata || {},
    });
    persisted.push(row.toJSON());
  }
  return { insight_kind: insightKind, insight_id: insightId, links_persisted: persisted.length };
}

// Read API — return the supporting opportunities for an insight, joined to
// the Opportunity row so the UI can render contracts/jobs/etc directly.
async function getSupportingOpportunities(insightKind, insightId, { limit = 50 } = {}) {
  const rows = await OpportunityTraceability.findAll({
    where: { insightKind, insightId },
    order: [['relevance', 'DESC']],
    limit: Math.min(200, Number(limit) || 50),
  });
  if (rows.length === 0) {
    // No persisted rows — derive once on the fly so the UI always works.
    const links = await resolveSupportingOpportunities(insightKind, insightId);
    if (links.length === 0) {
      return { insight_kind: insightKind, insight_id: insightId, count: 0, opportunities: [] };
    }
    const oppIds = links.map((l) => l.opportunityId).filter(Boolean);
    const opps = await Opportunity.findAll({ where: { id: { [Op.in]: oppIds } } });
    const byId = new Map(opps.map((o) => [o.id, o.toJSON()]));
    const merged = links.map((l) => ({
      ...byId.get(l.opportunityId),
      _trace: {
        relevance: l.relevance,
        contribution: l.contribution,
        reasoning: l.reasoning,
      },
    })).filter((x) => x.id);
    return {
      insight_kind: insightKind, insight_id: insightId,
      count: merged.length, opportunities: merged, persisted: false,
    };
  }
  const oppIds = rows.map((r) => r.opportunityId);
  const opps = await Opportunity.findAll({ where: { id: { [Op.in]: oppIds } } });
  const byId = new Map(opps.map((o) => [o.id, o.toJSON()]));
  const merged = rows.map((r) => {
    const opp = byId.get(r.opportunityId);
    if (!opp) return null;
    return {
      ...opp,
      _trace: {
        relevance: Number(r.relevance),
        contribution: r.contribution,
        reasoning: r.reasoning,
      },
    };
  }).filter(Boolean);
  return {
    insight_kind: insightKind, insight_id: insightId,
    count: merged.length, opportunities: merged, persisted: true,
  };
}

// Reverse lookup — given an opportunity id, which insights link to it?
async function getInsightsForOpportunity(opportunityId, { limit = 100 } = {}) {
  const rows = await OpportunityTraceability.findAll({
    where: { opportunityId: Number(opportunityId) },
    order: [['relevance', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

// Group helper for the evidence explorer drawer — bins opportunities by type.
function groupByChannel(opportunities) {
  const groups = {};
  for (const o of opportunities) {
    const key = o.type || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  }
  return groups;
}

module.exports = {
  VALID_KINDS,
  resolveSupportingOpportunities,
  resolveForVenture, resolveForCluster, resolveForStrategicRecommendation,
  resolveForIntervention, resolveForResearchRun, resolveForPursuit, resolveForPattern,
  rebuildTraceability,
  getSupportingOpportunities,
  getInsightsForOpportunity,
  groupByChannel,
};
