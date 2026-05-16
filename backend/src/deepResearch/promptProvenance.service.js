// Deep Research Phase 12 — prompt provenance hardening.
//
// Records every prompt-context assembly to prompt_provenance, with the
// audit_hash, included/excluded sections, char length, generator email,
// and a truncated preview. The OpportunityOutput row that the prompt
// produced is linked back via prompt_provenance_id + prompt_audit_hash.
//
// IMPORTANT: this table is append-only. Every draft must be reproducible
// from its provenance row + the original PursuitWorkspace + capture
// strategy state. Operators can ask "what context produced this output?"
// and get a deterministic answer.

const { Op } = require('sequelize');
const { PromptProvenance, OpportunityOutput } = require('../models');
const pursuitContextPrompt = require('./pursuitContextPrompt.service');
const logger = require('../logging/logger');

const PROMPT_VERSION = 'v1';
const MAX_PREVIEW_CHARS = 4000;

// Record a provenance row for one prompt-context block. Soft-fails.
async function record({
  organizationId = null, auditHash, promptVersion = PROMPT_VERSION,
  pursuitId = null, opportunityId = null, outputId = null, outputType = null,
  includedSections = [], excludedSections = [], charLength = 0,
  contextInputs = {}, blockPreview = null, generatedBy = null,
} = {}) {
  if (!auditHash) {
    logger.warn('promptProvenance.record: missing auditHash');
    return null;
  }
  try {
    return await PromptProvenance.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      auditHash: String(auditHash).slice(0, 64),
      promptVersion,
      pursuitId: pursuitId == null ? null : Number(pursuitId),
      opportunityId: opportunityId == null ? null : Number(opportunityId),
      outputId: outputId == null ? null : Number(outputId),
      outputType,
      includedSections,
      excludedSections,
      charLength: Number(charLength) || 0,
      contextInputs: contextInputs || {},
      blockPreview: blockPreview ? String(blockPreview).slice(0, MAX_PREVIEW_CHARS) : null,
      generatedBy,
    });
  } catch (e) {
    logger.warn('promptProvenance.record failed', { error: e.message });
    return null;
  }
}

// One-call: compose the block, persist provenance, return both. Used by
// actionGenerator at draft time + by the preview endpoint.
async function buildAndPersist(pursuitId, {
  organizationId = null, opportunityId = null, outputType = null,
  generatedBy = null, persist = true,
} = {}) {
  const preview = await pursuitContextPrompt.previewBlockForPursuit(
    pursuitId, { opportunityId },
  );
  let provenance = null;
  if (persist && preview && preview.audit_hash) {
    provenance = await record({
      organizationId, auditHash: preview.audit_hash,
      pursuitId, opportunityId, outputType,
      includedSections: preview.included_sections,
      excludedSections: preview.excluded_sections,
      charLength: preview.char_length,
      contextInputs: {
        opportunity_id: opportunityId, pursuit_id: pursuitId, output_type: outputType,
      },
      blockPreview: preview.block,
      generatedBy,
    });
  }
  return {
    audit_hash: preview && preview.audit_hash,
    block: preview && preview.block,
    char_length: preview && preview.char_length,
    included_sections: preview && preview.included_sections,
    excluded_sections: preview && preview.excluded_sections,
    provenance_id: provenance ? Number(provenance.id) : null,
    governance_note: 'Deterministic composition; every line traces to a Phase 8/9 source.',
  };
}

// Link an OpportunityOutput row back to its provenance after generation.
async function linkOutput(outputId, { provenanceId, auditHash } = {}) {
  if (!outputId) return null;
  try {
    const output = await OpportunityOutput.findByPk(Number(outputId));
    if (!output) return null;
    output.promptProvenanceId = provenanceId == null ? null : Number(provenanceId);
    output.promptAuditHash = auditHash || null;
    await output.save();
    if (provenanceId) {
      await PromptProvenance.update(
        { outputId: Number(outputId) },
        { where: { id: Number(provenanceId) } },
      );
    }
    return output.toJSON();
  } catch (e) {
    logger.warn('promptProvenance.linkOutput failed', { error: e.message });
    return null;
  }
}

async function findByOutput(outputId) {
  const row = await PromptProvenance.findOne({
    where: { outputId: Number(outputId) },
    order: [['created_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

async function findByAuditHash(auditHash) {
  const rows = await PromptProvenance.findAll({
    where: { auditHash: String(auditHash) },
    order: [['created_at', 'DESC']], limit: 50,
  });
  return rows.map((r) => r.toJSON());
}

async function listForPursuit(pursuitId, { limit = 25 } = {}) {
  const rows = await PromptProvenance.findAll({
    where: { pursuitId: Number(pursuitId) },
    order: [['created_at', 'DESC']], limit: Math.min(200, Number(limit) || 25),
  });
  return rows.map((r) => r.toJSON());
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await PromptProvenance.count({ where });
  const linkedOutputs = await PromptProvenance.count({
    where: { ...where, outputId: { [Op.ne]: null } },
  });
  const last24h = await PromptProvenance.count({
    where: { ...where, createdAt: { [Op.gt]: new Date(Date.now() - 86400_000) } },
  });
  return {
    total_provenance_rows: total,
    rows_linked_to_outputs: linkedOutputs,
    rows_last_24h: last24h,
    link_coverage_pct: total > 0 ? Math.round((linkedOutputs / total) * 100) : 100,
  };
}

module.exports = {
  PROMPT_VERSION, MAX_PREVIEW_CHARS,
  record, buildAndPersist, linkOutput,
  findByOutput, findByAuditHash, listForPursuit,
  summarize,
};
