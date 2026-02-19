const { Router } = require('express');
const controller = require('./public.controller');
const { cacheResponse } = require('../middleware/cache.middleware');

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
