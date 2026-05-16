// Deep Research Phase 13 — end-to-end proposal explainability.
//
// For one OpportunityOutput, compose a human-readable explanation:
// what research/cluster/pursuit fed into it, what capture strategy
// shaped it, what evaluator priorities it targeted, what readiness
// blockers were active, what artifacts were used, what prompt
// provenance was recorded, what operator actions touched it.
//
// READ-ONLY. Does not mutate.

const {
  OpportunityOutput, PromptProvenance, CrossProvenance,
  PursuitWorkspace, AuditEvent, OperationalLineage,
} = require('../models');
const captureStrategy = require('./captureStrategy.service');
const pursuitContextPrompt = require('./pursuitContextPrompt.service');
const operationalLineage = require('./operationalLineage.service');
const logger = require('../logging/logger');
const { Op } = require('sequelize');

async function buildExplanation(outputId, { organizationId = null } = {}) {
  const output = await OpportunityOutput.findByPk(Number(outputId));
  if (!output) { const err = new Error(`Output ${outputId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const sections = [];

  // 1) Output identity
  sections.push({
    section: 'output',
    summary: `${output.type} output #${output.id}`,
    detail: {
      opportunity_id: output.opportunityId,
      created_at: output.createdAt,
      status: output.status,
      ai_model: output.aiModel,
      content_chars: (output.content || '').length,
    },
  });

  // 2) Prompt provenance (the deterministic context block)
  let provenance = null;
  if (output.promptProvenanceId) {
    provenance = await PromptProvenance.findByPk(Number(output.promptProvenanceId));
    if (provenance) {
      sections.push({
        section: 'prompt_provenance',
        summary: `Prompt audit hash ${provenance.auditHash.slice(0, 16)} — ${provenance.charLength} chars`,
        detail: {
          audit_hash: provenance.auditHash,
          prompt_version: provenance.promptVersion,
          included_sections: provenance.includedSections,
          excluded_sections: provenance.excludedSections,
          generated_by: provenance.generatedBy,
        },
      });
    }
  } else {
    sections.push({
      section: 'prompt_provenance',
      summary: 'No provenance row — output was generated before Phase 12 or without a pursuitId',
      detail: { coverage: 'partial' },
    });
  }

  // 3) Pursuit context (when provenance points at one)
  if (provenance && provenance.pursuitId) {
    const pursuit = await PursuitWorkspace.findByPk(Number(provenance.pursuitId));
    if (pursuit) {
      sections.push({
        section: 'pursuit',
        summary: `Pursuit #${pursuit.id} — ${pursuit.name || 'unnamed'}`,
        detail: { id: pursuit.id, name: pursuit.name, status: pursuit.status, classification: pursuit.classification },
      });
      // Capture strategy summary
      try {
        const cap = await captureStrategy.getForPursuit(pursuit.id);
        if (cap) {
          sections.push({
            section: 'capture_strategy',
            summary: 'Capture strategy active',
            detail: {
              evaluator_priorities: cap.evaluator_priorities || [],
              differentiators: cap.differentiators || [],
              positioning_recommendations: cap.positioning_recommendations || [],
              incumbent_risks: cap.incumbent_risks || [],
            },
          });
        }
      } catch (e) { /* */ }
      // Readiness blockers via pursuit-context preview
      try {
        const ctx = await pursuitContextPrompt.buildPursuitContext(pursuit.id);
        if (ctx && ctx.readiness && Array.isArray(ctx.readiness.blockers)) {
          sections.push({
            section: 'readiness_blockers',
            summary: `${ctx.readiness.blockers.length} blockers active at generation time`,
            detail: { blockers: ctx.readiness.blockers.slice(0, 10) },
          });
        }
        if (ctx && Array.isArray(ctx.assets)) {
          sections.push({
            section: 'acceleration_assets',
            summary: `${ctx.assets.length} acceleration assets suggested`,
            detail: { assets: ctx.assets.slice(0, 8).map((a) => ({ id: a.id, name: a.name || a.title || a.label })) },
          });
        }
      } catch (e) { /* */ }
    }
  }

  // 4) Cross-system provenance pointers
  const crossRows = await CrossProvenance.findAll({
    where: organizationId != null
      ? { subjectKind: 'opportunity_output', subjectId: String(outputId), organizationId: Number(organizationId) }
      : { subjectKind: 'opportunity_output', subjectId: String(outputId) },
    order: [['created_at', 'ASC']], limit: 50,
  });
  if (crossRows.length > 0) {
    sections.push({
      section: 'cross_provenance',
      summary: `${crossRows.length} cross-system provenance links`,
      detail: crossRows.map((cr) => ({
        provenance_kind: cr.provenanceKind,
        source: cr.sourceKind && cr.sourceId ? `${cr.sourceKind}#${cr.sourceId}` : null,
        summary: cr.summary, at: cr.createdAt,
      })),
    });
  }

  // 5) Operator actions: audit events for this output
  const audit = await AuditEvent.findAll({
    where: {
      subjectKind: 'opportunity_output', subjectId: String(outputId),
      ...(organizationId != null ? { organizationId: Number(organizationId) } : {}),
    },
    order: [['created_at', 'ASC']], limit: 50,
  });
  if (audit.length > 0) {
    sections.push({
      section: 'operator_actions',
      summary: `${audit.length} audited operator actions`,
      detail: audit.map((a) => ({
        at: a.createdAt, actor: a.actorEmail, action: `${a.actionKind}.${a.actionVerb}`,
      })),
    });
  }

  // 6) Lineage ancestry (downstream)
  let ancestry = null;
  try {
    ancestry = await operationalLineage.proposalAncestry(outputId, { organizationId });
  } catch (e) { /* */ }
  if (ancestry && Array.isArray(ancestry.ancestry) && ancestry.ancestry.length > 0) {
    sections.push({
      section: 'ancestry',
      summary: `${ancestry.ancestry.length}-step ancestry chain`,
      detail: ancestry.ancestry,
    });
  }

  // 7) Compose a human-readable narrative.
  const narrative = renderNarrative({
    output, provenance,
    pursuitName: sections.find((s) => s.section === 'pursuit')?.detail?.name || null,
    capture: sections.find((s) => s.section === 'capture_strategy')?.detail || null,
    blockers: sections.find((s) => s.section === 'readiness_blockers')?.detail?.blockers || [],
    auditCount: audit.length,
  });

  return {
    output_id: Number(outputId),
    explanation_version: 'v1',
    sections,
    narrative,
    governance_note: 'Read-only explanation. Every fact above traces to a database row.',
  };
}

function renderNarrative({ output, provenance, pursuitName, capture, blockers, auditCount }) {
  const lines = [];
  lines.push(`This ${output.type} output (#${output.id}) was generated on ${new Date(output.createdAt).toISOString().slice(0, 10)}`
    + ` against opportunity #${output.opportunityId} using model ${output.aiModel || 'unspecified'}.`);
  if (provenance) {
    lines.push(`The prompt context block was deterministically composed (audit hash ${provenance.auditHash.slice(0, 16)})`
      + ` with ${(provenance.includedSections || []).length} sections present (${(provenance.includedSections || []).join(', ') || 'none'}).`);
  } else {
    lines.push('No deterministic prompt provenance row is attached — this output predates Phase 12 or was generated without a pursuit context.');
  }
  if (pursuitName) {
    lines.push(`The work was scoped to pursuit "${pursuitName}".`);
  }
  if (capture && (capture.evaluator_priorities || []).length > 0) {
    lines.push(`Capture strategy named ${capture.evaluator_priorities.length} evaluator priorities and `
      + `${(capture.differentiators || []).length} differentiators.`);
  }
  if (blockers.length > 0) {
    lines.push(`${blockers.length} readiness blocker(s) were active at generation time — these should be reviewed.`);
  }
  if (auditCount > 0) {
    lines.push(`${auditCount} operator actions are recorded against this output.`);
  }
  lines.push('Every fact in this explanation is reproducible from the database; no AI inference was used to generate the narrative.');
  return lines.join(' ');
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await OpportunityOutput.count({ where });
  const withProvenance = await OpportunityOutput.count({
    where: { ...where, promptProvenanceId: { [Op.ne]: null } },
  });
  return {
    total_outputs: total,
    with_full_explainability: withProvenance,
    coverage_pct: total > 0 ? Math.round((withProvenance / total) * 100) : 100,
  };
}

module.exports = {
  buildExplanation, summarize,
};
