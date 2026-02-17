const alertPrefService = require('./alertPref.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

async function getPreferences(req, res, next) {
  try {
    const prefs = await alertPrefService.getPreferences(req.user.userId);
    return successResponse(res, { preferences: prefs }, 'Alert preferences retrieved.');
  } catch (error) {
    next(error);
  }
}

async function updatePreferences(req, res, next) {
  try {
    const prefs = await alertPrefService.updatePreferences(req.user.userId, req.body);
    return successResponse(res, { preferences: prefs }, 'Alert preferences updated.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getPreferences,
  updatePreferences,
};
