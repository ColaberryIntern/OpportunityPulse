// Submission Readiness Engine v0.1 — document controller.
//
// Endpoints (all admin-only via the route layer):
//   POST   /api/v1/documents             upload a single file (multer field "file")
//   GET    /api/v1/documents             list (filter ?type=X, ?expiring_within=30)
//   GET    /api/v1/documents/types       canonical document types (label + platforms)
//   GET    /api/v1/documents/:id/download stream the file
//   DELETE /api/v1/documents/:id         soft-delete (mark inactive)

const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const docSvc = require('./document.service');
const types = require('./documentTypes');
const profileSvc = require('../oied/profile.service');

function shape(row) {
  if (!row) return null;
  const data = row.toJSON ? row.toJSON() : row;
  return {
    id: data.id,
    organization_id: data.organizationId || data.organization_id,
    type: data.type,
    type_label: types.labelFor(data.type),
    name: data.name,
    mime: data.mime,
    size_bytes: data.sizeBytes ?? data.size_bytes,
    version: data.version,
    metadata: data.metadata || {},
    expires_at: data.expiresAt || data.expires_at,
    uploaded_by: data.uploadedBy ?? data.uploaded_by,
    is_active: data.isActive ?? data.is_active,
    created_at: data.createdAt || data.created_at,
    updated_at: data.updatedAt || data.updated_at,
  };
}

async function listTypes(req, res) {
  return successResponse(res, { types: types.TYPES });
}

async function uploadDocument(req, res) {
  try {
    if (!req.file) return errorResponse(res, 'No file uploaded (field "file")', 400);
    const userId = req.user && req.user.id;
    const orgId = req.user && req.user.organizationId
      ? req.user.organizationId
      : await profileSvc.resolveOrgId(userId);
    const type = String(req.body.type || '').trim();
    if (!types.isValidType(type)) {
      return errorResponse(res, `Invalid document type. Allowed: ${types.TYPE_KEYS.join(', ')}`, 400);
    }
    const name = String(req.body.name || req.file.originalname || 'Untitled').trim().slice(0, 300);
    let metadata = {};
    if (req.body.metadata) {
      try { metadata = typeof req.body.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body.metadata; }
      catch (_) { metadata = {}; }
    }
    const expiresAt = req.body.expires_at ? new Date(req.body.expires_at) : null;
    const row = await docSvc.createDocument({
      organizationId: orgId,
      type,
      name,
      mime: req.file.mimetype,
      buffer: req.file.buffer,
      metadata,
      expiresAt,
      uploadedBy: userId,
      originalName: req.file.originalname,
    });
    return successResponse(res, shape(row), 'Document uploaded', 201);
  } catch (e) {
    if (e.code === 'INVALID_TYPE') return errorResponse(res, e.message, 400);
    logger.error('documents.upload failed', { error: e.message, stack: e.stack });
    return errorResponse(res, 'Upload failed: ' + e.message, 500);
  }
}

async function listDocuments(req, res) {
  try {
    const userId = req.user && req.user.id;
    const orgId = req.user && req.user.organizationId
      ? req.user.organizationId
      : await profileSvc.resolveOrgId(userId);
    const rows = await docSvc.listDocuments({
      organizationId: orgId,
      type: req.query.type || undefined,
      expiringWithinDays: req.query.expiring_within ? Number(req.query.expiring_within) : undefined,
      includeInactive: String(req.query.include_inactive || '').toLowerCase() === 'true',
    });
    return successResponse(res, { documents: rows.map(shape), count: rows.length });
  } catch (e) {
    logger.error('documents.list failed', { error: e.message });
    return errorResponse(res, 'Failed to load documents: ' + e.message, 500);
  }
}

async function downloadDocument(req, res) {
  try {
    const userId = req.user && req.user.id;
    const orgId = req.user && req.user.organizationId
      ? req.user.organizationId
      : await profileSvc.resolveOrgId(userId);
    const out = await docSvc.streamFor({ organizationId: orgId, id: req.params.id });
    if (!out) return errorResponse(res, 'Document not found', 404);
    res.set('Content-Type', out.row.mime || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(out.row.name)}"`);
    return out.stream.pipe(res);
  } catch (e) {
    logger.error('documents.download failed', { error: e.message });
    return errorResponse(res, 'Download failed: ' + e.message, 500);
  }
}

async function deleteDocument(req, res) {
  try {
    const userId = req.user && req.user.id;
    const orgId = req.user && req.user.organizationId
      ? req.user.organizationId
      : await profileSvc.resolveOrgId(userId);
    const row = await docSvc.softDeleteDocument({ organizationId: orgId, id: req.params.id });
    if (!row) return errorResponse(res, 'Document not found', 404);
    return successResponse(res, { id: row.id, is_active: row.isActive }, 'Document deactivated');
  } catch (e) {
    logger.error('documents.delete failed', { error: e.message });
    return errorResponse(res, 'Delete failed: ' + e.message, 500);
  }
}

module.exports = {
  listTypes, uploadDocument, listDocuments, downloadDocument, deleteDocument, shape,
};
