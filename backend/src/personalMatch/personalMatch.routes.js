const express = require('express');
const router = express.Router();
const personalMatchController = require('./personalMatch.controller');
const { updateProfileDataValidation, feedbackValidation } = require('./personalMatch.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// GET /personal-matches — get cached or fresh AI matches
router.get('/', personalMatchController.getMatches);

// POST /personal-matches/refresh — force recompute matches
router.post('/refresh', personalMatchController.refreshMatches);

// PUT /personal-matches/profile — update AI profile data
router.put(
  '/profile',
  updateProfileDataValidation,
  handleValidationErrors,
  personalMatchController.updateProfileData
);

// POST /personal-matches/:matchId/feedback — submit match feedback
router.post(
  '/:matchId/feedback',
  feedbackValidation,
  handleValidationErrors,
  personalMatchController.submitFeedback
);

module.exports = router;
