const express = require('express');
const router = express.Router();
const feedbackController = require('./feedback.controller');
const { createFeedbackValidation, updateFeedbackValidation } = require('./feedback.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');

// All feedback routes require authentication
router.use(verifyToken);

/**
 * @swagger
 * /feedback:
 *   post:
 *     tags: [Feedback]
 *     summary: Create feedback
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [score]
 *             properties:
 *               score:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comments:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [platform, opportunity, content]
 *               targetId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Feedback created successfully
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  createFeedbackValidation,
  handleValidationErrors,
  feedbackController.createFeedback
);

/**
 * @swagger
 * /feedback:
 *   get:
 *     tags: [Feedback]
 *     summary: List feedback (paginated)
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [platform, opportunity, content]
 *         description: Filter by feedback type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, reviewed, resolved]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Paginated list of feedback
 *       401:
 *         description: Unauthorized
 */
router.get('/', feedbackController.listFeedback);

/**
 * @swagger
 * /feedback/stats:
 *   get:
 *     tags: [Feedback]
 *     summary: Get feedback statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback statistics (average score, counts by type, etc.)
 *       401:
 *         description: Unauthorized
 */
// Stats route must come before /:id to avoid matching "stats" as an id
router.get('/stats', feedbackController.getFeedbackStats);

/**
 * @swagger
 * /feedback/{id}:
 *   get:
 *     tags: [Feedback]
 *     summary: Get feedback by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Feedback ID
 *     responses:
 *       200:
 *         description: Feedback details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Feedback'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Feedback not found
 */
router.get('/:id', feedbackController.getFeedback);

/**
 * @swagger
 * /feedback/{id}:
 *   put:
 *     tags: [Feedback]
 *     summary: Update feedback
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Feedback ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               score:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comments:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, reviewed, resolved]
 *     responses:
 *       200:
 *         description: Feedback updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Feedback not found
 */
router.put(
  '/:id',
  updateFeedbackValidation,
  handleValidationErrors,
  feedbackController.updateFeedback
);

/**
 * @swagger
 * /feedback/{id}:
 *   delete:
 *     tags: [Feedback]
 *     summary: Delete feedback
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Feedback ID
 *     responses:
 *       200:
 *         description: Feedback deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Feedback not found
 */
router.delete('/:id', feedbackController.deleteFeedback);

module.exports = router;
