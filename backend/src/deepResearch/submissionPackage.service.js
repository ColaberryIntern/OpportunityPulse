// Deep Research Phase 9 — submission package assembler.
//
// Composes a package metadata snapshot for a pursuit: which generated
// drafts (OpportunityOutput rows), which RFP attachments, which reusable
// proposal artifacts are included. Computes a 0-100 completeness score +
// a list of missing components.
//
// DOES NOT submit anywhere. The status workflow is draft → ready →
// submitted (the latter is a human-set marker, not an automated action).

const { Op } = require('sequelize');
const {
  SubmissionPackage, PursuitWorkspace, OpportunityOutput,
  RfpAttachment, ProposalArtifact, ComplianceMatrix,
} = require('../models');
const proposalArtifact = require('./proposalArtifact.service');

const VALID_STATUSES = ['draft', 'ready', 'submitted', 'archived'];

const REQUIRED_KINDS = {
  outputs: 1,           // at least one draft proposal
  rfp_attachment: 0,    // optional but heavily recommended
  capability_statement: 1,
  past_performance: 1,
};

function assertValidStatus(s) {
  if (!VALID_STATUSES.includes(s)) {
    const err = new Error(`Invalid status: ${s}`); err.code = 'BAD_INPUT'; throw err;
  }
}

// Compute completeness given the resolved components + the active
// compliance matrix (if any). Deterministic.
function computeCompleteness({
  outputCount, attachmentCount, artifactCounts, complianceCompletionPct = null,
}) {
  let score = 0;
  const missing = [];
  // Outputs (drafts) — 30 pts when at least one is attached.
  if (outputCount > 0) score += 30; else missing.push('proposal draft (output)');
  // RFP attachments — 15 pts when at least one attached, otherwise warning.
  if (attachmentCount > 0) score += 15; else missing.push('RFP attachment');
  // Capability statement — 15 pts.
  if ((artifactCounts.capability_statement || 0) > 0) score += 15;
  else missing.push('capability statement artifact');
  // Past performance — 15 pts.
  if ((artifactCounts.past_performance || 0) > 0) score += 15;
  else missing.push('past performance artifact');
  // Compliance matrix completion — up to 25 pts pro-rated.
  if (complianceCompletionPct != null) {
    score += Math.round(Math.min(25, complianceCompletionPct * 25 / 100));
  } else {
    missing.push('compliance matrix');
  }
  return { score: Math.max(0, Math.min(100, score)), missing };
}

async function assemblePackage({
  pursuitId, name = null, outputIds = null, attachmentIds = null, artifactIds = null,
  assembledBy = null,
} = {}) {
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) { const err = new Error(`Pursuit ${pursuitId} not found`); err.code = 'NOT_FOUND'; throw err; }
  // Resolve defaults from the pursuit's linked outputs + a smart-default
  // artifact suggestion when outputIds/artifactIds aren't supplied.
  const finalOutputIds = Array.isArray(outputIds)
    ? outputIds.map(Number).filter(Number.isInteger)
    : (pursuit.linkedOutputIds || []).map(Number).filter(Number.isInteger);
  const finalAttachmentIds = Array.isArray(attachmentIds)
    ? attachmentIds.map(Number).filter(Number.isInteger) : [];
  let finalArtifactIds = Array.isArray(artifactIds)
    ? artifactIds.map(Number).filter(Number.isInteger) : [];

  // When artifactIds unset, auto-suggest top capability_statement + past_performance.
  if (finalArtifactIds.length === 0) {
    const suggested = await proposalArtifact.suggestForContext({
      kinds: ['capability_statement', 'past_performance'], limit: 4,
    });
    finalArtifactIds = suggested.map((a) => a.id);
  }

  // Counts of artifact kinds in the package.
  const artifactCounts = {};
  if (finalArtifactIds.length > 0) {
    const arts = await ProposalArtifact.findAll({
      where: { id: { [Op.in]: finalArtifactIds } },
      attributes: ['id', 'artifactKind'],
    });
    for (const a of arts) {
      artifactCounts[a.artifactKind] = (artifactCounts[a.artifactKind] || 0) + 1;
    }
  }
  // Resolve compliance matrix completion if one exists.
  const matrix = await ComplianceMatrix.findOne({
    where: { pursuitId: Number(pursuitId) },
    order: [['computed_at', 'DESC']],
  });
  const { score, missing } = computeCompleteness({
    outputCount: finalOutputIds.length,
    attachmentCount: finalAttachmentIds.length,
    artifactCounts,
    complianceCompletionPct: matrix ? Number(matrix.completionPct) : null,
  });

  const pkg = await SubmissionPackage.create({
    pursuitId: Number(pursuitId),
    name: name || `${pursuit.name} — submission package`,
    status: 'draft',
    outputIds: finalOutputIds,
    attachmentIds: finalAttachmentIds,
    artifactIds: finalArtifactIds,
    completenessScore: score,
    missingComponents: missing,
    complianceMatrixId: matrix ? matrix.id : null,
    rationale: `Assembled with ${finalOutputIds.length} drafts, `
      + `${finalAttachmentIds.length} RFP attachments, `
      + `${finalArtifactIds.length} reusable artifacts.`
      + (matrix ? ` Compliance ${matrix.completionPct}%.` : ' No compliance matrix yet.'),
    assembledBy,
  });
  // Record usage on the included artifacts.
  for (const id of finalArtifactIds) {
    // eslint-disable-next-line no-await-in-loop
    await proposalArtifact.recordUse(id);
  }
  return pkg.toJSON();
}

async function updatePackage(id, updates = {}) {
  const row = await SubmissionPackage.findByPk(id);
  if (!row) { const err = new Error(`Package ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const patch = {};
  for (const k of ['name', 'outputIds', 'attachmentIds', 'artifactIds', 'rationale']) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }
  if (updates.status) {
    assertValidStatus(updates.status);
    patch.status = updates.status;
    if (updates.status === 'submitted') patch.submittedAt = new Date();
  }
  await row.update(patch);
  return row.toJSON();
}

async function listForPursuit(pursuitId) {
  const rows = await SubmissionPackage.findAll({
    where: { pursuitId: Number(pursuitId) },
    order: [['assembled_at', 'DESC']],
  });
  return rows.map((r) => r.toJSON());
}

async function getPackageDetail(id) {
  const row = await SubmissionPackage.findByPk(id);
  if (!row) return null;
  const j = row.toJSON();
  const [outputs, attachments, artifacts] = await Promise.all([
    Array.isArray(j.outputIds) && j.outputIds.length
      ? OpportunityOutput.findAll({ where: { id: { [Op.in]: j.outputIds } } }).then((rs) => rs.map((r) => r.toJSON()))
      : Promise.resolve([]),
    Array.isArray(j.attachmentIds) && j.attachmentIds.length
      ? RfpAttachment.findAll({ where: { id: { [Op.in]: j.attachmentIds } } }).then((rs) => rs.map((r) => r.toJSON()))
      : Promise.resolve([]),
    Array.isArray(j.artifactIds) && j.artifactIds.length
      ? ProposalArtifact.findAll({ where: { id: { [Op.in]: j.artifactIds } } }).then((rs) => rs.map((r) => r.toJSON()))
      : Promise.resolve([]),
  ]);
  return { ...j, outputs, attachments, artifacts };
}

module.exports = {
  VALID_STATUSES, REQUIRED_KINDS,
  computeCompleteness, assemblePackage, updatePackage,
  listForPursuit, getPackageDetail,
};
