const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { checkSubscription } = require('../middleware/subscription.middleware');
const controller = require('./analysis.controller');

const router = Router();

// Admin-only: trigger analysis
/**
 * @swagger
 * /analysis/score/{type}:
 *   post:
 *     tags: [Analysis]
 *     summary: Run AI scoring for opportunities (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [gov_contract, ai_job, investment]
 *         description: Opportunity type to score
 *     responses:
 *       200:
 *         description: Scoring completed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.post('/score/:type', verifyToken, checkPermissions('admin'), controller.triggerScoring);

/**
 * @swagger
 * /analysis/trends/{type}:
 *   post:
 *     tags: [Analysis]
 *     summary: Run trend detection for opportunities (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [gov_contract, ai_job, investment]
 *         description: Opportunity type
 *     responses:
 *       200:
 *         description: Trend detection completed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.post('/trends/:type', verifyToken, checkPermissions('admin'), controller.triggerTrendDetection);

/**
 * @swagger
 * /analysis/insights:
 *   post:
 *     tags: [Analysis]
 *     summary: Generate AI insights (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Insight generation completed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.post('/insights', verifyToken, checkPermissions('admin'), controller.triggerInsightGeneration);

// Authenticated + premium: read results
/**
 * @swagger
 * /analysis/latest-insights:
 *   get:
 *     tags: [Analysis]
 *     summary: Get latest AI-generated insights (premium)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Latest insights
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Premium subscription required
 */
router.get('/latest-insights', verifyToken, checkSubscription('premium'), controller.getLatestInsights);

/**
 * @swagger
 * /analysis/trends/{type}:
 *   get:
 *     tags: [Analysis]
 *     summary: Get latest trends for opportunity type (premium)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [gov_contract, ai_job, investment]
 *         description: Opportunity type
 *     responses:
 *       200:
 *         description: Latest trend data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Premium subscription required
 */
router.get('/trends/:type', verifyToken, checkSubscription('premium'), controller.getLatestTrends);

module.exports = router;
