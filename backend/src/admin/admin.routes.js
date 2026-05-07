const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const dataSourceHealth = require('./dataSourceHealth.controller');
const sourceHealthAgent = require('./sourceHealthAgent.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');

// All admin routes require authentication + admin role
router.use(verifyToken, checkPermissions(ROLES.ADMIN));

// v9.9: Data Source Health page — lists every ingestion source with
// last-run + recent counts + trend + derived status (failing / stale /
// zero_yield / healthy / disabled). Plus an on-demand "Run now" trigger.
router.get('/data-sources/health',     dataSourceHealth.getDataSourcesHealth);
router.post('/data-sources/:name/run', dataSourceHealth.runDataSource);

// v9.10: on-demand auto-triage — retries failing sources, classifies
// what's still broken, optionally emails the operator.
router.post('/source-health-agent/run', sourceHealthAgent.runSourceHealthAgent);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/users', adminController.listUsers);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get user by ID (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User details
 */
router.get('/users/:id', adminController.getUserById);

/**
 * @swagger
 * /admin/users/{id}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Update user role (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Role updated
 */
router.patch('/users/:id/role', adminController.updateUserRole);

/**
 * @swagger
 * /admin/users/{id}/subscription:
 *   patch:
 *     tags: [Admin]
 *     summary: Update user subscription (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planType]
 *             properties:
 *               planType:
 *                 type: string
 *                 enum: [free, premium]
 *     responses:
 *       200:
 *         description: Subscription updated
 */
router.patch('/users/:id/subscription', adminController.updateUserSubscription);

/**
 * @swagger
 * /admin/audit-log:
 *   get:
 *     tags: [Admin]
 *     summary: Get audit log (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Audit log entries
 */
router.get('/audit-log', adminController.getAuditLog);

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Get system stats (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System statistics
 */
router.get('/stats', adminController.getSystemStats);

module.exports = router;
