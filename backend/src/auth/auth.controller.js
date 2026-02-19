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
    const { name, company, interests, profileData } = req.body;
    const user = await authService.updateProfile(req.user.userId, {
      name,
      company,
      interests,
      profileData,
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

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user.userId, currentPassword, newPassword);

    logAuditEvent({
      userId: req.user.userId,
      action: 'password_changed',
      resource: 'users',
      resourceId: req.user.userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, result);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const result = await authService.forgotPassword(req.body.email);
    return successResponse(res, null, result.message);
  } catch (error) {
    // Always return 200 with generic message for security (don't reveal email existence)
    return successResponse(res, null, 'If an account exists with that email, a reset link has been sent.');
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword(token, newPassword);

    logAuditEvent({
      action: 'password_reset',
      resource: 'users',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, null, result.message);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const { password } = req.body;
    const result = await authService.deleteAccount(req.user.userId, password);

    logAuditEvent({
      userId: req.user.userId,
      action: 'account_deleted',
      resource: 'users',
      resourceId: req.user.userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, null, 'Account deleted successfully.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function exportData(req, res, next) {
  try {
    const data = await authService.exportUserData(req.user.userId);

    logAuditEvent({
      userId: req.user.userId,
      action: 'data_exported',
      resource: 'users',
      resourceId: req.user.userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, data, 'Data exported successfully.');
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
  changePassword,
  forgotPassword,
  resetPassword,
  deleteAccount,
  exportData,
};
