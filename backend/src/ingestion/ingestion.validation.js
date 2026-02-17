const { param } = require('express-validator');

/**
 * Validation for POST /run/:name
 * Ensures the data source name is a non-empty alphanumeric string with underscores allowed.
 */
const triggerIngestionValidation = [
  param('name')
    .trim()
    .notEmpty()
    .withMessage('Data source name is required.')
    .isLength({ max: 100 })
    .withMessage('Data source name must not exceed 100 characters.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Data source name must contain only alphanumeric characters and underscores.'),
];

module.exports = {
  triggerIngestionValidation,
};
