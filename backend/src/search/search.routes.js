const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const searchController = require('./search.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { searchLimiter } = require('../middleware/rateLimiter.middleware');

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
router.get('/', verifyToken, searchLimiter, searchController.search);

/**
 * @swagger
 * /search/natural:
 *   post:
 *     tags: [Search]
 *     summary: Natural language search for opportunities
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *                 description: Natural language search query (3-500 characters)
 *     responses:
 *       200:
 *         description: Natural language search results
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/natural',
  verifyToken,
  searchLimiter,
  [body('query').trim().isLength({ min: 3, max: 500 }).withMessage('Query must be 3-500 characters.')],
  handleValidationErrors,
  searchController.naturalLanguageSearch
);

module.exports = router;
