const { body } = require('express-validator');

const VALID_ACTION_TYPES = ['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH'];

const validatePreferences = [
  body('govContracts').optional().isBoolean().withMessage('govContracts must be a boolean'),
  body('aiJobs').optional().isBoolean().withMessage('aiJobs must be a boolean'),
  body('investments').optional().isBoolean().withMessage('investments must be a boolean'),
  body('grants').optional().isBoolean().withMessage('grants must be a boolean'),
  body('aiNews').optional().isBoolean().withMessage('aiNews must be a boolean'),
  body('preferredActionTypes')
    .optional()
    .isArray()
    .withMessage('preferredActionTypes must be an array')
    .custom((arr) => arr.every((v) => VALID_ACTION_TYPES.includes(v)))
    .withMessage(`preferredActionTypes must only contain: ${VALID_ACTION_TYPES.join(', ')}`),
  body('minScore').optional().isInt({ min: 0, max: 100 }).withMessage('minScore must be 0-100'),
  body('emailNotify').optional().isBoolean().withMessage('emailNotify must be a boolean'),
  body('inAppNotify').optional().isBoolean().withMessage('inAppNotify must be a boolean'),
  body('digestFrequency')
    .optional()
    .isIn(['daily', 'weekly', 'biweekly', 'monthly'])
    .withMessage('digestFrequency must be daily, weekly, biweekly, or monthly'),
];

module.exports = { validatePreferences };
