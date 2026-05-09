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

// v0.6 Phase 6: lazy text extraction + cache. When the proposal generator
// (or any caller) needs the parsed text of a vault doc, read it on first
// access via pdf-parse / mammoth / utf8 and stash the result on
// metadata.extracted_text. Subsequent calls hit the cache. Returns null
// on failure so callers can skip uncovered types gracefully.
async function getOrExtractText(doc) {
  if (!doc) return null;
  const md = doc.metadata || {};
  if (md.extracted_text && md.extracted_at) return String(md.extracted_text);
  let text = null;
  try {
    const abs = storage.absolutePathFor(doc.filePath);
    const fs = require('fs');
    if (!fs.existsSync(abs)) return null;
    const mime = String(doc.mime || '').toLowerCase();
    if (mime === 'application/pdf' || /\.pdf$/i.test(doc.filePath)) {
      // eslint-disable-next-line global-require
      const { extractPdfText } = require('../utils/pdfText');
      const buf = fs.readFileSync(abs);
      const out = await extractPdfText(buf);
      text = out.replace(/\s+\n/g, '\n').trim();
    } else if (/wordprocessingml|msword/.test(mime) || /\.docx?$/i.test(doc.filePath)) {
      // eslint-disable-next-line global-require
      const mammoth = require('mammoth');
      const out = await mammoth.extractRawText({ path: abs });
      text = String(out.value || '').trim();
    } else if (mime === 'text/markdown' || mime === 'text/plain' || /\.(md|txt)$/i.test(doc.filePath)) {
      text = fs.readFileSync(abs, 'utf8').slice(0, 200_000);
    }
  } catch (e) {
    logger.warn('document.getOrExtractText failed', { id: doc.id, error: e.message });
    return null;
  }
  if (!text) return null;
  // Cache on the row.
  doc.metadata = Object.assign({}, doc.metadata || {}, {
    extracted_text: text.slice(0, 200_000),
    extracted_at: new Date().toISOString(),
  });
  // Sequelize JSONB needs an explicit changed() flag.
  if (typeof doc.changed === 'function') doc.changed('metadata', true);
  await doc.save().catch((e) => logger.warn('document: cache extraction skipped', { error: e.message }));
  return text;
}

// Returns up to N excerpts from active vault docs of the requested types,
// capped per-doc and total to fit a prompt window. Local-to-bid takes
// precedence over global on dedupe by type.
async function loadVaultExcerpts({
  organizationId, types: typeList = [], bonfireOpportunityId = null,
  capPerDoc = 2000, capTotal = 10000,
}) {
  if (!Array.isArray(typeList) || typeList.length === 0) return [];
  const where = {
    organizationId,
    isActive: true,
    type: { [Op.in]: typeList },
    [Op.or]: bonfireOpportunityId
      ? [{ scope: 'global' }, { scope: 'bid', scopeId: String(bonfireOpportunityId) }]
      : [{ scope: 'global' }],
  };
  const rows = await Document.findAll({
    where,
    order: [
      [require('sequelize').literal(`CASE WHEN scope = 'bid' THEN 0 ELSE 1 END`), 'ASC'],
      ['type', 'ASC'],
      ['version', 'DESC'],
    ],
  });
  // Dedupe per type — bid scope wins.
  const seen = new Set();
  const picks = [];
  for (const r of rows) {
    if (seen.has(r.type)) continue;
    seen.add(r.type);
    picks.push(r);
  }

  const out = [];
  let totalChars = 0;
  for (const doc of picks) {
    const remaining = capTotal - totalChars;
    if (remaining <= 200) break;
    // eslint-disable-next-line no-await-in-loop
    const text = await getOrExtractText(doc);
    if (!text) continue;
    const slice = text.slice(0, Math.min(capPerDoc, remaining));
    totalChars += slice.length;
    out.push({
      id: doc.id, type: doc.type, name: doc.name, scope: doc.scope, text: slice,
    });
  }
  return out;
}

module.exports = {
  createDocument,
  listDocuments,
  getDocumentById,
  softDeleteDocument,
  activeTypeMap,
  streamFor,
  getOrExtractText,
  loadVaultExcerpts,
};
