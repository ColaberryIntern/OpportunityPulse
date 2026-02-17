/**
 * Standardized API response helpers.
 * All API responses follow the shape: { status, message, data?, code }
 */

function successResponse(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    status: 'success',
    message,
    data,
    code: statusCode,
  });
}

function errorResponse(res, message = 'An error occurred', statusCode = 500, errors = null) {
  const response = {
    status: 'error',
    message,
    code: statusCode,
  };
  if (errors) {
    response.errors = errors;
  }
  return res.status(statusCode).json(response);
}

function paginatedResponse(res, data, pagination, message = 'Success') {
  return res.status(200).json({
    status: 'success',
    message,
    data,
    pagination,
    code: 200,
  });
}

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
};
