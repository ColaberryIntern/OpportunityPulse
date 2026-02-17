const analysisService = require('./analysis.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { logAuditEvent } = require('../logging/audit.service');

/**
 * Trigger scoring for a specific opportunity type.
 * POST /score/:type
 */
async function triggerScoring(req, res, next) {
  try {
    const { type } = req.params;
    const run = await analysisService.scoreOpportunities(type);

    logAuditEvent({
      userId: req.user.userId,
      action: 'analysis_scoring_triggered',
      resource: 'analysis',
      resourceId: type,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { run }, `Scoring completed for '${type}'.`);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Trigger trend detection for a specific opportunity type.
 * POST /trends/:type
 */
async function triggerTrendDetection(req, res, next) {
  try {
    const { type } = req.params;
    const run = await analysisService.detectTrends(type);

    logAuditEvent({
      userId: req.user.userId,
      action: 'analysis_trends_triggered',
      resource: 'analysis',
      resourceId: type,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { run }, `Trend detection completed for '${type}'.`);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Trigger weekly insight generation.
 * POST /insights
 */
async function triggerInsightGeneration(req, res, next) {
  try {
    const run = await analysisService.generateInsights();

    logAuditEvent({
      userId: req.user.userId,
      action: 'analysis_insights_triggered',
      resource: 'analysis',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { run }, 'Insight generation completed.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Get latest insights.
 * GET /latest-insights
 */
async function getLatestInsights(req, res, next) {
  try {
    const run = await analysisService.getLatestInsights();

    if (!run) {
      return successResponse(res, { insights: null }, 'No insights available yet.');
    }

    return successResponse(res, { insights: run.results, run }, 'Latest insights retrieved.');
  } catch (error) {
    next(error);
  }
}

/**
 * Get latest trends for a type.
 * GET /trends/:type
 */
async function getLatestTrends(req, res, next) {
  try {
    const { type } = req.params;
    const run = await analysisService.getLatestTrends(type);

    if (!run) {
      return successResponse(res, { trends: null }, `No trends available for '${type}'.`);
    }

    return successResponse(res, { trends: run.results, run }, `Trends retrieved for '${type}'.`);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  triggerScoring,
  triggerTrendDetection,
  triggerInsightGeneration,
  getLatestInsights,
  getLatestTrends,
};
