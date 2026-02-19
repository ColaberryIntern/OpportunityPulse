const express = require('express');
const router = express.Router();
const recommendationController = require('./recommendation.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

/**
 * @swagger
 * /recommendations:
 *   get:
 *     tags: [Recommendations]
 *     summary: Get personalized opportunity recommendations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of recommendations (max 20)
 *     responses:
 *       200:
 *         description: List of recommended opportunities
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, cacheResponse('recommendations', 300), recommendationController.getRecommendations);

module.exports = router;
