const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const controller = require('./webhook.controller');
const {
  validateCreateWebhook,
  validateUpdateWebhook,
  validateWebhookId,
} = require('./webhook.validation');

const router = Router();

// All webhook management endpoints require JWT authentication

/**
 * @swagger
 * /webhooks:
 *   get:
 *     tags: [Webhooks]
 *     summary: List all webhooks for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks (without secrets)
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, controller.listWebhooks);

/**
 * @swagger
 * /webhooks:
 *   post:
 *     tags: [Webhooks]
 *     summary: Create a new webhook
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, eventTypes]
 *             properties:
 *               url:
 *                 type: string
 *                 maxLength: 512
 *               eventTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [opportunity.created, alert.created, ingestion.completed, content.published]
 *               description:
 *                 type: string
 *                 maxLength: 255
 *     responses:
 *       201:
 *         description: Webhook created (secret returned once)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  verifyToken,
  validateCreateWebhook,
  handleValidationErrors,
  controller.createWebhook
);

/**
 * @swagger
 * /webhooks/{id}:
 *   put:
 *     tags: [Webhooks]
 *     summary: Update a webhook
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *               eventTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook updated
 *       404:
 *         description: Webhook not found
 */
router.put(
  '/:id',
  verifyToken,
  validateUpdateWebhook,
  handleValidationErrors,
  controller.updateWebhook
);

/**
 * @swagger
 * /webhooks/{id}:
 *   delete:
 *     tags: [Webhooks]
 *     summary: Delete a webhook
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
 *         description: Webhook deleted
 *       404:
 *         description: Webhook not found
 */
router.delete(
  '/:id',
  verifyToken,
  validateWebhookId,
  handleValidationErrors,
  controller.deleteWebhook
);

/**
 * @swagger
 * /webhooks/{id}/test:
 *   post:
 *     tags: [Webhooks]
 *     summary: Send a test delivery to a webhook
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
 *         description: Test delivery sent
 *       404:
 *         description: Webhook not found
 */
router.post(
  '/:id/test',
  verifyToken,
  validateWebhookId,
  handleValidationErrors,
  controller.testWebhook
);

/**
 * @swagger
 * /webhooks/{id}/deliveries:
 *   get:
 *     tags: [Webhooks]
 *     summary: Get delivery log for a webhook
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *         description: Paginated delivery log
 *       404:
 *         description: Webhook not found
 */
router.get(
  '/:id/deliveries',
  verifyToken,
  validateWebhookId,
  handleValidationErrors,
  controller.getDeliveryLog
);

module.exports = router;
