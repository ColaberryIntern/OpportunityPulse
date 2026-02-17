const express = require('express');
const router = express.Router();
const forumController = require('./forum.controller');
const { createPostValidation, updatePostValidation, createCommentValidation, updateCommentValidation } = require('./forum.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');

// All forum routes require authentication
router.use(verifyToken);

/**
 * @swagger
 * /forums:
 *   post:
 *     tags: [Forums]
 *     summary: Create a forum post
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
 *                 enum: [general, gov_contracts, ai_jobs, investments, platform]
 *     responses:
 *       201:
 *         description: Forum post created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/', createPostValidation, handleValidationErrors, forumController.createPost);

/**
 * @swagger
 * /forums:
 *   get:
 *     tags: [Forums]
 *     summary: List forum posts (paginated)
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
 *         name: category
 *         schema:
 *           type: string
 *           enum: [general, gov_contracts, ai_jobs, investments, platform]
 *         description: Filter by category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, closed, pinned]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Paginated list of forum posts
 *       401:
 *         description: Unauthorized
 */
router.get('/', forumController.listPosts);

/**
 * @swagger
 * /forums/{id}:
 *   get:
 *     tags: [Forums]
 *     summary: Get forum post with comments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Forum post ID
 *     responses:
 *       200:
 *         description: Forum post with comments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForumPost'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Post not found
 */
router.get('/:id', forumController.getPost);

/**
 * @swagger
 * /forums/{id}:
 *   put:
 *     tags: [Forums]
 *     summary: Update a forum post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Forum post ID
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
 *                 enum: [general, gov_contracts, ai_jobs, investments, platform]
 *               status:
 *                 type: string
 *                 enum: [open, closed, pinned]
 *     responses:
 *       200:
 *         description: Post updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Post not found
 */
router.put('/:id', updatePostValidation, handleValidationErrors, forumController.updatePost);

/**
 * @swagger
 * /forums/{id}:
 *   delete:
 *     tags: [Forums]
 *     summary: Delete a forum post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Forum post ID
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Post not found
 */
router.delete('/:id', forumController.deletePost);

/**
 * @swagger
 * /forums/{id}/comments:
 *   post:
 *     tags: [Forums]
 *     summary: Add a comment to a forum post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Forum post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment added successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Post not found
 */
router.post('/:id/comments', createCommentValidation, handleValidationErrors, forumController.addComment);

/**
 * @swagger
 * /forums/{id}/comments/{commentId}:
 *   put:
 *     tags: [Forums]
 *     summary: Update a comment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Forum post ID
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Comment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Comment not found
 */
router.put('/:id/comments/:commentId', updateCommentValidation, handleValidationErrors, forumController.updateComment);

/**
 * @swagger
 * /forums/{id}/comments/{commentId}:
 *   delete:
 *     tags: [Forums]
 *     summary: Delete a comment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Forum post ID
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Comment not found
 */
router.delete('/:id/comments/:commentId', forumController.deleteComment);

module.exports = router;
