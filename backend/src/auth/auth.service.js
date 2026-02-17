const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, UserRole, Subscription } = require('../models');
const { sendVerificationEmail } = require('../utils/email');
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
async function updateProfile(userId, { name, company, interests }) {
  const user = await User.findByPk(userId);

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (name !== undefined) user.name = name;
  if (company !== undefined) user.company = company;
  if (interests !== undefined) user.interests = interests;

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

module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
  getUserProfile,
  updateProfile,
  resendVerification,
  AppError,
};
