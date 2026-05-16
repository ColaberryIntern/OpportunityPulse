// Deep Research Phase 13 — operational replay infrastructure.
//
// READ-ONLY synthesis: given a scope (pursuit / output / workflow /
// queue_entry / sla_event), assemble a chronologically-ordered replay
// of every relevant event from audit_events + approval_lineage +
// cross_provenance + sla_acknowledgements + governance_events.
// Optionally persist to replay_events for later analysis.
//
// IMPORTANT: replay never mutates source state.

const { Op } = require('sequelize');
const {
  AuditEvent, ApprovalLineage, CrossProvenance,
  SlaAcknowledgement, GovernanceEvent, WorkflowAssignment,
  PromptProvenance, OpportunityOutput, ReplayEvent,
} = require('../models');
const logger = require('../logging/logger');

const VALID_SCOPES = ['pursuit', 'output', 'workflow', 'queue_entry', 'sla_event'];

async function assemblePursuitReplay(pursuitId, { organizationId = null } = {}) {
  const events = [];
  const tenantFilter = organizationId != null ? { organizationId: Number(organizationId) } : {};

  const audit = await AuditEvent.findAll({
    where: { ...tenantFilter, pursuitId: Number(pursuitId) },
    order: [['created_at', 'ASC']], limit: 500,
  });
  for (const a of audit) {
    events.push({
      at: a.createdAt, kind: `audit.${a.actionKind}.${a.actionVerb}`,
      actor: a.actorEmail, source_table: 'audit_events', source_id: String(a.id),
      summary: a.subjectKind ? `${a.subjectKind}#${a.subjectId}` : null,
      payload: a.payload || {},
    });
  }
  const approvals = await ApprovalLineage.findAll({
    where: { ...tenantFilter, pursuitId: Number(pursuitId) },
    order: [['created_at', 'ASC']], limit: 500,
  });
  for (const a of approvals) {
    events.push({
      at: a.createdAt, kind: `approval.${a.action}`,
      actor: a.actorEmail, source_table: 'approval_lineage', source_id: String(a.id),
      summary: `${a.subjectKind}#${a.subjectId} ${a.fromState || '?'}→${a.toState || a.action}`,
      payload: { duration_seconds: a.durationSeconds, notes: a.notes },
    });
  }
  const cross = await CrossProvenance.findAll({
    where: { ...tenantFilter, pursuitId: Number(pursuitId) },
    order: [['created_at', 'ASC']], limit: 500,
  });
  for (const c of cross) {
    events.push({
      at: c.createdAt, kind: `provenance.${c.provenanceKind}`,
      actor: c.actorEmail, source_table: 'cross_provenance', source_id: String(c.id),
      summary: c.summary || `${c.subjectKind}#${c.subjectId}`,
      payload: c.payload || {},
    });
  }
  const gov = await GovernanceEvent.findAll({
    where: { ...tenantFilter, pursuitId: Number(pursuitId) },
    order: [['created_at', 'ASC']], limit: 500,
  });
  for (const g of gov) {
    events.push({
      at: g.createdAt, kind: `governance.${g.eventKind}`,
      actor: g.actorEmail, source_table: 'governance_events', source_id: String(g.id),
      summary: g.summary, payload: g.metadata || {},
    });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { scope: 'pursuit', scope_id: String(pursuitId), event_count: events.length, events };
}

async function assembleOutputReplay(outputId, { organizationId = null } = {}) {
  const events = [];
  const tenantFilter = organizationId != null ? { organizationId: Number(organizationId) } : {};
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (output) {
    events.push({
      at: output.createdAt, kind: 'output.created',
      source_table: 'opportunity_outputs', source_id: String(output.id),
      summary: `${output.type} for opp ${output.opportunityId}`,
      payload: { ai_model: output.aiModel, status: output.status },
    });
    if (output.promptProvenanceId) {
      const p = await PromptProvenance.findByPk(Number(output.promptProvenanceId));
      if (p) {
        events.push({
          at: p.createdAt, kind: 'prompt.provenance',
          source_table: 'prompt_provenance', source_id: String(p.id),
          summary: `audit_hash ${p.auditHash.slice(0, 16)}`,
          payload: { char_length: p.charLength, included_sections: p.includedSections },
        });
      }
    }
  }
  const audit = await AuditEvent.findAll({
    where: {
      ...tenantFilter, subjectKind: 'opportunity_output', subjectId: String(outputId),
    },
    order: [['created_at', 'ASC']], limit: 200,
  });
  for (const a of audit) {
    events.push({
      at: a.createdAt, kind: `audit.${a.actionKind}.${a.actionVerb}`,
      actor: a.actorEmail, source_table: 'audit_events', source_id: String(a.id),
      summary: null, payload: a.payload || {},
    });
  }
  const cross = await CrossProvenance.findAll({
    where: {
      ...tenantFilter, subjectKind: 'opportunity_output', subjectId: String(outputId),
    },
    order: [['created_at', 'ASC']], limit: 200,
  });
  for (const c of cross) {
    events.push({
      at: c.createdAt, kind: `provenance.${c.provenanceKind}`,
      actor: c.actorEmail, source_table: 'cross_provenance', source_id: String(c.id),
      summary: c.summary, payload: c.payload || {},
    });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { scope: 'output', scope_id: String(outputId), event_count: events.length, events };
}

async function assembleSlaReplay(slaEventId, { organizationId = null } = {}) {
  const events = [];
  const tenantFilter = organizationId != null ? { organizationId: Number(organizationId) } : {};
  const acks = await SlaAcknowledgement.findAll({
    where: { ...tenantFilter, slaEventId: Number(slaEventId) },
    order: [['created_at', 'ASC']], limit: 200,
  });
  for (const a of acks) {
    events.push({
      at: a.createdAt, kind: `sla.${a.action}`,
      actor: a.actorEmail, source_table: 'sla_acknowledgements', source_id: String(a.id),
      summary: a.notes || null, payload: { severity_at_action: a.severityAtAction },
    });
  }
  const audit = await AuditEvent.findAll({
    where: {
      ...tenantFilter, subjectKind: 'sla_event', subjectId: String(slaEventId),
    },
    order: [['created_at', 'ASC']], limit: 200,
  });
  for (const a of audit) {
    events.push({
      at: a.createdAt, kind: `audit.${a.actionKind}.${a.actionVerb}`,
      actor: a.actorEmail, source_table: 'audit_events', source_id: String(a.id),
      summary: null, payload: a.payload || {},
    });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { scope: 'sla_event', scope_id: String(slaEventId), event_count: events.length, events };
}

async function assembleWorkflowReplay(workflowAssignmentId, { organizationId = null } = {}) {
  const events = [];
  const tenantFilter = organizationId != null ? { organizationId: Number(organizationId) } : {};
  const lineage = await ApprovalLineage.findAll({
    where: { ...tenantFilter, workflowAssignmentId: Number(workflowAssignmentId) },
    order: [['created_at', 'ASC']], limit: 200,
  });
  for (const a of lineage) {
    events.push({
      at: a.createdAt, kind: `approval.${a.action}`,
      actor: a.actorEmail, source_table: 'approval_lineage', source_id: String(a.id),
      summary: `${a.fromState || '?'}→${a.toState || a.action}`,
      payload: { duration_seconds: a.durationSeconds, notes: a.notes },
    });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return {
    scope: 'workflow', scope_id: String(workflowAssignmentId),
    event_count: events.length, events,
  };
}

// Top-level dispatcher.
async function buildReplay({ scope, scopeId, organizationId = null } = {}) {
  if (!VALID_SCOPES.includes(scope)) {
    const err = new Error(`Invalid replay scope: ${scope}`); err.code = 'BAD_INPUT'; throw err;
  }
  switch (scope) {
    case 'pursuit': return assemblePursuitReplay(scopeId, { organizationId });
    case 'output': return assembleOutputReplay(scopeId, { organizationId });
    case 'sla_event': return assembleSlaReplay(scopeId, { organizationId });
    case 'workflow': return assembleWorkflowReplay(scopeId, { organizationId });
    default:
      return { scope, scope_id: String(scopeId), event_count: 0, events: [] };
  }
}

// Persist a built replay snapshot to replay_events for later analysis.
async function persistReplay(replay, { organizationId = null } = {}) {
  if (!replay || !Array.isArray(replay.events)) return { recorded: 0 };
  let n = 0;
  for (let i = 0; i < replay.events.length; i += 1) {
    const e = replay.events[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      await ReplayEvent.create({
        organizationId: organizationId == null ? null : Number(organizationId),
        replayScope: replay.scope,
        scopeId: String(replay.scope_id),
        ordinal: i,
        eventKind: String(e.kind || 'unknown').slice(0, 64),
        eventAt: new Date(e.at),
        actorEmail: e.actor || null,
        sourceTable: e.source_table || 'unknown',
        sourceId: e.source_id == null ? null : String(e.source_id),
        summary: e.summary == null ? null : String(e.summary).slice(0, 512),
        payload: e.payload || {},
      });
      n += 1;
    } catch (err) {
      logger.warn('operationalReplay.persistReplay row failed', { error: err.message });
    }
  }
  return { recorded: n };
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await ReplayEvent.count({ where });
  return { total_replay_events: total, valid_scopes: VALID_SCOPES };
}

module.exports = {
  VALID_SCOPES,
  assemblePursuitReplay, assembleOutputReplay,
  assembleSlaReplay, assembleWorkflowReplay,
  buildReplay, persistReplay, summarize,
};
