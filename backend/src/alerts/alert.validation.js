const { param, query } = require('express-validator');

const validateAlertId = [
  param('id').isInt({ min: 1 }).withMessage('Alert ID must be a positive integer'),
];

const validateListQuery = [
  query('type')
    .optional()
    .isIn(['new_opportunity', 'score_change', 'trend_alert', 'system'])
    .withMessage('Type must be: new_opportunity, score_change, trend_alert, or system'),
  query('severity')
    .optional()
    .isIn(['info', 'warning', 'important'])
    .withMessage('Severity must be: info, warning, or important'),
  query('unreadOnly')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('unreadOnly must be true or false'),
];

module.exports = { validateAlertId, validateListQuery };
