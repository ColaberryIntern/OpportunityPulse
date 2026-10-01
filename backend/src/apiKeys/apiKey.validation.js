const { body, param } = require('express-validator');

// Allowed API-key scopes.
//   read / write          — generic, pre-existing.
//   read:bonfire_source   — un-redacts sourceUrl / rawText on the Bonfire read
//                           endpoints ONLY (see bonfire.util.canReadSourceFields).
//                           Grants no write authority: an API-key request carries
//                           no `role`, so rbac checkPermissions() still rejects it.
//   read:gov_opportunities — the Phase 2 read-only contract API
//                           (govOpportunityV2.routes, SCOPE constant). Read-only
//                           by construction: those routes expose GET only.
//
// This list and the scopes the routes actually require must agree. They did not:
// govOpportunityV2.routes has required 'read:gov_opportunities' since Phase 2
// shipped, while this validator rejected it, so the documented way to issue a
// credential could not produce one that the v2 API would accept. Adding a scope
// here grants nothing on its own; it only permits the scope to be requested.
const ALLOWED_SCOPES = ['read', 'write', 'read:bonfire_source', 'read:gov_opportunities'];
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
