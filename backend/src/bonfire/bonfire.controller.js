const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');
const service = require('./bonfire.service');
const readinessSvc = require('./bonfireReadiness.service');
const aiReqSvc = require('./bonfireAIRequirements.service');
const attachmentFetcher = require('./attachmentFetcher.service');
const submissionPackage = require('./submissionPackage.service');
const pursuitSvc = require('./bonfirePursuit.service');
const manualUpload = require('./bonfireManualUpload.service');
const attachmentClassifier = require('./attachmentClassifier.service');
const portalScreenshot = require('./portalScreenshotExtractor.service');
const { BonfireOpportunity } = require('../models');
const fs = require('fs');
const { redactForRole, redactListForRole } = require('./bonfire.util');
const { isBonfireEnabled } = require('./bonfire.middleware');

// Public-ish: used by frontend to decide whether to show the nav link.
function getFlag(req, res) {
  return successResponse(res, { enabled: isBonfireEnabled() });
}

async function listOpportunities(req, res) {
  try {
    const { rows, total, clusterContext } = await service.listOpportunities(req.query);
    const redacted = redactListForRole(rows, req.user);
    // Default path uses the shared paginatedResponse so existing callers see
    // the unchanged { status, message, data, pagination, code } shape. When a
    // cluster drilldown is in play, append clusterContext as a top-level
    // sibling so the banner can render without a second API hit.
    if (clusterContext) {
      return res.status(200).json({
        status: 'success',
        message: 'Success',
        data: redacted,
        pagination: {
          total,
          limit: Number(req.query.limit) || 50,
          offset: Number(req.query.offset) || 0,
        },
        clusterContext,
        code: 200,
      });
    }
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

// v0.4: per-opp Bonfire detail-page attachment fetcher.
async function fetchAttachments(req, res) {
  try {
    const out = await attachmentFetcher.fetchOneBonfireOpp({
      bonfireOpportunityId: req.params.id,
    });
    return successResponse(res, out, 'Attachment fetch complete');
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    if (e.code === 'NO_SOURCE_URL') return errorResponse(res, e.message, 400);
    logger.error('Bonfire attachments fetch failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Attachment fetch failed: ' + e.message, 500);
  }
}

async function listAttachments(req, res) {
  try {
    const rows = await attachmentFetcher.listAttachments({
      bonfireOpportunityId: req.params.id,
    });
    // Pull the last-fetch summary so the panel can render an honest "blocked"
    // state on reload (Cloudflare blocks ~80% of Bonfire portals).
    const opp = await BonfireOpportunity.findByPk(req.params.id, {
      attributes: ['attachmentsFetchedAt', 'submissionRequirements'],
    });
    const sr = opp?.submissionRequirements || {};
    return successResponse(res, {
      bonfire_opportunity_id: req.params.id,
      count: rows.length,
      attachments_fetched_at: opp?.attachmentsFetchedAt || null,
      last_attachment_fetch: sr.last_attachment_fetch || null,
      attachments: rows.map((r) => ({
        id: r.id,
        name: r.name,
        mime: r.mime,
        size_bytes: r.sizeBytes,
        url_original: r.urlOriginal,
        downloaded_at: r.downloadedAt,
        has_parsed_text: !!r.parsedText,
        // v0.9 — classifier output (null for legacy rows that haven't been
        // classified; admin can run /reclassify-attachments to backfill).
        classification: r.metadata?.classification || null,
        classification_confidence: r.metadata?.classification_confidence || null,
        classification_reason: r.metadata?.classification_reason || null,
        fields: r.metadata?.fields || null,
        extracted_from_zip: r.metadata?.extracted_from_zip || null,
      })),
    });
  } catch (e) {
    logger.error('Bonfire attachments list failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to list attachments', 500);
  }
}

async function downloadAttachment(req, res) {
  try {
    const row = await attachmentFetcher.getAttachmentRow({
      bonfireOpportunityId: req.params.id,
      id: req.params.attachmentId,
    });
    if (!row) return errorResponse(res, 'Attachment not found', 404);
    const abs = attachmentFetcher.attachmentAbsolutePath(row.filePath);
    res.set('Content-Type', row.mime || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name)}"`);
    return fs.createReadStream(abs).pipe(res);
  } catch (e) {
    logger.error('Bonfire attachment download failed', { error: e.message });
    return errorResponse(res, 'Download failed: ' + e.message, 500);
  }
}

// v0.5 (Phase 4): one-click submission package — ZIP of vault docs +
// fetched RFP attachments + README + manifest. Streams directly.
async function downloadSubmissionPackage(req, res) {
  try {
    const userId = req.user && req.user.id;
    const override = req.query.override === '1' || req.query.override === 'true';
    await submissionPackage.streamPackage({
      bonfireOpportunityId: req.params.id,
      organizationId: req.user && req.user.organizationId,
      userId,
      override,
      res,
    });
    // streamPackage pipes via archiver.finalize; no extra send needed.
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    if (e.code === 'NOT_TAILORED') return errorResponse(res, e.message, 409);
    logger.error('Bonfire submission-package failed', { id: req.params.id, error: e.message });
    if (!res.headersSent) {
      return errorResponse(res, 'Package failed: ' + e.message, 500);
    }
    return null;
  }
}

// v0.8 — pursuit state machine handlers.
async function getPursuitStatus(req, res) {
  try {
    const out = await pursuitSvc.getStatus(req.params.id);
    return successResponse(res, out);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('Bonfire pursuit status failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Pursuit status failed', 500);
  }
}

async function pursueBid(req, res) {
  try {
    const out = await pursuitSvc.transition(req.params.id, {
      to: 'pursuing',
      userId: req.user?.id || null,
    });
    return successResponse(res, out, out.transitioned ? 'Bid pursued' : 'Already pursuing');
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    if (e.code === 'ILLEGAL_TRANSITION') return errorResponse(res, e.message, 409);
    logger.error('Bonfire pursue failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Pursue failed', 500);
  }
}

async function cancelPursuit(req, res) {
  try {
    // 'declined' if they had a real go at it, else 'none' to reset.
    const target = req.body?.to === 'declined' ? 'declined' : 'none';
    const out = await pursuitSvc.transition(req.params.id, {
      to: target,
      userId: req.user?.id || null,
    });
    return successResponse(res, out, 'Pursuit cleared');
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    if (e.code === 'ILLEGAL_TRANSITION') return errorResponse(res, e.message, 409);
    logger.error('Bonfire cancel-pursuit failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Cancel pursuit failed', 500);
  }
}

// v0.10 — vision extraction of the Required Information table from a portal
// screenshot. Admin only. Replaces the hardcoded baseline with the agency's
// actual submission checklist.
async function uploadPortalScreenshot(req, res) {
  try {
    // Accept either single (req.file from .single) or multiple (req.files
    // from .array) — we now use .array to support long portal pages that
    // need multiple screenshots stitched into one extraction.
    const incoming = (req.files && req.files.length)
      ? req.files
      : (req.file ? [req.file] : []);
    if (!incoming.length) return errorResponse(res, 'No screenshot uploaded', 400);
    const files = incoming.map((f) => ({
      buffer: f.buffer,
      originalName: f.originalname,
      mime: f.mimetype,
    }));
    const out = await portalScreenshot.extractFromScreenshot({
      bonfireOpportunityId: req.params.id,
      files,
      uploadedBy: req.user?.id || null,
    });
    if (!out.found) {
      return successResponse(res, out, 'Screenshot processed but no Required Information section detected');
    }
    const shotsLabel = out.screenshot_count > 1 ? ` (${out.screenshot_count} screenshots)` : '';
    return successResponse(res, out, `Extracted ${out.rows.length} required item${out.rows.length === 1 ? '' : 's'} from the portal page${shotsLabel}`);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    if (['EMPTY_BUFFER', 'OVERSIZE', 'TOO_MANY'].includes(e.code)) return errorResponse(res, e.message, 400);
    logger.error('Bonfire portal-screenshot extract failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Extraction failed: ' + e.message, 500);
  }
}

// v0.9 — re-classify every attachment for an opp. Admin only. Idempotent.
async function reclassifyAttachments(req, res) {
  try {
    const out = await attachmentClassifier.classifyAllForOpp({
      bonfireOpportunityId: req.params.id,
    });
    return successResponse(res, out, `Classified ${out.classified} attachment${out.classified === 1 ? '' : 's'}`);
  } catch (e) {
    logger.error('Bonfire reclassify failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Reclassify failed: ' + e.message, 500);
  }
}

// v0.8 — manual RFP attachment upload (Cloudflare bypass: human downloads
// from Bonfire + uploads here). Multipart, multi-file. Stores into the
// same opportunity_attachments table as the v0.4 fetcher, but with
// source='manual' so reports can distinguish.
async function uploadAttachments(req, res) {
  try {
    const files = req.files || [];
    if (!files.length) return errorResponse(res, 'No files uploaded', 400);
    const out = await manualUpload.ingestFiles({
      bonfireOpportunityId: req.params.id,
      files,
      uploadedBy: req.user?.id || null,
    });
    return successResponse(res, out, `${out.saved} file${out.saved === 1 ? '' : 's'} uploaded`);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('Bonfire manual upload failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Upload failed: ' + e.message, 500);
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
  fetchAttachments,
  listAttachments,
  downloadAttachment,
  downloadSubmissionPackage,
  // v0.8
  getPursuitStatus,
  pursueBid,
  cancelPursuit,
  uploadAttachments,
  // v0.9
  reclassifyAttachments,
  // v0.10
  uploadPortalScreenshot,
};
