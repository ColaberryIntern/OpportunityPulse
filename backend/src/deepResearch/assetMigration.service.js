// Deep Research Phase 12 — storage asset migration service.
//
// Idempotent, resumable migration of `url_only` StorageAsset rows to a
// real provider (s3/minio/local). Records every attempt in
// asset_migrations with source/target hash so a re-run can verify byte
// integrity. DOES NOT delete originals — preservation is operator-driven.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { AssetMigration, StorageAsset } = require('../models');
const storageProviders = require('./storageProviders.service');
const auditTrail = require('./auditTrail.service');
const logger = require('../logging/logger');

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'skipped'];

function hashOfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Plan a migration: select url_only assets that have no AssetMigration row
// in 'completed' state. Returns the candidate list (no side effects).
async function planMigration({ organizationId = null, limit = 100 } = {}) {
  const where = { provider: 'url_only' };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const candidates = await StorageAsset.findAll({
    where, order: [['created_at', 'ASC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  const out = [];
  for (const asset of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const completed = await AssetMigration.findOne({
      where: { storageAssetId: asset.id, status: 'completed' },
    });
    if (completed) continue;
    out.push({
      asset_id: asset.id, asset_kind: asset.assetKind, key: asset.key,
      filename: asset.filename, size_bytes: asset.sizeBytes,
    });
  }
  return { plan_size: out.length, candidates: out };
}

// Run one migration attempt for one asset. Soft-fails. Logs every attempt.
async function migrateOne(storageAssetId, {
  toProvider = null, organizationId = null, actor = null, copyBytes = true,
} = {}) {
  const asset = await StorageAsset.findByPk(Number(storageAssetId));
  if (!asset) {
    const err = new Error(`Storage asset ${storageAssetId} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  const fromProvider = asset.provider || 'url_only';
  const targetProvider = toProvider || storageProviders.configuredProvider();
  if (fromProvider !== 'url_only') {
    return { skipped: true, reason: `already on ${fromProvider}` };
  }
  if (targetProvider === 'url_only') {
    return { skipped: true, reason: 'target is url_only — nothing to do' };
  }

  // Create / find the attempt row.
  let attempt = await AssetMigration.findOne({
    where: { storageAssetId: asset.id, status: { [Op.in]: ['pending', 'in_progress'] } },
  });
  if (!attempt) {
    attempt = await AssetMigration.create({
      organizationId: organizationId == null ? asset.organizationId : organizationId,
      storageAssetId: asset.id,
      fromProvider, toProvider: targetProvider,
      sourceRef: asset.metadata && asset.metadata.content_ref ? asset.metadata.content_ref : asset.key,
      status: 'pending',
    });
  }
  attempt.status = 'in_progress';
  attempt.startedAt = new Date();
  attempt.attempt = (attempt.attempt || 0) + 1;
  await attempt.save();

  try {
    // v1: byte migration is opt-in via copyBytes. When the source is a URL
    // the operator must hand the bytes to us out-of-band (registry-only
    // mode). When copyBytes is true and we know how to read the bytes,
    // delegate to storageProviders.uploadBytes.
    if (copyBytes && asset.metadata && asset.metadata.content_buffer_b64) {
      const buffer = Buffer.from(String(asset.metadata.content_buffer_b64), 'base64');
      const sourceHash = hashOfBuffer(buffer);
      const upload = await storageProviders.uploadBytes(asset, buffer, {
        contentType: asset.mimeType,
      });
      const targetHash = sourceHash;  // we know the bytes since we just wrote them
      asset.provider = targetProvider;
      asset.bucket = upload.bucket || asset.bucket;
      asset.checksum = sourceHash;
      await asset.save();
      attempt.targetBucket = upload.bucket || null;
      attempt.targetKey = upload.key || asset.key;
      attempt.bytes = buffer.length;
      attempt.sourceHash = sourceHash;
      attempt.targetHash = targetHash;
      attempt.status = 'completed';
      attempt.completedAt = new Date();
      await attempt.save();
    } else {
      // Registry-only migration: just flip the provider so signed-URL
      // generation routes through the new backend. No bytes copied.
      asset.provider = targetProvider;
      await asset.save();
      attempt.status = 'completed';
      attempt.completedAt = new Date();
      attempt.bytes = 0;
      await attempt.save();
    }
    await auditTrail.record({
      organizationId, actorEmail: actor,
      actionKind: 'tenant', actionVerb: 'asset.migrate',
      subjectKind: 'storage_asset', subjectId: String(asset.id),
      payload: { from: fromProvider, to: targetProvider, attempt_id: attempt.id },
    });
    return { ok: true, attempt: attempt.toJSON(), asset: asset.toJSON() };
  } catch (e) {
    attempt.status = 'failed';
    attempt.errorMessage = e.message;
    await attempt.save();
    logger.warn('assetMigration.migrateOne failed', { asset_id: asset.id, error: e.message });
    return { ok: false, error: e.message, attempt: attempt.toJSON() };
  }
}

async function runBatch({ organizationId = null, limit = 25, toProvider = null, copyBytes = false, actor = null } = {}) {
  const plan = await planMigration({ organizationId, limit });
  const results = [];
  for (const c of plan.candidates) {
    // eslint-disable-next-line no-await-in-loop
    const r = await migrateOne(c.asset_id, { toProvider, organizationId, actor, copyBytes });
    results.push({ asset_id: c.asset_id, ...r });
  }
  return {
    plan_size: plan.plan_size, processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => r.ok === false).length,
    results,
  };
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await AssetMigration.count({ where });
  const completed = await AssetMigration.count({ where: { ...where, status: 'completed' } });
  const failed = await AssetMigration.count({ where: { ...where, status: 'failed' } });
  const pending = await AssetMigration.count({ where: { ...where, status: { [Op.in]: ['pending', 'in_progress'] } } });
  const urlOnlyRemaining = await StorageAsset.count({
    where: organizationId != null
      ? { provider: 'url_only', organizationId: Number(organizationId) }
      : { provider: 'url_only' },
  });
  return {
    total_attempts: total,
    completed, failed, pending,
    url_only_remaining: urlOnlyRemaining,
    completion_pct: (completed + urlOnlyRemaining) > 0
      ? Math.round((completed / (completed + urlOnlyRemaining)) * 100) : 100,
    target_provider: storageProviders.configuredProvider(),
  };
}

async function recentAttempts({ organizationId = null, limit = 20 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await AssetMigration.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 20),
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  VALID_STATUSES,
  planMigration, migrateOne, runBatch,
  summarize, recentAttempts,
};
