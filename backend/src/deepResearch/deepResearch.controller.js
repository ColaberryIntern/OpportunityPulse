// Deep Research Intelligence Engine — HTTP controller.
//
// Thin layer: validates input, delegates to the services, maps domain
// error codes (BAD_INPUT / NOT_FOUND) to HTTP status. No business logic.

const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const deepResearch = require('./deepResearch.service');
const projectArchitectBridge = require('./projectArchitectBridge.service');

// POST /api/v1/deep-research/run
// Body: { searchTerm?, opportunityIds?: number[] }
async function run(req, res) {
  try {
    const { searchTerm, opportunityIds } = req.body || {};
    const report = await deepResearch.runDeepResearch({
      searchTerm,
      opportunityIds,
      userId: req.user ? req.user.id : null,
      origin: 'manual',
    });
    return successResponse(res, report, 'Deep research report generated', 201);
  } catch (e) {
    if (e.code === 'BAD_INPUT') return errorResponse(res, e.message, 400);
    logger.error('deepResearch.run failed', { error: e.message });
    return errorResponse(res, 'Deep research run failed: ' + e.message, 500);
  }
}

// GET /api/v1/deep-research/:id
async function getReport(req, res) {
  try {
    const report = await deepResearch.getReport(req.params.id);
    return successResponse(res, report);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('deepResearch.getReport failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to load deep research report', 500);
  }
}

// GET /api/v1/deep-research/:id/status
async function getStatus(req, res) {
  try {
    const status = await deepResearch.getReportStatus(req.params.id);
    return successResponse(res, status);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('deepResearch.getStatus failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to load report status', 500);
  }
}

// POST /api/v1/deep-research/:id/generate-requirements
// Body: { ventureIdeaId }
async function generateRequirements(req, res) {
  try {
    const { ventureIdeaId } = req.body || {};
    const job = await projectArchitectBridge.createJob({
      ventureIdeaId,
      userId: req.user ? req.user.id : null,
    });
    return successResponse(res, {
      job_id: job.id,
      venture_idea_id: job.ventureIdeaId,
      status: job.status,
      progress_percent: job.progressPercent,
    }, 'Requirements generation started', 202);
  } catch (e) {
    if (e.code === 'BAD_INPUT') return errorResponse(res, e.message, 400);
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('deepResearch.generateRequirements failed', { error: e.message });
    return errorResponse(res, 'Failed to start requirements generation: ' + e.message, 500);
  }
}

// GET /api/v1/deep-research/jobs/:id/status
async function getJobStatus(req, res) {
  try {
    const status = await projectArchitectBridge.getJobStatus(req.params.id);
    return successResponse(res, status);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('deepResearch.getJobStatus failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to load job status', 500);
  }
}

module.exports = {
  run,
  getReport,
  getStatus,
  generateRequirements,
  getJobStatus,
};
