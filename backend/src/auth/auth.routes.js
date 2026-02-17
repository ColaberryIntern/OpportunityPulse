const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { registerValidation, loginValidation, profileUpdateValidation, resendVerificationValidation } = require('./auth.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');

// Public routes (rate limited)
/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already in use
 */
router.post(
  '/register',
  authLimiter,
  registerValidation,
  handleValidationErrors,
  authController.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user and return JWT token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns accessToken
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/login',
  authLimiter,
  loginValidation,
  handleValidationErrors,
  authController.login
);

/**
 * @swagger
 * /auth/verify/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Verify user email address
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
router.get(
  '/verify/:token',
  authController.verifyEmail
);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend email verification link
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email resent
 *       404:
 *         description: User not found
 */
router.post(
  '/resend-verification',
  authLimiter,
  resendVerificationValidation,
  handleValidationErrors,
  authController.resendVerification
);

// Protected routes (require JWT)
/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/me',
  verifyToken,
  authController.getProfile
);

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     tags: [Auth]
 *     summary: Update current user profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               company:
 *                 type: string
 *               interests:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put(
  '/profile',
  verifyToken,
  profileUpdateValidation,
  handleValidationErrors,
  authController.updateProfile
);

module.exports = router;
