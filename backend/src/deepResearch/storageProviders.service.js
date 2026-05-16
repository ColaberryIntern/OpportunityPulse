// Deep Research Phase 11 — real storage provider adapters.
//
// Wraps the Phase 10 url_only-only storage layer with real S3 / MinIO /
// local-disk adapters. The Phase 10 storage.service registers the metadata
// row; this service is the actual byte-handling layer.
//
// Backwards compatibility: when no provider is configured, falls back to
// the Phase 10 url_only flow with zero behavior change.
//
// IMPORTANT: this module loads the AWS SDK lazily so the dependency isn't
// required for environments running in url_only mode.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { StorageAsset } = require('../models');
const logger = require('../logging/logger');
const auditTrail = require('./auditTrail.service');

const SUPPORTED_PROVIDERS = ['s3', 'minio', 'local', 'url_only'];

function configuredProvider() {
  const p = String(process.env.DEEP_RESEARCH_STORAGE_PROVIDER || 'url_only').toLowerCase();
  return SUPPORTED_PROVIDERS.includes(p) ? p : 'url_only';
}

function localRoot() {
  return process.env.DEEP_RESEARCH_LOCAL_STORAGE_ROOT || '/tmp/op-storage';
}

// Lazily resolve the S3 client (Phase 11: aws-sdk may or may not be in
// node_modules — never crash a request just because it's missing).
function loadS3Client() {
  try {
    // eslint-disable-next-line global-require
    const AWS = require('aws-sdk');
    const config = {
      region: process.env.AWS_REGION || 'us-east-1',
    };
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      config.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      config.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    }
    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
      config.s3ForcePathStyle = true;
    }
    return new AWS.S3(config);
  } catch (e) {
    logger.warn('storageProviders: aws-sdk not available — S3/MinIO disabled', { error: e.message });
    return null;
  }
}

// Upload bytes for an asset. Provider-dispatched. Soft-fails for url_only.
async function uploadBytes(asset, buffer, { contentType = null } = {}) {
  const provider = configuredProvider();
  switch (provider) {
    case 's3':
    case 'minio': {
      const s3 = loadS3Client();
      if (!s3) throw new Error('S3 client unavailable');
      const bucket = asset.bucket || process.env.DEEP_RESEARCH_STORAGE_BUCKET;
      if (!bucket) throw new Error('No bucket configured');
      await s3.putObject({
        Bucket: bucket, Key: asset.key, Body: buffer,
        ContentType: contentType || asset.mimeType || 'application/octet-stream',
        ServerSideEncryption: process.env.S3_SSE || undefined,
      }).promise();
      return { provider, bucket, key: asset.key, bytes: buffer.length };
    }
    case 'local': {
      const root = localRoot();
      const fullPath = path.join(root, asset.key);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, buffer);
      return { provider, path: fullPath, bytes: buffer.length };
    }
    case 'url_only':
    default:
      return { provider, skipped: true, reason: 'url_only mode' };
  }
}

async function downloadBytes(asset) {
  const provider = configuredProvider();
  switch (provider) {
    case 's3':
    case 'minio': {
      const s3 = loadS3Client();
      if (!s3) throw new Error('S3 client unavailable');
      const bucket = asset.bucket || process.env.DEEP_RESEARCH_STORAGE_BUCKET;
      const res = await s3.getObject({ Bucket: bucket, Key: asset.key }).promise();
      return res.Body;
    }
    case 'local': {
      const root = localRoot();
      const fullPath = path.join(root, asset.key);
      if (!fs.existsSync(fullPath)) throw new Error('File not found');
      return fs.readFileSync(fullPath);
    }
    case 'url_only':
    default:
      return null;
  }
}

// Provider-aware signed URL. Falls back to content_ref for url_only.
async function signedUrl(asset, { expiresSeconds = 900 } = {}) {
  const provider = configuredProvider();
  switch (provider) {
    case 's3':
    case 'minio': {
      const s3 = loadS3Client();
      if (!s3) return asset.contentRef || null;
      const bucket = asset.bucket || process.env.DEEP_RESEARCH_STORAGE_BUCKET;
      if (!bucket) return asset.contentRef || null;
      return s3.getSignedUrlPromise('getObject', {
        Bucket: bucket, Key: asset.key,
        Expires: Math.min(86400, Math.max(60, Number(expiresSeconds) || 900)),
      });
    }
    case 'local': {
      const token = crypto.randomBytes(16).toString('hex');
      return `/api/v1/deep-research/storage-assets/${asset.id}/download?token=${token}`;
    }
    case 'url_only':
    default:
      return asset.contentRef || null;
  }
}

// Delete bytes (provider-aware). Soft-fails — never throws so the metadata
// row deletion can proceed regardless.
async function deleteBytes(asset) {
  const provider = configuredProvider();
  try {
    switch (provider) {
      case 's3':
      case 'minio': {
        const s3 = loadS3Client();
        if (!s3) return { skipped: true };
        const bucket = asset.bucket || process.env.DEEP_RESEARCH_STORAGE_BUCKET;
        await s3.deleteObject({ Bucket: bucket, Key: asset.key }).promise();
        return { provider, deleted: true };
      }
      case 'local': {
        const root = localRoot();
        const fullPath = path.join(root, asset.key);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        return { provider, deleted: true };
      }
      case 'url_only':
      default:
        return { provider, skipped: true };
    }
  } catch (e) {
    logger.warn('storageProviders.deleteBytes failed', { error: e.message });
    return { provider, error: e.message };
  }
}

// One-shot "migrate any url_only asset that has no bucket/key yet to the
// configured provider". Reports rows-to-migrate without actually copying
// bytes — actual blob migration is a manual / one-off operation.
async function migrationStatus({ organizationId = null } = {}) {
  const provider = configuredProvider();
  const totalAssets = await StorageAsset.count();
  const urlOnlyAssets = await StorageAsset.count({
    where: { [Op.or]: [{ key: { [Op.like]: 'external:%' } }, { provider: 'url_only' }] },
  });
  return {
    active_provider: provider,
    total_assets: totalAssets,
    url_only_assets: urlOnlyAssets,
    needs_migration: provider !== 'url_only' && urlOnlyAssets > 0,
    organization_id: organizationId,
  };
}

// Provider-aware health check.
async function providerHealth() {
  const provider = configuredProvider();
  const out = { provider, healthy: false, last_checked: new Date().toISOString() };
  try {
    if (provider === 's3' || provider === 'minio') {
      const s3 = loadS3Client();
      out.healthy = Boolean(s3);
      out.bucket = process.env.DEEP_RESEARCH_STORAGE_BUCKET || null;
    } else if (provider === 'local') {
      const root = localRoot();
      out.healthy = true;
      out.local_root = root;
      out.exists = fs.existsSync(root);
    } else {
      out.healthy = true;
      out.note = 'url_only mode — metadata-only';
    }
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

module.exports = {
  SUPPORTED_PROVIDERS, configuredProvider,
  uploadBytes, downloadBytes, signedUrl, deleteBytes,
  migrationStatus, providerHealth,
};
