const { query } = require('express-validator');

const listOpportunitiesValidation = [
  query('type')
    .optional()
    .custom((value) => {
      const validTypes = ['gov_contract', 'ai_job', 'investment', 'grant', 'ai_news'];
      const types = value.split(',').map(t => t.trim()).filter(Boolean);
      return types.length > 0 && types.every(t => validTypes.includes(t));
    })
    .withMessage('Type must be comma-separated list of: gov_contract, ai_job, investment, grant, ai_news.'),
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
    .isIn(['newest', 'oldest', 'score', 'value'])
    .withMessage('Sort must be newest, oldest, score, or value.'),
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
};
