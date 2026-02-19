const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { registerValidation, loginValidation, profileUpdateValidation, resendVerificationValidation, changePasswordValidation, forgotPasswordValidation, resetPasswordValidation } = require('./auth.validation');
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

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
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
 *         description: Generic success message (always returned for security)
 */
router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordValidation,
  handleValidationErrors,
  authController.forgotPassword
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using a valid reset token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired reset token
 */
router.post(
  '/reset-password',
  authLimiter,
  resetPasswordValidation,
  handleValidationErrors,
  authController.resetPassword
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

/**
 * @swagger
 * /auth/change-password:
 *   put:
 *     tags: [Auth]
 *     summary: Change current user's password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Current password incorrect or unauthorized
 *       400:
 *         description: Validation error
 */
router.put(
  '/change-password',
  verifyToken,
  changePasswordValidation,
  handleValidationErrors,
  authController.changePassword
);

/**
 * @swagger
 * /auth/account:
 *   delete:
 *     tags: [Auth]
 *     summary: Delete current user account and all associated data (GDPR Article 17)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password for confirmation
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       401:
 *         description: Incorrect password or unauthorized
 *       404:
 *         description: User not found
 */
router.delete(
  '/account',
  verifyToken,
  authController.deleteAccount
);

/**
 * @swagger
 * /auth/my-data:
 *   get:
 *     tags: [Auth]
 *     summary: Export all user data (GDPR Article 20 — Data Portability)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exportDate:
 *                   type: string
 *                   format: date-time
 *                 profile:
 *                   type: object
 *                 subscriptions:
 *                   type: array
 *                 content:
 *                   type: array
 *                 activities:
 *                   type: array
 *                 alerts:
 *                   type: array
 *                 alertPreferences:
 *                   type: object
 *                 forumPosts:
 *                   type: array
 *                 comments:
 *                   type: array
 *                 savedOpportunities:
 *                   type: array
 *                 feedback:
 *                   type: array
 *                 apiKeys:
 *                   type: array
 *                 webhooks:
 *                   type: array
 *                 behaviorProfile:
 *                   type: object
 *                 notifications:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get(
  '/my-data',
  verifyToken,
  authController.exportData
);

module.exports = router;
