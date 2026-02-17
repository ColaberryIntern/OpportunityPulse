const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const controller = require('./alertPref.controller');

const router = Router();

/**
 * @swagger
 * /alert-preferences:
 *   get:
 *     tags: [Alert Preferences]
 *     summary: Get user's alert preferences
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's alert preferences
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, controller.getPreferences);

/**
 * @swagger
 * /alert-preferences:
 *   put:
 *     tags: [Alert Preferences]
 *     summary: Update alert preferences (creates if not existing)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNotify:
 *                 type: boolean
 *               pushNotify:
 *                 type: boolean
 *               types:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [new_opportunity, score_change, trend_alert, system]
 *               severities:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [info, warning, important]
 *     responses:
 *       200:
 *         description: Alert preferences updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put('/', verifyToken, controller.updatePreferences);

module.exports = router;
