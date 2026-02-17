const { errorResponse } = require('../utils/apiResponse');

/**
 * Role-Based Access Control middleware.
 * Checks that the authenticated user has one of the required roles.
 * Must be used after verifyToken middleware.
 *
 * @param  {...string} requiredRoles - One or more role names that are permitted access.
 */
function checkPermissions(...requiredRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return errorResponse(res, 'Access denied. Authentication required.', 401);
    }

    if (!requiredRoles.includes(req.user.role)) {
      return errorResponse(res, 'Forbidden: insufficient permissions.', 403);
    }

    next();
  };
}

module.exports = { checkPermissions };
