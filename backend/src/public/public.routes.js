const { Router } = require('express');
const { query } = require('express-validator');
const controller = require('./public.controller');
const { cacheResponse } = require('../middleware/cache.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');

const feedValidation = [
  query('type')
    .optional()
    .custom((value) => {
      const validTypes = ['gov_contract', 'ai_job', 'investment', 'grant', 'ai_news'];
      const types = value.split(',').map(t => t.trim()).filter(Boolean);
      return types.length > 0 && types.every(t => validTypes.includes(t));
    })
    .withMessage('Type must be comma-separated list of: gov_contract, ai_job, investment, grant, ai_news.'),
  query('category')
    .optional()
    .isString()
    .trim(),
  query('since')
    .optional()
    .isISO8601()
    .withMessage('since must be a valid ISO 8601 datetime (e.g., 2026-02-19T00:00:00Z).'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 5000 })
    .withMessage('limit must be an integer between 1 and 5000.'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),
];

const router = Router();

// Public routes — no authentication required
/**
 * @swagger
 * /public/opportunities/stats:
 *   get:
 *     tags: [Public]
 *     summary: Get public opportunity statistics (no auth required)
 *     security: []
 *     responses:
 *       200:
 *         description: Public opportunity statistics
 */
router.get('/stats', cacheResponse('public:stats', 120), controller.getStats);

/**
 * @swagger
 * /public/opportunities:
 *   get:
 *     tags: [Public]
 *     summary: Browse opportunities (no auth required)
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [gov_contract, ai_job, investment]
 *         description: Filter by opportunity type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: Paginated list of public opportunities
 */
router.get('/', cacheResponse('public:list', 120), controller.listOpportunities);

/**
 * @swagger
 * /public/opportunities/feed.xml:
 *   get:
 *     tags: [Public]
 *     summary: RSS feed of opportunities (no auth required)
 *     security: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by type (comma-separated for multi-type, e.g. gov_contract,grant)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Return only items ingested after this ISO 8601 timestamp
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5000
 *           default: 50
 *         description: Max items per page (default 50, max 5000)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for paginated access
 *     responses:
 *       200:
 *         description: RSS 2.0 XML feed
 *         headers:
 *           X-Total-Count:
 *             description: Total matching items
 *             schema:
 *               type: integer
 *           X-Page:
 *             description: Current page number
 *             schema:
 *               type: integer
 *           X-Total-Pages:
 *             description: Total pages available
 *             schema:
 *               type: integer
 *         content:
 *           application/rss+xml:
 *             schema:
 *               type: string
 *       304:
 *         description: Not modified (If-Modified-Since)
 */
router.get('/feed.xml', feedValidation, handleValidationErrors, controller.getFeed);

/**
 * @swagger
 * /public/opportunities/{id}:
 *   get:
 *     tags: [Public]
 *     summary: Get public opportunity detail (no auth required)
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Opportunity ID
 *     responses:
 *       200:
 *         description: Opportunity details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Opportunity'
 *       404:
 *         description: Opportunity not found
 */
router.get('/:id', controller.getOpportunity);

module.exports = router;
