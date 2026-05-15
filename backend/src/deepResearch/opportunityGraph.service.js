// Deep Research Phase 7 — opportunity graph.
//
// Builds a navigable graph: opportunities, agencies, technologies, vendors,
// NAICS codes, ecosystems, ventures. Edges link them via the recurring-
// relationship aggregation produced by opportunityRelationships.service. The
// graph is deterministic + explainable.
//
// Persisted in opportunity_graph_edges (idempotent rewrite per refresh).

const { Op } = require('sequelize');
const {
  Opportunity, OpportunityGraphEdge, OpportunityRelationship,
  VentureIdea, DeepResearchReport, OpportunityClassification, StrategicCluster,
} = require('../models');
const relationships = require('./opportunityRelationships.service');

// Build the edge list from the persisted relationship aggregate. Each
// recurring (agency / vendor / tech / naics / keyword) becomes (N-1) edges
// from the entity to its supporting opportunities, capped per entity for
// graph readability.
function buildEntityEdges(relationshipRows, { capPerEntity = 12 } = {}) {
  const edges = [];
  for (const r of relationshipRows) {
    const opps = (r.opportunityIds || r.opportunity_ids || []).slice(0, capPerEntity);
    for (const oppId of opps) {
      edges.push({
        fromKind: r.relationshipType || r.relationship_type,
        fromValue: r.value,
        toKind: 'opportunity',
        toValue: String(oppId),
        edgeType: 'mentions',
        weight: Math.min(100, Number(r.occurrenceCount || r.occurrence_count || 1)),
        metadata: { occurrence_count: Number(r.occurrenceCount || r.occurrence_count || 1) },
      });
    }
  }
  return edges;
}

// Build venture↔opportunity edges from the source reports.
async function buildVentureEdges() {
  const ventures = await VentureIdea.findAll();
  const reportIds = [...new Set(ventures.map((v) => v.reportId).filter(Boolean))];
  if (reportIds.length === 0) return [];
  const reports = await DeepResearchReport.findAll({ where: { id: { [Op.in]: reportIds } } });
  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const edges = [];
  for (const v of ventures) {
    const report = reportMap.get(v.reportId);
    if (!report) continue;
    const rj = report.reportJson || {};
    const ids = Array.isArray(rj.opportunity_ids) ? rj.opportunity_ids
      : (Array.isArray(rj.opportunityIds) ? rj.opportunityIds : []);
    for (const oppId of ids.slice(0, 40)) {
      edges.push({
        fromKind: 'venture',
        fromValue: String(v.id),
        toKind: 'opportunity',
        toValue: String(oppId),
        edgeType: 'shares_ecosystem',
        weight: 60,
        metadata: { source: 'report', report_id: report.id },
      });
    }
  }
  return edges;
}

// Build cluster↔opportunity edges via the persisted classifications.
async function buildClusterEdges() {
  const rows = await OpportunityClassification.findAll({
    where: { clusterId: { [Op.ne]: null } }, limit: 5000,
  });
  return rows.map((c) => ({
    fromKind: 'cluster',
    fromValue: String(c.clusterId),
    toKind: 'opportunity',
    toValue: String(c.opportunityId),
    edgeType: 'classified_as',
    weight: Math.max(1, Number(c.domainConfidence || 50)),
    metadata: { domain_confidence: Number(c.domainConfidence || 0) },
  }));
}

async function refreshGraph() {
  const relRows = await OpportunityRelationship.findAll();
  const relJson = relRows.map((r) => r.toJSON());
  const entityEdges = buildEntityEdges(relJson, { capPerEntity: 12 });
  const ventureEdges = await buildVentureEdges();
  const clusterEdges = await buildClusterEdges();
  const all = [...entityEdges, ...ventureEdges, ...clusterEdges];
  await OpportunityGraphEdge.destroy({ where: {} });
  for (const e of all) {
    // eslint-disable-next-line no-await-in-loop
    await OpportunityGraphEdge.create(e);
  }
  return {
    edges_total: all.length,
    by_kind: {
      entity_to_opportunity: entityEdges.length,
      venture_to_opportunity: ventureEdges.length,
      cluster_to_opportunity: clusterEdges.length,
    },
  };
}

// Read the graph centered on a single node. Returns nodes + edges in a
// shape the UI can render without doing more joins.
async function getNeighborhood({ kind, value, depth = 1, maxEdges = 100 } = {}) {
  if (!kind || !value) return { center: null, nodes: [], edges: [] };
  const seen = new Set();
  const nodes = [{ kind, value }];
  const edges = [];
  const frontier = [{ kind, value }];
  for (let d = 0; d < Math.min(2, Math.max(1, Number(depth))); d += 1) {
    const next = [];
    for (const node of frontier) {
      const key = `${node.kind}:${node.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // eslint-disable-next-line no-await-in-loop
      const out = await OpportunityGraphEdge.findAll({
        where: {
          [Op.or]: [
            { fromKind: node.kind, fromValue: node.value },
            { toKind: node.kind, toValue: node.value },
          ],
        },
        order: [['weight', 'DESC']],
        limit: Math.min(500, maxEdges),
      });
      for (const e of out) {
        edges.push(e.toJSON());
        const other = (e.fromKind === node.kind && e.fromValue === node.value)
          ? { kind: e.toKind, value: e.toValue }
          : { kind: e.fromKind, value: e.fromValue };
        if (!seen.has(`${other.kind}:${other.value}`)) {
          nodes.push(other);
          next.push(other);
        }
      }
    }
    if (next.length === 0) break;
    frontier.length = 0; frontier.push(...next);
  }
  // Hydrate opportunity nodes with their titles for nicer UI display.
  const oppIds = nodes
    .filter((n) => n.kind === 'opportunity')
    .map((n) => Number(n.value))
    .filter((n) => Number.isInteger(n));
  let opps = [];
  if (oppIds.length > 0) {
    opps = (await Opportunity.findAll({
      where: { id: { [Op.in]: oppIds } },
      attributes: ['id', 'title', 'type', 'source', 'aiScore', 'value', 'publishedAt'],
    })).map((o) => o.toJSON());
  }
  const oppMap = new Map(opps.map((o) => [String(o.id), o]));
  const hydrated = nodes.map((n) => {
    if (n.kind === 'opportunity' && oppMap.has(n.value)) {
      const o = oppMap.get(n.value);
      return { ...n, label: o.title, opportunity: o };
    }
    return { ...n, label: n.value };
  });
  // Dedupe edges by (from,to,type) for a clean rendering.
  const edgeKeySeen = new Set();
  const dedupedEdges = [];
  for (const e of edges) {
    const k = `${e.fromKind}:${e.fromValue}→${e.toKind}:${e.toValue}:${e.edgeType}`;
    if (edgeKeySeen.has(k)) continue;
    edgeKeySeen.add(k);
    dedupedEdges.push(e);
  }
  return { center: { kind, value }, nodes: hydrated, edges: dedupedEdges };
}

async function getGraphSummary() {
  const edges = await OpportunityGraphEdge.findAll();
  const byEdgeType = {};
  const byFromKind = {};
  for (const e of edges) {
    byEdgeType[e.edgeType] = (byEdgeType[e.edgeType] || 0) + 1;
    byFromKind[e.fromKind] = (byFromKind[e.fromKind] || 0) + 1;
  }
  return { total_edges: edges.length, by_edge_type: byEdgeType, by_from_kind: byFromKind };
}

module.exports = {
  buildEntityEdges, buildVentureEdges, buildClusterEdges,
  refreshGraph, getNeighborhood, getGraphSummary,
};
