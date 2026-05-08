const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');
const service = require('./bonfire.service');
const readinessSvc = require('./bonfireReadiness.service');
const aiReqSvc = require('./bonfireAIRequirements.service');
const { redactForRole, redactListForRole } = require('./bonfire.util');
const { isBonfireEnabled } = require('./bonfire.middleware');

// Public-ish: used by frontend to decide whether to show the nav link.
function getFlag(req, res) {
  return successResponse(res, { enabled: isBonfireEnabled() });
}

async function listOpportunities(req, res) {
  try {
    const { rows, total } = await service.listOpportunities(req.query);
    const redacted = redactListForRole(rows, req.user);
    return paginatedResponse(res, redacted, {
      total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
  } catch (e) {
    logger.error('Bonfire list failed', { error: e.message });
    return errorResponse(res, 'Failed to list opportunities', 500);
  }
}

async function getOpportunity(req, res) {
  try {
    const row = await service.getOpportunity(req.params.id);
    if (!row) return errorResponse(res, 'Not found', 404);
    return successResponse(res, redactForRole(row, req.user));
  } catch (e) {
    logger.error('Bonfire get failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to fetch opportunity', 500);
  }
}

async function uploadFile(req, res) {
  if (!req.file) return errorResponse(res, 'No file uploaded (field: file)', 400);
  try {
    const mime = (req.file.mimetype || '').toLowerCase();
    const nameLower = (req.file.originalname || '').toLowerCase();
    let result;
    if (mime.includes('json') || nameLower.endsWith('.json')) {
      result = await service.ingestJsonBuffer(req.file.buffer);
    } else {
      // Default: parse as CSV (also handles text/plain with a .csv ext).
      result = await service.ingestCsvBuffer(req.file.buffer);
    }
    return successResponse(res, result, 'Upload processed');
  } catch (e) {
    logger.error('Bonfire upload (file) failed', { error: e.message });
    return errorResponse(res, 'Upload failed: ' + e.message, 400);
  }
}

async function uploadJson(req, res) {
  try {
    if (!Array.isArray(req.body)) {
      return errorResponse(res, 'Body must be a JSON array of opportunity objects', 400);
    }
    const result = await service.ingestJsonArray(req.body);
    return successResponse(res, result, 'Upload processed');
  } catch (e) {
    logger.error('Bonfire upload (json) failed', { error: e.message });
    return errorResponse(res, 'Upload failed: ' + e.message, 400);
  }
}

async function enrichOne(req, res) {
  try {
    const force = String(req.query.force || '') === 'true';
    const result = await service.enrichOne(req.params.id, { force });
    if (!result.ok) {
      const code = result.reason === 'not_found' ? 404 : 500;
      return errorResponse(res, `Enrich failed: ${result.reason}`, code);
    }
    const row = await service.getOpportunity(req.params.id);
    return successResponse(res, {
      skipped: !!result.skipped,
      opportunity: redactForRole(row, req.user),
    });
  } catch (e) {
    logger.error('Bonfire enrich-one failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Enrich failed', 500);
  }
}

async function enrichAll(req, res) {
  try {
    const force = String(req.query.force || '') === 'true';
    const summary = await service.enrichAllUnenriched({ force });
    // Redacted summary — don't leak per-row ids beyond what admin already sees.
    return res.status(202).json({
      status: 'success',
      message: 'Bulk enrich complete',
      code: 202,
      data: summary,
    });
  } catch (e) {
    logger.error('Bonfire enrich-all failed', { error: e.message });
    return errorResponse(res, 'Enrich-all failed', 500);
  }
}

async function generateStrategy(req, res) {
  try {
    const result = await service.generateStrategyForId(req.params.id);
    if (!result.ok) {
      const code = result.reason === 'not_found' ? 404 : 500;
      return errorResponse(res, `Strategy failed: ${result.reason}`, code);
    }
    const row = await service.getOpportunity(req.params.id);
    return successResponse(res, {
      strategy: result.strategy,
      opportunity: redactForRole(row, req.user),
    });
  } catch (e) {
    logger.error('Bonfire strategy failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Strategy failed', 500);
  }
}

// v0.1 Submission Readiness — per-bid checklist + completion %.
async function getReadiness(req, res) {
  try {
    const userId = req.user && req.user.id;
    const out = await readinessSvc.computeReadiness({
      opportunityId: req.params.id,
      organizationId: req.user && req.user.organizationId,
      userId,
    });
    return successResponse(res, out);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, 'Bonfire opportunity not found', 404);
    logger.error('Bonfire readiness failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to compute readiness: ' + e.message, 500);
  }
}

// Bulk-summary endpoint for the listing page progress bars.
// POST body { ids: [uuid, ...] } → { id: { completion_pct, satisfied, total, gaps } }
async function getReadinessSummaries(req, res) {
  try {
    const userId = req.user && req.user.id;
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length === 0) return successResponse(res, {});
    const out = await readinessSvc.computeReadinessSummaries({
      opportunityIds: ids,
      organizationId: req.user && req.user.organizationId,
      userId,
    });
    return successResponse(res, out);
  } catch (e) {
    logger.error('Bonfire readiness summaries failed', { error: e.message });
    return errorResponse(res, 'Failed to compute summaries: ' + e.message, 500);
  }
}

// v0.2 AI tailoring — runs Claude over the opp text to flag additional
// required documents beyond the v0.1 baseline. Cached on the row;
// pass { force: true } to regenerate.
async function tailorRequirements(req, res) {
  try {
    const force = !!(req.body && req.body.force === true);
    const out = await aiReqSvc.tailorRequirements({
      opportunityId: req.params.id,
      force,
    });
    return successResponse(res, out, force ? 'AI requirements regenerated' : 'AI requirements ready');
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, 'Bonfire opportunity not found', 404);
    logger.error('Bonfire AI tailor failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to tailor requirements: ' + e.message, 500);
  }
}

module.exports = {
  getFlag,
  listOpportunities,
  getOpportunity,
  uploadFile,
  uploadJson,
  enrichOne,
  enrichAll,
  generateStrategy,
  getReadiness,
  getReadinessSummaries,
  tailorRequirements,
};
