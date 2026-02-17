const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const controller = require('./alert.controller');

const router = Router();

// All alert endpoints require authentication
/**
 * @swagger
 * /alerts:
 *   get:
 *     tags: [Alerts]
 *     summary: List user's alerts (paginated)
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
 *     responses:
 *       200:
 *         description: Paginated list of alerts
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, controller.listAlerts);

/**
 * @swagger
 * /alerts/unread:
 *   get:
 *     tags: [Alerts]
 *     summary: Get unread alert count
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread alert count
 *       401:
 *         description: Unauthorized
 */
router.get('/unread', verifyToken, controller.getUnreadCount);

/**
 * @swagger
 * /alerts/read-all:
 *   put:
 *     tags: [Alerts]
 *     summary: Mark all alerts as read
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All alerts marked as read
 *       401:
 *         description: Unauthorized
 */
router.put('/read-all', verifyToken, controller.markAllAsRead);

/**
 * @swagger
 * /alerts/{id}/read:
 *   put:
 *     tags: [Alerts]
 *     summary: Mark a single alert as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Alert ID
 *     responses:
 *       200:
 *         description: Alert marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Alert not found
 */
router.put('/:id/read', verifyToken, controller.markAsRead);

/**
 * @swagger
 * /alerts/{id}:
 *   delete:
 *     tags: [Alerts]
 *     summary: Delete an alert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Alert ID
 *     responses:
 *       200:
 *         description: Alert deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Alert not found
 */
router.delete('/:id', verifyToken, controller.deleteAlert);

module.exports = router;
