// Deep Research Phase 13 — full operational lineage graph.
//
// Builds a directed-edge graph between domain entities by reading from
// the Phase 11 event_lineage table + the Phase 13 cross_provenance table
// + the Phase 12 prompt_provenance table + the Phase 7 graph signals.
// Supports bounded BFS traversal in both directions + lineage extraction
// for proposal ancestry.
//
// READ-ONLY synthesis layer. Writes happen via crossProvenance.service
// (intent + provenance) or eventLineage.service (low-level edges).

const { Op } = require('sequelize');
const {
  OperationalLineage, EventLineage, CrossProvenance,
  PromptProvenance, OpportunityOutput, PursuitWorkspace,
} = require('../models');
const logger = require('../logging/logger');

const MAX_DEPTH = 6;
const MAX_NODES = 250;

const VALID_NODE_KINDS = [
  'research_run', 'opportunity', 'cluster', 'pattern',
  'pursuit', 'proposal_draft', 'opportunity_output', 'review_action',
  'submission_package', 'governance_approval', 'operator', 'artifact',
  'compliance_gap', 'compliance_matrix', 'compliance_item',
  'worker_job', 'sla_event', 'workflow_assignment',
  'cross_provenance', 'prompt_provenance',
];

const VALID_RELATIONS = [
  'derives_from', 'generated', 'fed_into', 'evaluated_by',
  'approved_by', 'reviewed_by', 'attached_to', 'satisfied_by',
  'escalated_to', 'assigned_to', 'cancelled', 'rejected',
  'spawned', 'requires', 'augmented_by',
];

// Append a denormalized lineage edge. Idempotent on the (from, to, relation)
// triple via an upsert pattern.
async function recordEdge({
  organizationId = null,
  fromKind, fromId, toKind, toId, relation,
  pursuitId = null, weight = 1, metadata = {},
} = {}) {
  if (!fromKind || !fromId || !toKind || !toId || !relation) {
    logger.warn('operationalLineage.recordEdge: missing fields');
    return null;
  }
  try {
    const existing = await OperationalLineage.findOne({
      where: {
        fromKind, fromId: String(fromId),
        toKind, toId: String(toId), relation,
      },
    });
    if (existing) {
      existing.weight = Math.min(1000, (existing.weight || 1) + (Number(weight) || 1));
      await existing.save();
      return existing.toJSON();
    }
    const row = await OperationalLineage.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      fromKind, fromId: String(fromId),
      toKind, toId: String(toId),
      relation, pursuitId: pursuitId == null ? null : Number(pursuitId),
      weight: Number(weight) || 1,
      metadata: metadata || {},
    });
    return row.toJSON();
  } catch (e) {
    logger.warn('operationalLineage.recordEdge failed', { error: e.message });
    return null;
  }
}

async function downstreamOf(kind, id, { organizationId = null, limit = 100 } = {}) {
  const where = { fromKind: kind, fromId: String(id) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await OperationalLineage.findAll({
    where, order: [['weight', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function upstreamOf(kind, id, { organizationId = null, limit = 100 } = {}) {
  const where = { toKind: kind, toId: String(id) };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await OperationalLineage.findAll({
    where, order: [['weight', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

// Bounded BFS in one direction.
async function traverse(kind, id, {
  direction = 'downstream', maxDepth = 3, organizationId = null,
} = {}) {
  const depth = Math.min(MAX_DEPTH, Math.max(1, Number(maxDepth) || 3));
  const nodes = new Map();
  const edges = [];
  const seen = new Set();
  const queue = [{ kind, id: String(id), d: 0 }];
  nodes.set(`${kind}:${id}`, { kind, id: String(id), depth: 0 });
  while (queue.length > 0 && nodes.size < MAX_NODES) {
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
      const isDown = direction === 'downstream';
      const ck = isDown ? `${e.toKind}:${e.toId}` : `${e.fromKind}:${e.fromId}`;
      if (!nodes.has(ck) && nodes.size < MAX_NODES) {
        nodes.set(ck, isDown
          ? { kind: e.toKind, id: e.toId, depth: cur.d + 1 }
          : { kind: e.fromKind, id: e.fromId, depth: cur.d + 1 });
        queue.push({
          kind: isDown ? e.toKind : e.fromKind,
          id: isDown ? e.toId : e.fromId,
          d: cur.d + 1,
        });
      }
    }
  }
  return {
    seed: { kind, id: String(id) },
    direction, depth, organization_id: organizationId,
    nodes: Array.from(nodes.values()), edges,
  };
}

// Combined upstream + downstream view.
async function fullLineage(kind, id, { organizationId = null, maxDepth = 3 } = {}) {
  const [down, up] = await Promise.all([
    traverse(kind, id, { direction: 'downstream', maxDepth, organizationId }),
    traverse(kind, id, { direction: 'upstream', maxDepth, organizationId }),
  ]);
  return {
    seed: { kind, id: String(id) },
    organization_id: organizationId,
    downstream: { nodes: down.nodes, edges: down.edges },
    upstream: { nodes: up.nodes, edges: up.edges },
  };
}

// Build proposal ancestry — for one OpportunityOutput row, walk back to
// pursuit + capture + research lineage. Reads from PromptProvenance +
// CrossProvenance + OperationalLineage. Returns a flat list ordered by
// "closeness to the output".
async function proposalAncestry(outputId, { organizationId = null } = {}) {
  const out = [];
  try {
    const output = await OpportunityOutput.findByPk(Number(outputId));
    if (!output) return { output_id: Number(outputId), ancestry: [] };
    out.push({ kind: 'opportunity_output', id: String(output.id), label: output.type });

    if (output.promptProvenanceId) {
      const prov = await PromptProvenance.findByPk(Number(output.promptProvenanceId));
      if (prov) {
        out.push({ kind: 'prompt_provenance', id: String(prov.id), label: `audit_hash ${prov.auditHash.slice(0, 8)}` });
        if (prov.pursuitId) {
          const pursuit = await PursuitWorkspace.findByPk(Number(prov.pursuitId));
          if (pursuit) {
            out.push({ kind: 'pursuit', id: String(pursuit.id), label: pursuit.name });
          }
        }
      }
    }
    // Pull cross_provenance "source" rows for this output.
    const crossRows = await CrossProvenance.findAll({
      where: organizationId != null
        ? { subjectKind: 'opportunity_output', subjectId: String(outputId), organizationId: Number(organizationId) }
        : { subjectKind: 'opportunity_output', subjectId: String(outputId) },
      order: [['created_at', 'ASC']], limit: 50,
    });
    for (const cr of crossRows) {
      if (cr.sourceKind && cr.sourceId) {
        out.push({
          kind: cr.sourceKind, id: String(cr.sourceId),
          label: cr.summary || cr.provenanceKind,
          via: 'cross_provenance',
        });
      }
    }
    return { output_id: Number(outputId), ancestry: out };
  } catch (e) {
    logger.warn('operationalLineage.proposalAncestry failed', { error: e.message });
    return { output_id: Number(outputId), ancestry: out, error: e.message };
  }
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const totalEdges = await OperationalLineage.count({ where });
  const recent = await OperationalLineage.count({
    where: { ...where, createdAt: { [Op.gt]: new Date(Date.now() - 86400_000) } },
  });
  return {
    total_edges: totalEdges, edges_last_24h: recent,
    valid_node_kinds: VALID_NODE_KINDS, valid_relations: VALID_RELATIONS,
  };
}

module.exports = {
  MAX_DEPTH, MAX_NODES, VALID_NODE_KINDS, VALID_RELATIONS,
  recordEdge, downstreamOf, upstreamOf,
  traverse, fullLineage, proposalAncestry, summarize,
};
