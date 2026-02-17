const express = require('express');
const router = express.Router();
const opportunityController = require('./opportunity.controller');
const { listOpportunitiesValidation } = require('./opportunity.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPremiumQuery } = require('../middleware/subscription.middleware');

// All opportunity routes require authentication
router.use(verifyToken);

/**
 * @swagger
 * /opportunities/stats:
 *   get:
 *     tags: [Opportunities]
 *     summary: Get opportunity statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opportunity statistics
 *       401:
 *         description: Unauthorized
 */
// GET /stats must be defined before /:id to avoid treating 'stats' as an id
router.get('/stats', opportunityController.getStats);

/**
 * @swagger
 * /opportunities:
 *   get:
 *     tags: [Opportunities]
 *     summary: List opportunities (paginated)
 *     security:
 *       - bearerAuth: []
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, closed, expired, archived]
 *         description: Filter by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: number
 *         description: Minimum AI score (premium feature)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field
 *     responses:
 *       200:
 *         description: Paginated list of opportunities
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  checkPremiumQuery('minScore'),
  listOpportunitiesValidation,
  handleValidationErrors,
  opportunityController.listOpportunities
);

/**
 * @swagger
 * /opportunities/{id}:
 *   get:
 *     tags: [Opportunities]
 *     summary: Get opportunity by ID
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Opportunity not found
 */
router.get('/:id', opportunityController.getOpportunity);

module.exports = router;
