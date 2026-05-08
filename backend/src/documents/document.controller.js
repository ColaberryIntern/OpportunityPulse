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
    type_generatable: types.isGeneratable(data.type),
    name: data.name,
    mime: data.mime,
    size_bytes: data.sizeBytes ?? data.size_bytes,
    version: data.version,
    metadata: data.metadata || {},
    expires_at: data.expiresAt || data.expires_at,
    uploaded_by: data.uploadedBy ?? data.uploaded_by,
    is_active: data.isActive ?? data.is_active,
    scope: data.scope || 'global',
    scope_id: data.scopeId ?? data.scope_id ?? null,
    lineage_id: data.lineageId ?? data.lineage_id ?? null,
    source: data.source || 'manual',
    created_at: data.createdAt || data.created_at,
    updated_at: data.updatedAt || data.updated_at,
  };
}

async function listTypes(req, res) {
  return successResponse(res, { types: types.TYPES });
}

// v0.3 — list which document types are AI-generatable (vs must-be-obtained).
// Used by the Generate button gating on the readiness panel.
async function listGeneratableTypes(req, res) {
  return successResponse(res, {
    generatable_keys: types.getGeneratableKeys(),
    types: types.TYPES.filter((t) => t.generatable),
  });
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
    const scope = String(req.body.scope || 'global').trim();
    const scopeId = req.body.scope_id ? String(req.body.scope_id).trim() : null;
    if (!['global', 'bid'].includes(scope)) {
      return errorResponse(res, "scope must be 'global' or 'bid'", 400);
    }
    if (scope === 'bid' && !scopeId) {
      return errorResponse(res, 'scope_id is required when scope=bid', 400);
    }
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
      scope,
      scopeId,
      source: 'manual',
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
      scope: req.query.scope || undefined,
      scopeId: req.query.scope_id || undefined,
      source: req.query.source || undefined,
      expiringWithinDays: req.query.expiring_within ? Number(req.query.expiring_within) : undefined,
      includeInactive: String(req.query.include_inactive || '').toLowerCase() === 'true',
    });
    return successResponse(res, { documents: rows.map(shape), count: rows.length });
  } catch (e) {
    logger.error('documents.list failed', { error: e.message });
    return errorResponse(res, 'Failed to load documents: ' + e.message, 500);
  }
}

// v0.3: AI-driven generation. Body: { type, bonfire_opportunity_id }.
// Creates TWO Document rows (local + global) sharing a lineage_id.
async function generateDocumentHandler(req, res) {
  try {
    const userId = req.user && req.user.id;
    const orgId = req.user && req.user.organizationId
      ? req.user.organizationId
      : await profileSvc.resolveOrgId(userId);
    const type = String(req.body.type || '').trim();
    const bonfireOpportunityId = req.body.bonfire_opportunity_id
      ? String(req.body.bonfire_opportunity_id).trim()
      : null;
    if (!type) return errorResponse(res, 'type is required', 400);

    // eslint-disable-next-line global-require
    const generator = require('./documentGenerator.service');
    const out = await generator.generateDocument({
      type, organizationId: orgId, bonfireOpportunityId, userId,
    });
    return successResponse(res, {
      type: out.type,
      lineage_id: out.lineage_id,
      bonfire_opportunity_id: out.bonfire_opportunity_id,
      local: shape(out.local),
      global: shape(out.global),
      model_used: out.model_used,
      chars: out.chars,
    }, 'Document generated', 201);
  } catch (e) {
    if (e.code === 'NOT_GENERATABLE') return errorResponse(res, e.message, 400);
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    if (e.code === 'AI_FAILED') return errorResponse(res, e.message, 502);
    logger.error('documents.generate failed', { error: e.message, stack: e.stack });
    return errorResponse(res, 'Generation failed: ' + e.message, 500);
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
  listTypes,
  listGeneratableTypes,
  uploadDocument,
  listDocuments,
  downloadDocument,
  deleteDocument,
  generateDocumentHandler,
  shape,
};
