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
}) {
  if (!types.isValidType(type)) {
    const err = new Error(`Unknown document type: ${type}`);
    err.code = 'INVALID_TYPE';
    throw err;
  }
  const written = await storage.writeBuffer({
    organizationId, type, originalName: originalName || name, buffer,
  });
  // Auto-bump version: latest version for the same (org, type, name) + 1
  const latest = await Document.findOne({
    where: { organizationId, type, name },
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
  });
  return row;
}

async function listDocuments({
  organizationId, type, includeInactive = false, expiringWithinDays,
} = {}) {
  const where = { organizationId };
  if (!includeInactive) where.isActive = true;
  if (type) where.type = type;
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

// Counts of the most-recent active doc per (type) for an org. Used by
// the readiness service to decide which document types are "on file."
async function activeTypeMap({ organizationId }) {
  const rows = await Document.findAll({
    where: { organizationId, isActive: true },
    attributes: ['type', 'id', 'name', 'expiresAt', 'version', 'updatedAt'],
    order: [['type', 'ASC'], ['version', 'DESC']],
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
