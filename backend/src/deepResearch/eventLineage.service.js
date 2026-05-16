// Deep Research Phase 11 — operational event lineage.
//
// Records directed edges between domain entities (research → cluster →
// pursuit → draft → package → submission → operator → approval, etc.) so
// the system can answer "where did this come from?" and "what did this
// produce?" with one query.
//
// Records are append-only. Each row is one edge. Forward + reverse
// traversal up to a bounded depth.

const { Op } = require('sequelize');
const { EventLineage } = require('../models');
const logger = require('../logging/logger');

const VALID_KINDS = [
  'research_run', 'report', 'cluster', 'pattern', 'venture',
  'recommendation', 'intervention', 'pursuit', 'opportunity',
  'draft', 'output', 'package', 'submission', 'approval',
  'worker_job', 'queue_entry', 'artifact', 'compliance_matrix',
  'compliance_item', 'sla_event', 'workflow_assignment',
  'audit_event', 'governance_event', 'operator',
];

const EDGE_KINDS = [
  'derived_from', 'generated', 'fed_into', 'evaluated_by',
  'approved_by', 'reviewed_by', 'attached_to', 'satisfied_by',
  'escalated_to', 'assigned_to', 'cancelled', 'rejected',
  'spawned', 'requires',
];

const MAX_DEPTH = 6;

// Record an edge. Soft-fails.
async function recordEdge({
  organizationId = null,
  fromKind, fromId, toKind, toId, edgeKind,
  pursuitId = null, metadata = {},
} = {}) {
  if (!fromKind || !fromId || !toKind || !toId || !edgeKind) {
    logger.warn('eventLineage.recordEdge: missing fields');
    return null;
  }
  try {
    return await EventLineage.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      fromKind: String(fromKind).slice(0, 64),
      fromId: String(fromId).slice(0, 128),
      toKind: String(toKind).slice(0, 64),
      toId: String(toId).slice(0, 128),
      edgeKind: String(edgeKind).slice(0, 64),
      pursuitId: pursuitId == null ? null : Number(pursuitId),
      metadata: metadata || {},
    });
  } catch (e) {
    logger.warn('eventLineage.recordEdge failed', { error: e.message });
    return null;
  }
}

// Direct downstream — one-hop edges originating from a node.
async function downstreamOf(kind, id, { organizationId = null, limit = 100 } = {}) {
  const where = { fromKind: kind, fromId: String(id) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await EventLineage.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function upstreamOf(kind, id, { organizationId = null, limit = 100 } = {}) {
  const where = { toKind: kind, toId: String(id) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await EventLineage.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

// Bounded BFS: build a chain (or partial graph) starting from a node.
async function chain(kind, id, { direction = 'downstream', maxDepth = 3, organizationId = null } = {}) {
  const depth = Math.min(MAX_DEPTH, Math.max(1, Number(maxDepth) || 3));
  const nodes = new Map();
  const edges = [];
  const seen = new Set();
  const queue = [{ kind, id: String(id), d: 0 }];
  const seedKey = `${kind}:${id}`;
  nodes.set(seedKey, { kind, id: String(id), depth: 0 });
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.d >= depth) continue;
    const key = `${cur.kind}:${cur.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // eslint-disable-next-line no-await-in-loop
    const next = direction === 'upstream'
      ? await upstreamOf(cur.kind, cur.id, { organizationId })
      : await downstreamOf(cur.kind, cur.id, { organizationId });
    for (const e of next) {
      edges.push(e);
      const ck = direction === 'upstream'
        ? `${e.fromKind}:${e.fromId}` : `${e.toKind}:${e.toId}`;
      if (!nodes.has(ck)) {
        nodes.set(ck, direction === 'upstream'
          ? { kind: e.fromKind, id: e.fromId, depth: cur.d + 1 }
          : { kind: e.toKind, id: e.toId, depth: cur.d + 1 });
        queue.push({
          kind: direction === 'upstream' ? e.fromKind : e.toKind,
          id: direction === 'upstream' ? e.fromId : e.toId,
          d: cur.d + 1,
        });
      }
    }
  }
  return {
    seed: { kind, id: String(id) },
    direction, depth, organization_id: organizationId,
    nodes: Array.from(nodes.values()),
    edges,
  };
}

// One-call view: combine both directions for a UI "full lineage" view.
async function fullLineage(kind, id, { organizationId = null, maxDepth = 3 } = {}) {
  const [down, up] = await Promise.all([
    chain(kind, id, { direction: 'downstream', maxDepth, organizationId }),
    chain(kind, id, { direction: 'upstream', maxDepth, organizationId }),
  ]);
  return {
    seed: { kind, id: String(id) },
    organization_id: organizationId,
    downstream: { nodes: down.nodes, edges: down.edges },
    upstream: { nodes: up.nodes, edges: up.edges },
  };
}

async function pursuitLineage(pursuitId, { organizationId = null } = {}) {
  const where = { pursuitId: Number(pursuitId) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await EventLineage.findAll({
    where, order: [['created_at', 'ASC']], limit: 500,
  });
  return rows.map((r) => r.toJSON());
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await EventLineage.count({ where });
  const recent = await EventLineage.count({
    where: { ...where, createdAt: { [Op.gt]: new Date(Date.now() - 86400_000) } },
  });
  return { total_edges: total, edges_last_24h: recent };
}

module.exports = {
  VALID_KINDS, EDGE_KINDS, MAX_DEPTH,
  recordEdge, downstreamOf, upstreamOf,
  chain, fullLineage, pursuitLineage, summarize,
};
