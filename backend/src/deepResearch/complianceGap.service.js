// Deep Research Phase 9 — compliance gap detection.
//
// Detects missing certifications, missing staffing, missing attachments,
// missing forms, expired artifacts, and weak capability alignment by
// reading the persisted compliance matrix + RFP attachments + proposal
// artifact vault. Emits typed gap rows with severity + recommended actions.
//
// MEASURE-ONLY. Never modifies the matrix, the artifacts, or the pursuit.

const { Op } = require('sequelize');
const {
  ComplianceMatrix, ComplianceMatrixItem, RfpAttachment,
  ProposalArtifact, ComplianceGap, PursuitWorkspace,
} = require('../models');

const GAP_KINDS = [
  'missing_certification', 'missing_staffing', 'missing_attachment',
  'missing_form', 'expired_artifact', 'weak_capability',
];
const STATUSES = ['open', 'acknowledged', 'mitigated', 'dismissed'];

const SEVERITY_BY_KIND = {
  missing_certification: 80,
  missing_staffing: 75,
  missing_attachment: 65,
  missing_form: 85,
  expired_artifact: 70,
  weak_capability: 55,
};

function severityForItem(item) {
  // Bump severity for items flagged "critical" or "high" on the matrix.
  let base = SEVERITY_BY_KIND[item.gapKind] || 50;
  if (item.itemSeverity === 'critical') base = Math.min(100, base + 10);
  return base;
}

function recommendedActionsFor(gapKind, label) {
  switch (gapKind) {
    case 'missing_certification':
      return [
        'Confirm SAM.gov registration is active for the entity bidding.',
        `Upload current certification document for: ${label}.`,
      ];
    case 'missing_staffing':
      return [
        'Identify named key personnel and attach resumes.',
        `Confirm bench plan covers requirement: ${label}.`,
      ];
    case 'missing_attachment':
      return [
        `Upload the required attachment: ${label}.`,
        'Confirm the attachment is in the format / page-limit the RFP requires.',
      ];
    case 'missing_form':
      return [
        `Complete the required form: ${label}.`,
        'Have an authorized signatory sign before submission.',
      ];
    case 'expired_artifact':
      return [
        `Refresh expired artifact: ${label}.`,
        'Verify the artifact is still relevant to the current pursuit.',
      ];
    case 'weak_capability':
      return [
        `Strengthen the capability narrative around: ${label}.`,
        'Pair with a stronger past-performance reference.',
      ];
    default: return [];
  }
}

// Detection runs over the compliance matrix items + the rfp_attachments +
// proposal_artifacts. Returns the list of computed gaps (not persisted)
// so callers can decide whether to persist a fresh sweep or just inspect.
async function detectForPursuit(pursuitId) {
  const out = [];
  // 1) Compliance matrix items with status 'missing' or 'partial'.
  const matrix = await ComplianceMatrix.findOne({
    where: { pursuitId: Number(pursuitId) }, order: [['computed_at', 'DESC']],
  });
  if (matrix) {
    const items = await ComplianceMatrixItem.findAll({
      where: { complianceMatrixId: matrix.id, status: { [Op.in]: ['missing', 'partial'] } },
    });
    for (const item of items) {
      let gapKind = 'missing_attachment';
      if (item.itemKind === 'certification') gapKind = 'missing_certification';
      else if (item.itemKind === 'staffing') gapKind = 'missing_staffing';
      else if (item.itemKind === 'form') gapKind = 'missing_form';
      else if (item.itemKind === 'requirement') gapKind = 'weak_capability';
      out.push({
        gapKind, label: item.label,
        readinessImpact: item.severity === 'critical' ? 25 : item.severity === 'high' ? 15 : 8,
        recommendedActions: recommendedActionsFor(gapKind, item.label),
        relatedArtifactIds: [],
        rationale: `Compliance item "${item.label}" is currently ${item.status} (severity ${item.severity}).`,
        itemSeverity: item.severity,
      });
    }
  }
  // 2) Expired artifacts attached to anything anchored to this pursuit.
  const expired = await ProposalArtifact.findAll({
    where: { status: 'expired' }, order: [['expires_at', 'ASC']], limit: 30,
  });
  for (const a of expired) {
    out.push({
      gapKind: 'expired_artifact', label: a.label,
      readinessImpact: 10,
      recommendedActions: recommendedActionsFor('expired_artifact', a.label),
      relatedArtifactIds: [a.id],
      rationale: `Artifact "${a.label}" expired on ${a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 10) : 'unknown date'}.`,
    });
  }
  // 3) Missing standard RFP attachment kinds.
  const atts = await RfpAttachment.findAll({
    where: { pursuitId: Number(pursuitId) }, attributes: ['attachmentKind'],
  });
  const haveKinds = new Set(atts.map((a) => a.attachmentKind));
  const required = ['rfp', 'attachment'];
  for (const k of required) {
    if (!haveKinds.has(k)) {
      out.push({
        gapKind: 'missing_attachment', label: `No ${k} attachment uploaded`,
        readinessImpact: 12,
        recommendedActions: [`Upload the ${k} document so the matrix can map requirements to it.`],
        relatedArtifactIds: [],
        rationale: `Pursuit has no attachments tagged "${k}".`,
      });
    }
  }
  // Attach severity to each.
  return out.map((g) => ({ ...g, severity: severityForItem(g) }));
}

// Persist gaps. Idempotent rewrite of OPEN gaps for the pursuit;
// acknowledged / mitigated / dismissed rows are preserved for audit.
async function refreshForPursuit(pursuitId) {
  const computed = await detectForPursuit(pursuitId);
  await ComplianceGap.destroy({
    where: { pursuitId: Number(pursuitId), status: 'open' },
  });
  const persisted = [];
  for (const g of computed) {
    // eslint-disable-next-line no-await-in-loop
    const row = await ComplianceGap.create({
      pursuitId: Number(pursuitId),
      gapKind: g.gapKind,
      label: g.label,
      severity: g.severity,
      readinessImpact: g.readinessImpact,
      recommendedActions: g.recommendedActions,
      relatedArtifactIds: g.relatedArtifactIds,
      status: 'open',
      rationale: g.rationale,
    });
    persisted.push(row.toJSON());
  }
  return { pursuit_id: Number(pursuitId), generated: persisted.length, gaps: persisted };
}

async function listForPursuit(pursuitId, { status = null } = {}) {
  const where = { pursuitId: Number(pursuitId) };
  if (status) where.status = status;
  const rows = await ComplianceGap.findAll({
    where, order: [['severity', 'DESC'], ['detected_at', 'DESC']], limit: 200,
  });
  return rows.map((r) => r.toJSON());
}

async function updateGapStatus(id, status, actor = null) {
  if (!STATUSES.includes(status)) {
    const err = new Error(`Invalid status: ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await ComplianceGap.findByPk(id);
  if (!row) { const err = new Error(`Gap ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const patch = { status };
  if (status === 'mitigated' || status === 'dismissed') patch.resolvedAt = new Date();
  if (actor) patch.rationale = `${row.rationale || ''}\nResolved by ${actor}.`;
  await row.update(patch);
  return row.toJSON();
}

module.exports = {
  GAP_KINDS, STATUSES, SEVERITY_BY_KIND,
  severityForItem, recommendedActionsFor,
  detectForPursuit, refreshForPursuit,
  listForPursuit, updateGapStatus,
};
