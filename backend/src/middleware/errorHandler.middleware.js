const logger = require('../logging/logger');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Global error handler middleware.
 * Catches all unhandled errors and returns a standardized error response.
 * Ensures no stack traces leak to clients in production.
 */
function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return errorResponse(res, 'Validation error', 400, errors);
  }

  // Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    return errorResponse(res, 'Resource already exists', 409);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Invalid token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Token expired', 401);
  }

  // Default to 500 internal server error
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  return errorResponse(res, message, statusCode);
}

module.exports = errorHandler;
