const jwt = require('jsonwebtoken');
const { errorResponse } = require('../utils/apiResponse');

/**
 * JWT authentication middleware.
 * Verifies the Authorization header contains a valid Bearer token.
 * Attaches decoded user info to req.user on success.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Access denied. No token provided.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token expired. Please log in again.', 401);
    }
    return errorResponse(res, 'Invalid token.', 401);
  }
}

/**
 * Dual-auth middleware: tries JWT first, falls back to API key.
 * Delegates to apiKeyAuth.middleware for the API key path.
 */
function verifyTokenOrApiKey(req, res, next) {
  const { verifyTokenOrApiKey: dual } = require('./apiKeyAuth.middleware');
  return dual(req, res, next);
}

module.exports = { verifyToken, verifyTokenOrApiKey };
