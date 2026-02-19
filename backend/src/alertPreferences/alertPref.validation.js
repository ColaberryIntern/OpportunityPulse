const { body } = require('express-validator');

const validatePreferences = [
  body('govContracts').optional().isBoolean().withMessage('govContracts must be a boolean'),
  body('aiJobs').optional().isBoolean().withMessage('aiJobs must be a boolean'),
  body('investments').optional().isBoolean().withMessage('investments must be a boolean'),
  body('minScore').optional().isInt({ min: 0, max: 100 }).withMessage('minScore must be 0-100'),
  body('emailNotify').optional().isBoolean().withMessage('emailNotify must be a boolean'),
  body('inAppNotify').optional().isBoolean().withMessage('inAppNotify must be a boolean'),
  body('digestFrequency')
    .optional()
    .isIn(['daily', 'weekly', 'biweekly', 'monthly'])
    .withMessage('digestFrequency must be daily, weekly, biweekly, or monthly'),
];

module.exports = { validatePreferences };
