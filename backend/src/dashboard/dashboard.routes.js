const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkSubscription } = require('../middleware/subscription.middleware');

// All dashboard routes require authentication
router.use(verifyToken);

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get platform statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', dashboardController.getStats);

/**
 * @swagger
 * /dashboard/activity:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get user activity log
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User activity log
 *       401:
 *         description: Unauthorized
 */
router.get('/activity', dashboardController.getActivity);

/**
 * @swagger
 * /dashboard/opportunity-stats:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get opportunity statistics breakdown
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opportunity statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/opportunity-stats', dashboardController.getOpportunityStats);

/**
 * @swagger
 * /dashboard/charts:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get chart data (premium subscription required)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chart data for dashboard visualizations
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Premium subscription required
 */
router.get('/charts', checkSubscription('premium'), dashboardController.getChartData);

/**
 * @swagger
 * /dashboard/trends:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get trend summary
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trend summary data
 *       401:
 *         description: Unauthorized
 */
router.get('/trends', dashboardController.getTrendSummary);

module.exports = router;
