// Deep Research Phase 14 — auto-edge writer.
//
// Thin convenience layer over Phase 13's operationalLineage.recordEdge +
// crossProvenance.record. Used by hot-path callsites to emit both a
// cross_provenance audit row AND a directed-edge graph entry in one call.
// Both writes soft-fail so the calling code is never broken by lineage.

const operationalLineage = require('./operationalLineage.service');
const crossProvenance = require('./crossProvenance.service');
const logger = require('../logging/logger');

// One canonical write. Emits both a cross_provenance row + an
// operational_lineage edge atomically (soft-fail).
async function emit({
  organizationId = null, actorEmail = null,
  fromKind, fromId,
  toKind, toId,
  relation,
  pursuitId = null,
  summary = null, payload = {},
} = {}) {
  if (!fromKind || !fromId || !toKind || !toId || !relation) {
    logger.warn('lineageEdgeWriter.emit: missing required fields');
    return { provenance: null, edge: null };
  }
  // Map the relation to a provenance_kind for the cross_provenance row.
  // The mapping is intentionally lossy — relations are graph-edge labels;
  // provenance_kind is a coarser taxonomy.
  const provenanceMap = {
    spawned: 'generation',
    generated: 'generation',
    derives_from: 'source',
    fed_into: 'dependency',
    evaluated_by: 'operator',
    approved_by: 'operator',
    reviewed_by: 'operator',
    attached_to: 'dependency',
    satisfied_by: 'dependency',
    escalated_to: 'workflow',
    assigned_to: 'workflow',
    cancelled: 'workflow',
    rejected: 'workflow',
    requires: 'dependency',
    augmented_by: 'augmented_by',
  };
  const provenanceKind = provenanceMap[relation] || 'dependency';

  const [edge, prov] = await Promise.all([
    operationalLineage.recordEdge({
      organizationId, fromKind, fromId, toKind, toId,
      relation, pursuitId, metadata: payload,
    }).catch((e) => { logger.warn('lineageEdgeWriter edge failed', { error: e.message }); return null; }),
    crossProvenance.record({
      organizationId, subjectKind: toKind, subjectId: toId,
      provenanceKind, sourceKind: fromKind, sourceId: fromId,
      pursuitId, actorEmail, summary, payload,
    }).catch((e) => { logger.warn('lineageEdgeWriter provenance failed', { error: e.message }); return null; }),
  ]);
  return { provenance: prov ? prov.toJSON() : null, edge };
}

// Emit a chain of edges in one go (e.g. research -> cluster -> pursuit).
async function emitChain(chain = [], context = {}) {
  const out = [];
  for (const step of chain) {
    // eslint-disable-next-line no-await-in-loop
    const r = await emit({ ...context, ...step });
    out.push(r);
  }
  return { emitted: out.length, results: out };
}

// Domain-specific convenience helpers.
const helpers = {
  pursuitActivated({ pursuitId, sourceKind, sourceId, organizationId, actorEmail }) {
    return emit({
      organizationId, actorEmail,
      fromKind: sourceKind || 'manual', fromId: sourceId || String(pursuitId),
      toKind: 'pursuit', toId: String(pursuitId),
      relation: 'spawned', pursuitId,
      summary: `Pursuit ${pursuitId} activated from ${sourceKind || 'manual'}`,
    });
  },
  captureStrategyBuilt({ pursuitId, captureId, organizationId, actorEmail }) {
    return emit({
      organizationId, actorEmail,
      fromKind: 'pursuit', fromId: String(pursuitId),
      toKind: 'capture_strategy', toId: String(captureId),
      relation: 'generated', pursuitId,
      summary: 'Capture strategy generated for pursuit',
    });
  },
  complianceMatrixBuilt({ pursuitId, matrixId, organizationId, actorEmail }) {
    return emit({
      organizationId, actorEmail,
      fromKind: 'pursuit', fromId: String(pursuitId),
      toKind: 'compliance_matrix', toId: String(matrixId),
      relation: 'generated', pursuitId,
      summary: 'Compliance matrix built for pursuit',
    });
  },
  draftGenerated({ pursuitId, opportunityId, outputId, organizationId, actorEmail, auditHash }) {
    return emit({
      organizationId, actorEmail,
      fromKind: pursuitId ? 'pursuit' : 'opportunity',
      fromId: pursuitId ? String(pursuitId) : String(opportunityId),
      toKind: 'opportunity_output', toId: String(outputId),
      relation: 'generated', pursuitId,
      summary: `Draft generated${auditHash ? ` (prompt hash ${auditHash.slice(0, 8)})` : ''}`,
      payload: { audit_hash: auditHash, opportunity_id: opportunityId },
    });
  },
  packageAssembled({ pursuitId, packageId, organizationId, actorEmail }) {
    return emit({
      organizationId, actorEmail,
      fromKind: 'pursuit', fromId: String(pursuitId),
      toKind: 'submission_package', toId: String(packageId),
      relation: 'generated', pursuitId,
      summary: 'Submission package assembled',
    });
  },
  workflowAssigned({ workflowId, subjectKind, subjectId, pursuitId, organizationId, actorEmail }) {
    return emit({
      organizationId, actorEmail,
      fromKind: 'workflow_assignment', fromId: String(workflowId),
      toKind: subjectKind, toId: String(subjectId),
      relation: 'assigned_to', pursuitId,
      summary: 'Workflow assigned to subject',
    });
  },
  slaActionTaken({ slaEventId, action, pursuitId, organizationId, actorEmail }) {
    return emit({
      organizationId, actorEmail,
      fromKind: 'operator', fromId: actorEmail || 'system',
      toKind: 'sla_event', toId: String(slaEventId),
      relation: action === 'approve' ? 'approved_by' : 'evaluated_by',
      pursuitId, summary: `SLA event ${action} action`,
      payload: { action },
    });
  },
  queueEnqueued({ jobId, pursuitId, jobKind, organizationId, actorEmail }) {
    return emit({
      organizationId, actorEmail,
      fromKind: 'pursuit', fromId: pursuitId ? String(pursuitId) : 'none',
      toKind: 'worker_job', toId: String(jobId),
      relation: 'spawned', pursuitId,
      summary: `${jobKind} job enqueued`,
    });
  },
};

async function summarize({ organizationId = null } = {}) {
  const [provSummary, lineageSummary] = await Promise.all([
    crossProvenance.summarize({ organizationId }),
    operationalLineage.summarize({ organizationId }),
  ]);
  return {
    provenance: provSummary,
    lineage: lineageSummary,
    helpers_available: Object.keys(helpers),
  };
}

module.exports = {
  emit, emitChain, helpers, summarize,
};
