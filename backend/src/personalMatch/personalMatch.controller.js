const personalMatchService = require('./personalMatch.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

async function getMatches(req, res, next) {
  try {
    const result = await personalMatchService.getPersonalMatches(req.user.userId);
    return successResponse(res, result, 'Personal matches retrieved.');
  } catch (error) {
    logger.error('Failed to get personal matches', { userId: req.user.userId, error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function refreshMatches(req, res, next) {
  try {
    const result = await personalMatchService.getPersonalMatches(req.user.userId, { forceRefresh: true });
    return successResponse(res, result, 'Personal matches refreshed.');
  } catch (error) {
    logger.error('Failed to refresh personal matches', { userId: req.user.userId, error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function submitFeedback(req, res, next) {
  try {
    const { matchId } = req.params;
    const { feedback } = req.body;
    const match = await personalMatchService.submitMatchFeedback(req.user.userId, parseInt(matchId, 10), feedback);
    return successResponse(res, { match }, 'Feedback submitted.');
  } catch (error) {
    logger.error('Failed to submit match feedback', { userId: req.user.userId, error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function updateProfileData(req, res, next) {
  try {
    const { profileData } = req.body;
    const updated = await personalMatchService.updateProfileData(req.user.userId, profileData);
    return successResponse(res, { profileData: updated }, 'Profile data updated.');
  } catch (error) {
    logger.error('Failed to update profile data', { userId: req.user.userId, error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

module.exports = { getMatches, refreshMatches, submitFeedback, updateProfileData };
