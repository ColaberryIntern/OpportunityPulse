const express = require('express');
const router = express.Router();
const searchController = require('./search.controller');
const { verifyToken } = require('../middleware/auth.middleware');

/**
 * @swagger
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Search content and opportunities
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field
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
 *         description: Search results
 *       401:
 *         description: Unauthorized
 */
// Search requires authentication
router.get('/', verifyToken, searchController.search);

module.exports = router;
