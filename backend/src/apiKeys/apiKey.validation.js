const { body, param } = require('express-validator');

// Allowed API-key scopes.
//   read / write          — generic, pre-existing.
//   read:bonfire_source   — un-redacts sourceUrl / rawText on the Bonfire read
//                           endpoints ONLY (see bonfire.util.canReadSourceFields).
//                           Grants no write authority: an API-key request carries
//                           no `role`, so rbac checkPermissions() still rejects it.
const ALLOWED_SCOPES = ['read', 'write', 'read:bonfire_source'];
const scopesAreValid = (arr) => Array.isArray(arr) && arr.every((s) => ALLOWED_SCOPES.includes(s));
const SCOPE_MESSAGE = `Each scope must be one of: ${ALLOWED_SCOPES.join(', ')}`;

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
    .custom(scopesAreValid)
    .withMessage(SCOPE_MESSAGE),
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
    .custom(scopesAreValid)
    .withMessage(SCOPE_MESSAGE),
];

const validateApiKeyId = [
  param('id').isInt({ min: 1 }).withMessage('API key ID must be a positive integer'),
];

module.exports = {
  validateCreateApiKey,
  validateUpdateApiKey,
  validateApiKeyId,
  ALLOWED_SCOPES,
};
