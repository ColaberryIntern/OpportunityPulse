const adaptiveService = require('./adaptive.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

async function getAdaptiveLearning(req, res) {
  try {
    const profile = await adaptiveService.getAdaptiveLearning(req.user.userId);
    return successResponse(res, { adapts: 'User preferences updated.', profile }, 'Adaptive learning insights retrieved.');
  } catch (error) {
    logger.error('Failed to get adaptive learning', { userId: req.user.userId, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function trackBehavior(req, res) {
  try {
    const { action, metadata } = req.body;
    if (!action) {
      return errorResponse(res, 'Action is required', 400);
    }
    await adaptiveService.trackBehavior(req.user.userId, action, metadata || {});
    return successResponse(res, null, 'Behavior tracked.', 201);
  } catch (error) {
    logger.error('Failed to track behavior', { userId: req.user.userId, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

module.exports = { getAdaptiveLearning, trackBehavior };
