// Deep Research Phase 8 — submission readiness FOUNDATIONS.
//
// Per the Phase 8 spec: "DO NOT build full submission engine yet". This
// service provides the asset/compliance-matrix STORAGE shape and a small
// helper API. The full submission engine lands in Phase 9.
//
// What this service does:
//   - lists artifacts attached to a pursuit / opportunity
//   - adds an artifact (manual or templated)
//   - updates artifact status
//   - applies a default compliance-matrix template
//
// What it does NOT do:
//   - download anything
//   - read/write external files
//   - submit anything anywhere
//   - automate proposal packaging

const { Op } = require('sequelize');
const { SubmissionReadinessArtifact } = require('../models');

const VALID_KINDS = [
  'capability_statement', 'past_performance', 'staffing_plan', 'pricing_table',
  'compliance_matrix', 'attachment', 'other',
];
const VALID_STATUSES = ['missing', 'in_progress', 'ready', 'reviewed'];

// Default compliance-matrix template — applied when a pursuit has no
// artifacts yet, so the operator sees a real punch-list instead of an
// empty section.
const DEFAULT_TEMPLATE = [
  { artifactKind: 'capability_statement', label: 'Capability statement (2-pager)', required: true },
  { artifactKind: 'past_performance', label: 'Past performance summary (3-5 refs)', required: true },
  { artifactKind: 'staffing_plan', label: 'Key staff resumes + bench plan', required: true },
  { artifactKind: 'pricing_table', label: 'Pricing table / cost narrative', required: true },
  { artifactKind: 'compliance_matrix', label: 'Compliance matrix (RFP requirement → response)', required: true },
];

async function listForPursuit(pursuitId) {
  const rows = await SubmissionReadinessArtifact.findAll({
    where: { pursuitId: Number(pursuitId) },
    order: [['required', 'DESC'], ['artifact_kind', 'ASC']],
  });
  return rows.map((r) => r.toJSON());
}

async function listForOpportunity(opportunityId) {
  const rows = await SubmissionReadinessArtifact.findAll({
    where: { opportunityId: Number(opportunityId) },
    order: [['required', 'DESC'], ['artifact_kind', 'ASC']],
  });
  return rows.map((r) => r.toJSON());
}

async function addArtifact({
  pursuitId = null, opportunityId = null, artifactKind, label,
  required = true, status = 'missing', contentRef = null, metadata = {},
} = {}) {
  if (!VALID_KINDS.includes(artifactKind)) {
    const err = new Error(`Invalid artifact_kind ${artifactKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`Invalid status ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  if (!label) {
    const err = new Error('label is required'); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await SubmissionReadinessArtifact.create({
    pursuitId, opportunityId,
    artifactKind, label, required, status, contentRef, metadata,
  });
  return row.toJSON();
}

async function updateArtifact(id, { status, label, contentRef, metadata } = {}) {
  const row = await SubmissionReadinessArtifact.findByPk(id);
  if (!row) {
    const err = new Error(`Artifact ${id} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  const updates = {};
  if (status != null) {
    if (!VALID_STATUSES.includes(status)) {
      const err = new Error(`Invalid status ${status}`); err.code = 'BAD_INPUT'; throw err;
    }
    updates.status = status;
  }
  if (label != null) updates.label = label;
  if (contentRef !== undefined) updates.contentRef = contentRef;
  if (metadata !== undefined) updates.metadata = metadata || {};
  await row.update(updates);
  return row.toJSON();
}

async function deleteArtifact(id) {
  const row = await SubmissionReadinessArtifact.findByPk(id);
  if (!row) {
    const err = new Error(`Artifact ${id} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  await row.destroy();
  return { id, deleted: true };
}

// Seed the default template for a pursuit if it has no artifacts yet.
// Idempotent — a pursuit with at least one artifact is left untouched.
async function applyDefaultTemplate(pursuitId) {
  const existing = await SubmissionReadinessArtifact.count({
    where: { pursuitId: Number(pursuitId) },
  });
  if (existing > 0) {
    return { pursuit_id: Number(pursuitId), created: 0, skipped: true };
  }
  const created = [];
  for (const tmpl of DEFAULT_TEMPLATE) {
    // eslint-disable-next-line no-await-in-loop
    const row = await SubmissionReadinessArtifact.create({
      pursuitId: Number(pursuitId),
      artifactKind: tmpl.artifactKind,
      label: tmpl.label,
      required: tmpl.required,
      status: 'missing',
    });
    created.push(row.toJSON());
  }
  return { pursuit_id: Number(pursuitId), created: created.length, artifacts: created };
}

// Summary shape consumed by the pursuit page header.
async function summarizeForPursuit(pursuitId) {
  const rows = await SubmissionReadinessArtifact.findAll({
    where: { pursuitId: Number(pursuitId) },
  });
  const total = rows.length;
  const required = rows.filter((r) => r.required).length;
  const ready = rows.filter((r) => ['ready', 'reviewed'].includes(r.status)).length;
  const inProgress = rows.filter((r) => r.status === 'in_progress').length;
  const missing = rows.filter((r) => r.status === 'missing').length;
  return {
    pursuit_id: Number(pursuitId),
    total, required, ready, in_progress: inProgress, missing,
    completion_pct: total > 0 ? Math.round((ready / total) * 100) : 0,
  };
}

module.exports = {
  VALID_KINDS, VALID_STATUSES, DEFAULT_TEMPLATE,
  listForPursuit, listForOpportunity,
  addArtifact, updateArtifact, deleteArtifact,
  applyDefaultTemplate, summarizeForPursuit,
};
