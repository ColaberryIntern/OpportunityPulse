const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Middleware to handle express-validator validation errors.
 * Returns a 400 response with field-level error details.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));
    return errorResponse(res, 'Validation failed', 400, formattedErrors);
  }
  next();
}

module.exports = { handleValidationErrors };
