// Deep Research Phase 10 — file storage layer.
//
// Provider abstraction over S3 / MinIO / local-disk with a default
// "url_only" mode for environments without blob storage configured.
// All real I/O is gated through provider adapters so the rest of the
// platform can register a StorageAsset without caring which backend.
//
// v1: registry-only when no provider is configured. The adapter surface
// is here so Phase 11 can plug a real S3 client into one place.
//
// MEASURE-ONLY at this layer. No auto-uploads, no auto-deletes.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { StorageAsset } = require('../models');
const logger = require('../logging/logger');

const VALID_PROVIDERS = ['local', 's3', 'minio', 'url_only'];
const VALID_KINDS = [
  'rfp_attachment', 'proposal_artifact', 'submission_package',
  'staffing_doc', 'compliance_doc', 'other',
];
const VALID_VISIBILITY = ['admin', 'org', 'pursuit'];

const MAX_SIZE_BYTES = Number(process.env.DEEP_RESEARCH_STORAGE_MAX_SIZE) || 50 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = (
  process.env.DEEP_RESEARCH_STORAGE_ALLOWED_MIME
  || 'application/,text/,image/'
).split(',').map((s) => s.trim()).filter(Boolean);

function activeProvider() {
  const p = String(process.env.DEEP_RESEARCH_STORAGE_PROVIDER || 'url_only').toLowerCase();
  return VALID_PROVIDERS.includes(p) ? p : 'url_only';
}

function isMimeAllowed(mime) {
  if (!mime) return true; // metadata-only registration without mime is fine
  return ALLOWED_MIME_PREFIXES.some((p) => String(mime).toLowerCase().startsWith(p));
}

function newKey({ assetKind, filename }) {
  const ext = filename && filename.includes('.')
    ? filename.split('.').pop().slice(0, 12) : 'bin';
  return `${assetKind}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

// Register a storage asset. Does NOT upload bytes — that's the provider
// adapter's job. v1 just records the metadata + content_ref pointer so
// the existing rfp_attachments / proposal_artifacts surfaces can link to
// storage_assets rows uniformly.
async function registerAsset({
  assetKind, filename = null, mimeType = null, sizeBytes = null,
  bucket = null, key = null, contentRef = null,
  visibility = 'admin', retentionDays = null,
  pursuitId = null, rfpAttachmentId = null,
  proposalArtifactId = null, submissionPackageId = null,
  uploadedBy = null, metadata = {},
} = {}) {
  if (!VALID_KINDS.includes(assetKind)) {
    const err = new Error(`Invalid asset_kind: ${assetKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  if (!VALID_VISIBILITY.includes(visibility)) {
    const err = new Error(`Invalid visibility: ${visibility}`); err.code = 'BAD_INPUT'; throw err;
  }
  if (sizeBytes != null && Number(sizeBytes) > MAX_SIZE_BYTES) {
    const err = new Error(`Size ${sizeBytes} exceeds max ${MAX_SIZE_BYTES}`);
    err.code = 'BAD_INPUT'; throw err;
  }
  if (!isMimeAllowed(mimeType)) {
    const err = new Error(`MIME type ${mimeType} not allowed`); err.code = 'BAD_INPUT'; throw err;
  }
  const provider = activeProvider();
  const finalKey = key || (contentRef ? `external:${contentRef.slice(0, 200)}` : newKey({ assetKind, filename }));
  const finalBucket = bucket
    || process.env.DEEP_RESEARCH_STORAGE_BUCKET
    || (provider === 'local' ? 'local-disk' : null);
  let expiresAt = null;
  if (retentionDays != null && Number(retentionDays) > 0) {
    expiresAt = new Date(Date.now() + Number(retentionDays) * 86400_000);
  }
  const row = await StorageAsset.create({
    assetKind, provider,
    bucket: finalBucket, key: finalKey,
    filename, mimeType, sizeBytes,
    visibility, retentionDays, expiresAt,
    pursuitId, rfpAttachmentId, proposalArtifactId, submissionPackageId,
    uploadedBy,
    metadata: { ...metadata, content_ref: contentRef },
  });
  return row.toJSON();
}

// Compute a signed-URL placeholder. Real S3/MinIO adapters will swap this
// for a presigned URL call. Default ("url_only") returns the original
// content_ref so callers can still link out.
async function signedUrl(assetId, { expiresInSeconds = 900 } = {}) {
  const row = await StorageAsset.findByPk(assetId);
  if (!row) { const err = new Error(`Asset ${assetId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const provider = row.provider || activeProvider();
  if (provider === 'url_only' || provider === 'local') {
    const ref = row.metadata && row.metadata.content_ref;
    return {
      url: ref || null,
      provider,
      expires_in: expiresInSeconds,
      note: provider === 'url_only'
        ? 'url_only mode — returning original content_ref'
        : 'local mode — adapter not implemented in v1',
    };
  }
  // s3 / minio: callers should wire a real presigner here.
  return {
    url: null,
    provider,
    expires_in: expiresInSeconds,
    note: `${provider} adapter not yet implemented (Phase 11)`,
  };
}

async function getAsset(id) {
  const row = await StorageAsset.findByPk(id);
  return row ? row.toJSON() : null;
}

async function listAssets({
  assetKind = null, pursuitId = null, limit = 100,
} = {}) {
  const where = {};
  if (assetKind) where.assetKind = assetKind;
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  const rows = await StorageAsset.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function deleteAsset(id) {
  const row = await StorageAsset.findByPk(id);
  if (!row) { const err = new Error(`Asset ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.destroy();
  return { id, deleted: true };
}

// Health snapshot for the Capture Infra dashboard.
async function getStorageHealth() {
  const [total, withRetention, expired] = await Promise.all([
    StorageAsset.count(),
    StorageAsset.count({ where: { retentionDays: { [Op.ne]: null } } }),
    StorageAsset.count({ where: { expiresAt: { [Op.lt]: new Date() } } }),
  ]);
  return {
    provider: activeProvider(),
    total, with_retention: withRetention, expired,
    max_size_bytes: MAX_SIZE_BYTES,
    allowed_mime_prefixes: ALLOWED_MIME_PREFIXES,
  };
}

module.exports = {
  VALID_PROVIDERS, VALID_KINDS, VALID_VISIBILITY,
  MAX_SIZE_BYTES, ALLOWED_MIME_PREFIXES,
  activeProvider, isMimeAllowed, newKey,
  registerAsset, signedUrl, getAsset, listAssets, deleteAsset,
  getStorageHealth,
};
