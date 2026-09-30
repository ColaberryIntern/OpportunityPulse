const { query } = require('express-validator');

// Every type the ingestion pipeline writes. bonfire / freelance / research
// were missing, so the Freelance view (type=freelance) got a 400 and Bonfire
// solicitations could not be listed at all.
const VALID_TYPES = [
  'gov_contract', 'bonfire', 'grant', 'ai_job', 'investment', 'ai_news',
  'freelance', 'research', 'bonfire_strategic',
];

// Comma-separated data-source keys (e.g. "sam_gov,sam_gov_scraper").
const SOURCE_LIST_RE = /^[a-z0-9_]+(,[a-z0-9_]+)*$/;

const listOpportunitiesValidation = [
  query('type')
    .optional()
    .custom((value) => {
      const types = value.split(',').map(t => t.trim()).filter(Boolean);
      return types.length > 0 && types.every(t => VALID_TYPES.includes(t));
    })
    .withMessage(`Type must be comma-separated list of: ${VALID_TYPES.join(', ')}.`),
  query('source')
    .optional()
    .isLength({ max: 200 })
    .matches(SOURCE_LIST_RE)
    .withMessage('source must be a comma-separated list of lowercase source keys.'),
  query('excludeSource')
    .optional()
    .isLength({ max: 200 })
    .matches(SOURCE_LIST_RE)
    .withMessage('excludeSource must be a comma-separated list of lowercase source keys.'),
  query('openOnly')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('openOnly must be true or false.'),
  query('status')
    .optional()
    .isIn(['active', 'closed', 'expired', 'archived'])
    .withMessage('Status must be active, closed, expired, or archived.'),
  query('q')
    .optional()
    .isString()
    .withMessage('Search query must be a string.')
    .trim(),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100.'),
  query('sort')
    .optional()
    .isIn(['newest', 'oldest', 'score', 'value', 'deadline'])
    .withMessage('Sort must be newest, oldest, score, value, or deadline.'),
  query('actionType')
    .optional()
    .isIn(['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH', 'IGNORE'])
    .withMessage('actionType must be BUILD, BID, APPLY, PARTNER, INVEST, TEACH, or IGNORE.'),
  query('minScore')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Minimum score must be a number between 0 and 100.'),
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('dateFrom must be a valid ISO 8601 date.'),
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('dateTo must be a valid ISO 8601 date.'),
  query('domain')
    .optional()
    .isString()
    .withMessage('domain must be a valid slug string.'),
  query('capability')
    .optional()
    .isString()
    .withMessage('capability must be a valid slug string.'),
  query('intent')
    .optional()
    .isString()
    .withMessage('intent must be a valid slug string.'),
  query('monetization')
    .optional()
    .isString()
    .withMessage('monetization must be a valid slug string.'),
  query('maturity')
    .optional()
    .isString()
    .withMessage('maturity must be a valid slug string.'),
  query('geo')
    .optional()
    .isString()
    .withMessage('geo must be a valid slug string.'),
  query('quadrant')
    .optional()
    .isIn(['HD_LC', 'HD_HC', 'LD_LC', 'LD_HC'])
    .withMessage('quadrant must be HD_LC, HD_HC, LD_LC, or LD_HC.'),
  query('cluster')
    .optional()
    .isInt({ min: 1 })
    .withMessage('cluster must be a positive integer (cluster ID).'),
];

module.exports = {
  listOpportunitiesValidation,
  VALID_TYPES,
};
