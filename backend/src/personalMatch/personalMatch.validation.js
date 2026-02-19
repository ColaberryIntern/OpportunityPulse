const { body, param } = require('express-validator');

const updateProfileDataValidation = [
  body('profileData').isObject().withMessage('profileData must be an object'),
  body('profileData.professionalTitle').optional().isString().trim().isLength({ max: 200 }),
  body('profileData.industry').optional().isString().trim().isLength({ max: 100 }),
  body('profileData.skills').optional().isArray({ max: 30 }),
  body('profileData.skills.*').optional().isString().trim().isLength({ max: 100 }),
  body('profileData.experienceLevel').optional().isIn(['entry', 'mid', 'senior', 'executive']),
  body('profileData.companySize').optional().isIn(['startup', 'small', 'mid-market', 'enterprise']),
  body('profileData.goals').optional().isArray({ max: 10 }),
  body('profileData.goals.*').optional().isString().trim().isLength({ max: 300 }),
  body('profileData.preferredLocations').optional().isArray({ max: 10 }),
  body('profileData.preferredLocations.*').optional().isString().trim().isLength({ max: 100 }),
  body('profileData.certifications').optional().isArray({ max: 20 }),
  body('profileData.certifications.*').optional().isString().trim().isLength({ max: 200 }),
  body('profileData.budgetRange').optional().isObject(),
  body('profileData.budgetRange.min').optional().isInt({ min: 0 }),
  body('profileData.budgetRange.max').optional().isInt({ min: 0 }),
];

const feedbackValidation = [
  param('matchId').isInt({ min: 1 }).withMessage('matchId must be a positive integer'),
  body('feedback').isIn(['helpful', 'not_helpful']).withMessage('feedback must be "helpful" or "not_helpful"'),
];

module.exports = { updateProfileDataValidation, feedbackValidation };
