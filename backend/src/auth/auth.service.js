const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  User, UserRole, Subscription,
  Content, UserActivity, Feedback, ForumPost, Comment,
  Alert, AlertPreference, BehaviorProfile,
  ApiKey, Webhook, WebhookDelivery, SavedOpportunity, Notification,
  PersonalMatch,
  sequelize,
} = require('../models');
const { Op } = require('sequelize');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const logger = require('../logging/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Register a new user.
 * Creates user with hashed password (via model hook), assigns default consultant role,
 * and generates email verification token.
 */
async function registerUser({ email, password }) {
  // Check if email already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new AppError('An account with this email already exists.', 409);
  }

  // Get default consultant role
  const consultantRole = await UserRole.findOne({ where: { roleName: 'consultant' } });
  const roleId = consultantRole ? consultantRole.id : 2;

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Create user (password hashing happens in model hook)
  const user = await User.create({
    email,
    passwordHash: password, // model beforeCreate hook will hash this
    roleId,
    verificationToken,
    emailVerified: false,
  });

  // Auto-create free subscription
  await Subscription.create({
    userId: user.id,
    planType: 'free',
    startDate: new Date(),
    endDate: null,
  });

  // Send verification email (fire-and-forget — don't block registration)
  try {
    await sendVerificationEmail(user.email, verificationToken);
  } catch (emailError) {
    logger.warn('Failed to send verification email', { email: user.email, error: emailError.message });
  }

  return {
    userId: user.id,
    message: 'Registration successful. Please verify your email.',
  };
}

/**
 * Authenticate a user and return a JWT access token.
 */
async function loginUser({ email, password }) {
  // Find user with role included
  const user = await User.findOne({
    where: { email },
    include: [{ model: UserRole, as: 'role' }],
  });

  if (!user) {
    throw new AppError('Invalid email or password.', 401);
  }

  // Validate password
  const isPasswordValid = await user.validatePassword(password);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password.', 401);
  }

  // Generate JWT
  const roleName = user.role ? user.role.roleName : 'consultant';
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: roleName,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );

  return {
    accessToken,
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    user: user.toSafeJSON(),
  };
}

/**
 * Verify a user's email address using the verification token.
 */
async function verifyEmail(token) {
  const user = await User.findOne({ where: { verificationToken: token } });

  if (!user) {
    throw new AppError('Invalid or expired verification token.', 400);
  }

  user.emailVerified = true;
  user.verificationToken = null;
  await user.save();

  return { message: 'Email verified successfully.' };
}

/**
 * Get a user's profile by ID (sensitive fields stripped via toSafeJSON).
 */
async function getUserProfile(userId) {
  const user = await User.findByPk(userId, {
    include: [{ model: UserRole, as: 'role' }],
  });

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  return user.toSafeJSON();
}

/**
 * Update a user's profile (name, company, interests only).
 */
async function updateProfile(userId, { name, company, interests, profileData }) {
  const user = await User.findByPk(userId);

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (name !== undefined) user.name = name;
  if (company !== undefined) user.company = company;
  if (interests !== undefined) user.interests = interests;
  if (profileData !== undefined) user.profileData = profileData;

  await user.save();

  return user.toSafeJSON();
}

/**
 * Resend verification email to a user who hasn't verified yet.
 */
async function resendVerification(email) {
  const user = await User.findOne({ where: { email } });

  if (!user) {
    throw new AppError('No account found with this email.', 404);
  }

  if (user.emailVerified) {
    throw new AppError('Email is already verified.', 400);
  }

  // Generate new token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.verificationToken = verificationToken;
  await user.save();

  await sendVerificationEmail(user.email, verificationToken);

  return { message: 'Verification email sent.' };
}

/**
 * Change a user's password after verifying their current password.
 */
async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError('User not found.', 404);

  const isValid = await user.validatePassword(currentPassword);
  if (!isValid) throw new AppError('Current password is incorrect.', 401);

  if (currentPassword === newPassword) {
    throw new AppError('New password must be different from current password.', 400);
  }

  // Setting passwordHash triggers the beforeUpdate hook which auto-hashes
  user.passwordHash = newPassword;
  await user.save();

  return { message: 'Password changed successfully.' };
}

/**
 * Handle forgot password request.
 * Always returns the same generic message regardless of whether the email exists (security).
 */
async function forgotPassword(email) {
  const genericMessage = 'If an account exists with that email, a reset link has been sent.';

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return { message: genericMessage };
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetToken = resetToken;
  user.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
  await user.save();

  // Send reset email (fire-and-forget — don't block response)
  sendPasswordResetEmail(email, resetToken).catch((emailError) => {
    logger.warn('Failed to send password reset email', { email, error: emailError.message });
  });

  return { message: genericMessage };
}

/**
 * Reset user password using a valid reset token.
 */
async function resetPassword(token, newPassword) {
  const user = await User.findOne({
    where: {
      resetToken: token,
      resetTokenExpiry: { [Op.gt]: new Date() },
    },
  });

  if (!user) {
    throw new AppError('Invalid or expired reset token.', 400);
  }

  // Setting passwordHash triggers the beforeUpdate hook which auto-hashes
  user.passwordHash = newPassword;
  user.resetToken = null;
  user.resetTokenExpiry = null;
  await user.save();

  return { message: 'Password has been reset successfully.' };
}

/**
 * Delete a user account and all associated data (GDPR Article 17 — Right to Erasure).
 * Requires password confirmation for security.
 * Uses a transaction to ensure atomicity.
 */
async function deleteAccount(userId, password) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  // Verify password before proceeding
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('Password is incorrect. Account deletion requires password confirmation.', 401);
  }

  const transaction = await sequelize.transaction();

  try {
    // Delete in order to respect foreign key constraints

    // Delete comments (references forum_posts and users)
    await Comment.destroy({ where: { user_id: userId }, transaction });

    // Delete forum posts (references users; comments already removed)
    await ForumPost.destroy({ where: { user_id: userId }, transaction });

    // Delete saved opportunities
    await SavedOpportunity.destroy({ where: { user_id: userId }, transaction });

    // Delete webhook deliveries (references webhooks) then webhooks
    const userWebhooks = await Webhook.findAll({ where: { user_id: userId }, attributes: ['id'], transaction });
    const webhookIds = userWebhooks.map((w) => w.id);
    if (webhookIds.length > 0) {
      await WebhookDelivery.destroy({ where: { webhook_id: webhookIds }, transaction });
    }
    await Webhook.destroy({ where: { user_id: userId }, transaction });

    // Delete API keys
    await ApiKey.destroy({ where: { user_id: userId }, transaction });

    // Delete notifications
    await Notification.destroy({ where: { user_id: userId }, transaction });

    // Delete alerts
    await Alert.destroy({ where: { user_id: userId }, transaction });

    // Delete alert preference (hasOne)
    await AlertPreference.destroy({ where: { user_id: userId }, transaction });

    // Delete personal matches
    await PersonalMatch.destroy({ where: { user_id: userId }, transaction });

    // Delete behavior profile (hasOne)
    await BehaviorProfile.destroy({ where: { user_id: userId }, transaction });

    // Delete user activity records
    await UserActivity.destroy({ where: { user_id: userId }, transaction });

    // Delete feedback records
    await Feedback.destroy({ where: { user_id: userId }, transaction });

    // Delete content records
    await Content.destroy({ where: { user_id: userId }, transaction });

    // Delete subscriptions
    await Subscription.destroy({ where: { user_id: userId }, transaction });

    // Finally, delete the user record itself
    await User.destroy({ where: { id: userId }, transaction });

    await transaction.commit();

    logger.info('Account deleted successfully (GDPR erasure)', { userId });

    return { message: 'Account deleted successfully.' };
  } catch (error) {
    await transaction.rollback();
    logger.error('Account deletion failed', { userId, error: error.message });
    throw new AppError('Account deletion failed. Please try again.', 500);
  }
}

/**
 * Export all user data (GDPR Article 20 — Right to Data Portability).
 * Returns a comprehensive structured JSON object of the user's data.
 */
async function exportUserData(userId) {
  const user = await User.findByPk(userId, {
    include: [{ model: UserRole, as: 'role' }],
  });

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  // Collect profile info (excluding sensitive fields)
  const profile = {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    interests: user.interests,
    profileData: user.profileData,
    emailVerified: user.emailVerified,
    role: user.role ? user.role.roleName : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  // Collect subscriptions
  const subscriptions = await Subscription.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect content items
  const content = await Content.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect user activity (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const activities = await UserActivity.findAll({
    where: {
      user_id: userId,
      createdAt: { [Op.gte]: ninetyDaysAgo },
    },
    attributes: { exclude: ['user_id'] },
  });

  // Collect alerts
  const alerts = await Alert.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect alert preferences
  const alertPreferences = await AlertPreference.findOne({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect forum posts
  const forumPosts = await ForumPost.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect comments
  const comments = await Comment.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect saved opportunities
  const savedOpportunities = await SavedOpportunity.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect feedback submissions
  const feedback = await Feedback.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect API keys (names only, not hashes)
  const apiKeys = await ApiKey.findAll({
    where: { user_id: userId },
    attributes: ['id', 'name', 'createdAt', 'expiresAt'],
  });

  // Collect webhooks (URLs and event types, not secrets)
  const webhooks = await Webhook.findAll({
    where: { user_id: userId },
    attributes: ['id', 'url', 'eventTypes', 'isActive', 'createdAt'],
  });

  // Collect behavior profile
  const behaviorProfile = await BehaviorProfile.findOne({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  // Collect notifications
  const notifications = await Notification.findAll({
    where: { user_id: userId },
    attributes: { exclude: ['user_id'] },
  });

  return {
    exportDate: new Date().toISOString(),
    profile,
    subscriptions,
    content,
    activities,
    alerts,
    alertPreferences,
    forumPosts,
    comments,
    savedOpportunities,
    feedback,
    apiKeys,
    webhooks,
    behaviorProfile,
    notifications,
  };
}

module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
  getUserProfile,
  updateProfile,
  resendVerification,
  changePassword,
  forgotPassword,
  resetPassword,
  deleteAccount,
  exportUserData,
  AppError,
};
