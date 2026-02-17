const authService = require('./auth.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');
const { logAuditEvent } = require('../logging/audit.service');

async function register(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.registerUser({ email, password });

    logAuditEvent({
      userId: result.userId,
      action: 'user_registered',
      resource: 'users',
      resourceId: result.userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { userId: result.userId }, result.message, 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser({ email, password });

    logAuditEvent({
      userId: result.user.id,
      action: 'user_login',
      resource: 'auth',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, result, 'Login successful.');
  } catch (error) {
    if (error.statusCode) {
      logAuditEvent({
        action: 'login_failed',
        resource: 'auth',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { email: req.body.email },
      });
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.params;
    const result = await authService.verifyEmail(token);

    return successResponse(res, null, result.message);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const user = await authService.getUserProfile(req.user.userId);
    return successResponse(res, { user }, 'Profile retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { name, company, interests } = req.body;
    const user = await authService.updateProfile(req.user.userId, {
      name,
      company,
      interests,
    });

    logAuditEvent({
      userId: req.user.userId,
      action: 'profile_updated',
      resource: 'users',
      resourceId: req.user.userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { user }, 'Profile updated successfully.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    const result = await authService.resendVerification(req.body.email);
    return successResponse(res, result, 'Verification email sent.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  register,
  login,
  verifyEmail,
  getProfile,
  updateProfile,
  resendVerification,
};
