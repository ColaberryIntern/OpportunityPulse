// Deep Research Phase 7 — Action Intelligence Dashboard aggregator.
//
// Read-only top-level read for /admin/deep-research/action-intelligence.
// Joins:
//   - top actionable clusters (by opportunity count + active status)
//   - strongest evidence-backed opportunities (highest aggregate traceability)
//   - proposal-acceleration candidates (top scored opps with relevant assets)
//   - recurring-agency ecosystems
//   - opportunity graph summary
//   - recent custom research runs
//   - pursuit readiness (open + in_progress pursuits)

const { Op } = require('sequelize');
const {
  StrategicCluster, Opportunity, OpportunityTraceability,
  CustomResearchRun, PursuitWorkspace,
} = require('../models');
const opportunityRelationships = require('./opportunityRelationships.service');
const opportunityGraph = require('./opportunityGraph.service');
const proposalAcceleration = require('./proposalAcceleration.service');

async function topActionableClusters({ limit = 6 } = {}) {
  const rows = await StrategicCluster.findAll({
    where: { isActive: true },
    order: [['opportunity_count', 'DESC']],
    limit: Math.min(20, Number(limit) || 6),
  });
  return rows.map((r) => r.toJSON());
}

async function strongestEvidenceOpportunities({ limit = 12 } = {}) {
  // Aggregate traceability rows by opportunity_id and rank by count + mean relevance.
  const rows = await OpportunityTraceability.findAll({ limit: 5000 });
  const byOpp = new Map();
  for (const r of rows) {
    if (!byOpp.has(r.opportunityId)) byOpp.set(r.opportunityId, { count: 0, totalRelevance: 0 });
    const b = byOpp.get(r.opportunityId);
    b.count += 1; b.totalRelevance += Number(r.relevance || 0);
  }
  const ranked = Array.from(byOpp.entries())
    .map(([opportunityId, b]) => ({
      opportunity_id: opportunityId,
      insight_count: b.count,
      mean_relevance: b.count > 0 ? Number((b.totalRelevance / b.count).toFixed(2)) : 0,
    }))
    .sort((a, b) => (b.insight_count * b.mean_relevance) - (a.insight_count * a.mean_relevance))
    .slice(0, Math.min(50, Number(limit) || 12));
  if (ranked.length === 0) return [];
  const opps = await Opportunity.findAll({
    where: { id: { [Op.in]: ranked.map((r) => r.opportunity_id) } },
  });
  const oppMap = new Map(opps.map((o) => [o.id, o.toJSON()]));
  return ranked.map((r) => ({
    ...r,
    opportunity: oppMap.get(r.opportunity_id) || null,
  })).filter((r) => r.opportunity);
}

async function proposalAccelerationCandidates({ limit = 10 } = {}) {
  // Score candidate opportunities by how many strong assets we can match.
  // Strategy: scan recent active opps, score against assets.
  const opps = await Opportunity.findAll({
    where: { status: 'active' }, order: [['ai_score', 'DESC']], limit: 80,
  });
  const out = [];
  for (const o of opps) {
    // eslint-disable-next-line no-await-in-loop
    const suggested = await proposalAcceleration.suggestForOpportunity(o.id);
    if (suggested.length >= 2) {
      out.push({
        opportunity: o.toJSON(),
        asset_count: suggested.length,
        top_assets: suggested.slice(0, 4).map((a) => ({
          id: a.id, kind: a.assetKind, label: a.label, score: a._suggest_score,
        })),
      });
    }
    if (out.length >= Math.min(20, Number(limit) || 10)) break;
  }
  return out;
}

async function recurringAgencyEcosystems({ limit = 10 } = {}) {
  return opportunityRelationships.listRecurring({ relationshipType: 'agency', limit });
}

async function recentResearchRuns({ limit = 6 } = {}) {
  const rows = await CustomResearchRun.findAll({
    order: [['pinned', 'DESC'], ['updated_at', 'DESC']],
    limit: Math.min(20, Number(limit) || 6),
  });
  return rows.map((r) => r.toJSON());
}

async function pursuitReadiness() {
  const rows = await PursuitWorkspace.findAll({
    where: { status: { [Op.in]: ['open', 'in_progress'] } },
    order: [['updated_at', 'DESC']], limit: 20,
  });
  return rows.map((r) => r.toJSON());
}

async function getActionIntelligence() {
  const [
    clusters, evidenceOpps, candidates, agencies, graph, runs, pursuits,
  ] = await Promise.all([
    topActionableClusters({ limit: 6 }),
    strongestEvidenceOpportunities({ limit: 12 }),
    proposalAccelerationCandidates({ limit: 10 }),
    recurringAgencyEcosystems({ limit: 10 }),
    opportunityGraph.getGraphSummary(),
    recentResearchRuns({ limit: 6 }),
    pursuitReadiness(),
  ]);
  return {
    generated_at: new Date().toISOString(),
    top_actionable_clusters: clusters,
    strongest_evidence_opportunities: evidenceOpps,
    proposal_acceleration_candidates: candidates,
    recurring_agency_ecosystems: agencies,
    opportunity_graph: graph,
    recent_research_runs: runs,
    pursuit_readiness: pursuits,
  };
}

module.exports = {
  topActionableClusters,
  strongestEvidenceOpportunities,
  proposalAccelerationCandidates,
  recurringAgencyEcosystems,
  recentResearchRuns,
  pursuitReadiness,
  getActionIntelligence,
};
