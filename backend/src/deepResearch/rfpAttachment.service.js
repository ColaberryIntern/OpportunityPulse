// Deep Research Phase 9 — RFP attachment locker.
//
// Metadata-only attachment registry. NO file blob storage in v1 — the
// service tracks label + content_ref (URL or future storage key) + version
// + tags + expiration so the operator can organize RFP/amendment/
// compliance docs around a pursuit. Real blob storage is a Phase 10 add.

const { Op } = require('sequelize');
const { RfpAttachment } = require('../models');

const VALID_KINDS = [
  'rfp', 'amendment', 'attachment', 'compliance_doc', 'supporting',
  'qa_response', 'past_proposal', 'other',
];

function assertValidKind(kind) {
  if (!VALID_KINDS.includes(kind)) {
    const err = new Error(`Invalid attachment_kind: ${kind}`);
    err.code = 'BAD_INPUT'; throw err;
  }
}

async function addAttachment({
  pursuitId = null, opportunityId = null,
  attachmentKind, label, filename = null, contentRef = null,
  mimeType = null, sizeBytes = null,
  tags = [], expiresAt = null, uploadedBy = null, metadata = {},
} = {}) {
  assertValidKind(attachmentKind);
  if (!label) {
    const err = new Error('label is required'); err.code = 'BAD_INPUT'; throw err;
  }
  // Auto-version: if a same-label same-kind exists on same pursuit, bump.
  let version = 1;
  if (pursuitId != null) {
    const existing = await RfpAttachment.findOne({
      where: { pursuitId: Number(pursuitId), attachmentKind, label },
      order: [['version', 'DESC']],
    });
    if (existing) version = Number(existing.version || 0) + 1;
  }
  const row = await RfpAttachment.create({
    pursuitId, opportunityId,
    attachmentKind, label, filename, contentRef,
    mimeType, sizeBytes, version,
    tags: Array.isArray(tags) ? tags : [],
    expiresAt, uploadedBy, metadata,
  });
  return row.toJSON();
}

async function updateAttachment(id, updates = {}) {
  const row = await RfpAttachment.findByPk(id);
  if (!row) { const err = new Error(`Attachment ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const patch = {};
  for (const k of ['label', 'filename', 'contentRef', 'mimeType', 'sizeBytes',
    'tags', 'expiresAt', 'uploadedBy', 'metadata', 'relatedAttachmentIds']) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }
  if (updates.attachmentKind) {
    assertValidKind(updates.attachmentKind);
    patch.attachmentKind = updates.attachmentKind;
  }
  await row.update(patch);
  return row.toJSON();
}

async function deleteAttachment(id) {
  const row = await RfpAttachment.findByPk(id);
  if (!row) { const err = new Error(`Attachment ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.destroy();
  return { id, deleted: true };
}

async function listForPursuit(pursuitId, { kind = null } = {}) {
  const where = { pursuitId: Number(pursuitId) };
  if (kind) where.attachmentKind = kind;
  const rows = await RfpAttachment.findAll({
    where, order: [['attachment_kind', 'ASC'], ['version', 'DESC']], limit: 500,
  });
  return rows.map((r) => r.toJSON());
}

async function listForOpportunity(opportunityId) {
  const rows = await RfpAttachment.findAll({
    where: { opportunityId: Number(opportunityId) },
    order: [['attachment_kind', 'ASC'], ['version', 'DESC']], limit: 200,
  });
  return rows.map((r) => r.toJSON());
}

async function summarizeForPursuit(pursuitId) {
  const rows = await listForPursuit(pursuitId);
  const byKind = {};
  let expiringSoon = 0; let expired = 0;
  const now = Date.now();
  for (const r of rows) {
    byKind[r.attachmentKind] = (byKind[r.attachmentKind] || 0) + 1;
    if (r.expiresAt) {
      const ms = new Date(r.expiresAt).getTime() - now;
      if (ms < 0) expired += 1;
      else if (ms < 30 * 86400_000) expiringSoon += 1;
    }
  }
  return {
    pursuit_id: Number(pursuitId),
    total: rows.length,
    by_kind: byKind,
    expiring_soon: expiringSoon,
    expired,
    has_rfp: (byKind.rfp || 0) > 0,
    has_amendments: (byKind.amendment || 0) > 0,
  };
}

// Detect attachments that are present in the kind-set we expect for a
// well-prepared pursuit (rfp + at least one supporting doc). Returns the
// kinds that are missing.
function detectMissingKinds(summary, expected = ['rfp', 'attachment']) {
  const have = new Set(Object.keys(summary.by_kind || {}));
  return expected.filter((k) => !have.has(k));
}

module.exports = {
  VALID_KINDS,
  addAttachment, updateAttachment, deleteAttachment,
  listForPursuit, listForOpportunity,
  summarizeForPursuit, detectMissingKinds,
};
