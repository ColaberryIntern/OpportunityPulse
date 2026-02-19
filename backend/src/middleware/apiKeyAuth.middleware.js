const { errorResponse } = require('../utils/apiResponse');
const apiKeyService = require('../apiKeys/apiKey.service');

/**
 * Middleware that authenticates requests via the X-API-Key header.
 * On success, sets req.user with userId, email, role info, and apiKey flag.
 */
async function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return errorResponse(res, 'Access denied. No API key provided.', 401);
  }

  try {
    const userInfo = await apiKeyService.validateApiKey(apiKey);
    req.user = {
      userId: userInfo.userId,
      email: userInfo.email,
      roleId: userInfo.roleId,
      scopes: userInfo.scopes,
      apiKey: true,
    };
    next();
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    return errorResponse(res, 'API key authentication failed.', 401);
  }
}

/**
 * Middleware that tries JWT authentication first, then falls back to API key.
 * Use this on routes that should accept either authentication method.
 */
function verifyTokenOrApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // If a Bearer token is present, try JWT first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      // If JWT fails and no API key, return JWT error
      if (!apiKey) {
        if (err.name === 'TokenExpiredError') {
          return errorResponse(res, 'Token expired. Please log in again.', 401);
        }
        return errorResponse(res, 'Invalid token.', 401);
      }
      // If JWT fails but API key is present, fall through to API key auth
    }
  }

  // Try API key authentication
  if (apiKey) {
    return verifyApiKey(req, res, next);
  }

  return errorResponse(res, 'Access denied. No authentication provided.', 401);
}

module.exports = { verifyApiKey, verifyTokenOrApiKey };
