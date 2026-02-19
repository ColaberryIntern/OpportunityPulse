const express = require('express');
const router = express.Router();
const contentController = require('./content.controller');
const { createContentValidation, updateContentValidation } = require('./content.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');

// All content routes require authentication
router.use(verifyToken);

/**
 * @swagger
 * /content:
 *   post:
 *     tags: [Content]
 *     summary: Create new content
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body]
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *     responses:
 *       201:
 *         description: Content created successfully
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  createContentValidation,
  handleValidationErrors,
  contentController.createContent
);

/**
 * @swagger
 * /content:
 *   get:
 *     tags: [Content]
 *     summary: List content (paginated)
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: Paginated list of content
 *       401:
 *         description: Unauthorized
 */
router.get('/', contentController.listContent);

/**
 * @swagger
 * /content/generate:
 *   post:
 *     tags: [Content]
 *     summary: Generate AI content based on a topic
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topic]
 *             properties:
 *               topic:
 *                 type: string
 *                 description: Topic for AI content generation (min 3 characters)
 *     responses:
 *       201:
 *         description: Content generated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/generate', contentController.generateContent);

/**
 * @swagger
 * /content/{id}:
 *   get:
 *     tags: [Content]
 *     summary: Get content by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Content ID
 *     responses:
 *       200:
 *         description: Content details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Content'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Content not found
 */
router.get('/:id', contentController.getContent);

/**
 * @swagger
 * /content/{id}:
 *   put:
 *     tags: [Content]
 *     summary: Update content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Content ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *     responses:
 *       200:
 *         description: Content updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Content not found
 */
router.put(
  '/:id',
  updateContentValidation,
  handleValidationErrors,
  contentController.updateContent
);

/**
 * @swagger
 * /content/{id}:
 *   delete:
 *     tags: [Content]
 *     summary: Delete content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Content ID
 *     responses:
 *       200:
 *         description: Content deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Content not found
 */
router.delete('/:id', contentController.deleteContent);

module.exports = router;
