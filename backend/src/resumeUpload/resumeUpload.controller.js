const { extractProfileFromResume } = require('./resumeUpload.service');
const { updateProfileData } = require('../personalMatch/personalMatch.service');
const { User } = require('../models');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

/**
 * Upload a PDF resume and extract profile data via AI.
 * Returns extracted data for user review — does NOT auto-save.
 */
async function uploadResume(req, res) {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded. Please select a PDF file.', 400);
    }

    const user = await User.findByPk(req.user.userId, {
      attributes: ['id', 'profileData'],
    });

    if (!user) {
      return errorResponse(res, 'User not found.', 404);
    }

    const existingProfileData = user.profileData || {};
    const result = await extractProfileFromResume(req.file.buffer, existingProfileData);

    return successResponse(res, {
      extractedData: result.extractedData,
      mergedProfileData: result.mergedProfileData,
      changes: result.changes,
    }, 'Resume parsed successfully. Review the extracted data before saving.');
  } catch (error) {
    logger.error('Resume upload failed', { userId: req.user.userId, error: error.message });
    return errorResponse(res, error.message, 500);
  }
}

/**
 * Confirm and save the reviewed/edited profile data from resume extraction.
 */
async function confirmExtraction(req, res) {
  try {
    const { profileData } = req.body;

    if (!profileData || typeof profileData !== 'object') {
      return errorResponse(res, 'Invalid profile data.', 400);
    }

    const saved = await updateProfileData(req.user.userId, profileData);

    logger.info('Resume extraction confirmed and profile updated', { userId: req.user.userId });
    return successResponse(res, { profileData: saved }, 'Profile updated from resume successfully.');
  } catch (error) {
    logger.error('Resume confirmation failed', { userId: req.user.userId, error: error.message });
    return errorResponse(res, error.message, 500);
  }
}

module.exports = { uploadResume, confirmExtraction };
