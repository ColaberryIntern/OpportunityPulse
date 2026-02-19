const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { apiKeyCreationLimiter } = require('../middleware/rateLimiter.middleware');
const controller = require('./apiKey.controller');
const { validateCreateApiKey, validateUpdateApiKey, validateApiKeyId } = require('./apiKey.validation');

const router = Router();

// All API key management endpoints require JWT authentication

/**
 * @swagger
 * /api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List all API keys for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys (without key hashes)
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, controller.listApiKeys);

/**
 * @swagger
 * /api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create a new API key
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read, write]
 *     responses:
 *       201:
 *         description: API key created (plaintext key returned once)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', verifyToken, apiKeyCreationLimiter, validateCreateApiKey, handleValidationErrors, controller.createApiKey);

/**
 * @swagger
 * /api-keys/{id}:
 *   patch:
 *     tags: [API Keys]
 *     summary: Update an API key's name or scopes
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
 *               name:
 *                 type: string
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read, write]
 *     responses:
 *       200:
 *         description: API key updated
 *       404:
 *         description: API key not found
 */
router.patch('/:id', verifyToken, validateUpdateApiKey, handleValidationErrors, controller.updateApiKey);

/**
 * @swagger
 * /api-keys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Revoke an API key
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
 *         description: API key revoked
 *       404:
 *         description: API key not found
 */
router.delete('/:id', verifyToken, validateApiKeyId, handleValidationErrors, controller.revokeApiKey);

module.exports = router;
