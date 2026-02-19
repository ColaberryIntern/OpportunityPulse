const { body, param } = require('express-validator');

const validateCreateApiKey = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('API key name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be 100 characters or fewer'),
  body('scopes')
    .optional()
    .isArray()
    .withMessage('Scopes must be an array')
    .custom((arr) => arr.every((s) => ['read', 'write'].includes(s)))
    .withMessage('Each scope must be either "read" or "write"'),
];

const validateUpdateApiKey = [
  param('id').isInt({ min: 1 }).withMessage('API key ID must be a positive integer'),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Name must be 100 characters or fewer'),
  body('scopes')
    .optional()
    .isArray()
    .withMessage('Scopes must be an array')
    .custom((arr) => arr.every((s) => ['read', 'write'].includes(s)))
    .withMessage('Each scope must be either "read" or "write"'),
];

const validateApiKeyId = [
  param('id').isInt({ min: 1 }).withMessage('API key ID must be a positive integer'),
];

module.exports = { validateCreateApiKey, validateUpdateApiKey, validateApiKeyId };
