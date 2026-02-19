const recommendationService = require('./recommendation.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

async function getRecommendations(req, res) {
  try {
    const { limit } = req.query;
    const result = await recommendationService.getAdaptiveRecommendations(req.user.userId, { limit });
    return successResponse(res, result, 'Recommendations retrieved.');
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

module.exports = { getRecommendations };
