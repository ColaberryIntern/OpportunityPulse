// Submission Readiness Engine v0.1 — document service.
//
// Thin Sequelize layer over the documents table. Storage I/O lives in
// storage.adapter; this module is the SQL gate.

const { Op } = require('sequelize');
const { Document } = require('../models');
const storage = require('./storage.adapter');
const types = require('./documentTypes');
const logger = require('../logging/logger');

async function createDocument({
  organizationId, type, name, mime, buffer, metadata, expiresAt, uploadedBy, originalName,
  scope = 'global', scopeId = null, source = 'manual', lineageId = null,
}) {
  if (!types.isValidType(type)) {
    const err = new Error(`Unknown document type: ${type}`);
    err.code = 'INVALID_TYPE';
    throw err;
  }
  const written = await storage.writeBuffer({
    organizationId, type, originalName: originalName || name, buffer,
  });
  // Auto-bump version: latest version for the same (org, type, name, scope) + 1
  const latest = await Document.findOne({
    where: { organizationId, type, name, scope, ...(scopeId ? { scopeId } : {}) },
    order: [['version', 'DESC']],
    attributes: ['version'],
  });
  const version = latest ? Number(latest.version) + 1 : 1;
  const row = await Document.create({
    organizationId,
    type,
    name,
    filePath: written.filePath,
    mime: mime || null,
    sizeBytes: written.sizeBytes,
    version,
    metadata: metadata || {},
    expiresAt: expiresAt || null,
    uploadedBy: uploadedBy || null,
    isActive: true,
    scope,
    scopeId: scope === 'bid' ? scopeId : null,
    lineageId,
    source,
  });
  return row;
}

async function listDocuments({
  organizationId, type, includeInactive = false, expiringWithinDays,
  scope, scopeId, source,
} = {}) {
  const where = { organizationId };
  if (!includeInactive) where.isActive = true;
  if (type) where.type = type;
  if (scope) where.scope = scope;
  if (scopeId) where.scopeId = scopeId;
  if (source) where.source = source;
  if (expiringWithinDays) {
    const cutoff = new Date(Date.now() + Number(expiringWithinDays) * 86_400_000);
    where.expiresAt = { [Op.lte]: cutoff, [Op.ne]: null };
  }
  const rows = await Document.findAll({
    where,
    order: [['type', 'ASC'], ['name', 'ASC'], ['version', 'DESC']],
  });
  return rows;
}

async function getDocumentById({ organizationId, id }) {
  return Document.findOne({ where: { id, organizationId } });
}

async function softDeleteDocument({ organizationId, id }) {
  const row = await Document.findOne({ where: { id, organizationId } });
  if (!row) return null;
  row.isActive = false;
  await row.save();
  return row;
}

// Most-recent active doc per type for an org. v0.3 scope-aware: when a
// `bonfireOpportunityId` is provided, local docs (scope='bid' AND
// scopeId=that opp) take precedence over global docs of the same type.
// Returned entry carries `scope` so the UI can label "📌 this bid" vs
// "🌐 vault."
async function activeTypeMap({ organizationId, bonfireOpportunityId = null } = {}) {
  // Pull local-for-this-bid AND globals in one query.
  const where = {
    organizationId,
    isActive: true,
    [Op.or]: bonfireOpportunityId
      ? [{ scope: 'global' }, { scope: 'bid', scopeId: String(bonfireOpportunityId) }]
      : [{ scope: 'global' }],
  };
  const rows = await Document.findAll({
    where,
    attributes: ['type', 'id', 'name', 'expiresAt', 'version', 'updatedAt', 'scope', 'scopeId', 'source', 'lineageId'],
    // Order: bid-scope first so the dedupe loop picks bid before global.
    // Then by version DESC inside each scope.
    order: [
      [require('sequelize').literal(`CASE WHEN scope = 'bid' THEN 0 ELSE 1 END`), 'ASC'],
      ['type', 'ASC'],
      ['version', 'DESC'],
    ],
  });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.type)) {
      map.set(r.type, {
        type: r.type,
        id: r.id,
        name: r.name,
        expires_at: r.expiresAt,
        version: r.version,
        updated_at: r.updatedAt,
        scope: r.scope,
        scope_id: r.scopeId,
        source: r.source,
        lineage_id: r.lineageId,
      });
    }
  }
  return map;
}

async function streamFor({ organizationId, id }) {
  const row = await Document.findOne({ where: { id, organizationId, isActive: true } });
  if (!row) return null;
  const stream = storage.readStream(row.filePath);
  return { row, stream };
}

module.exports = {
  createDocument,
  listDocuments,
  getDocumentById,
  softDeleteDocument,
  activeTypeMap,
  streamFor,
};
