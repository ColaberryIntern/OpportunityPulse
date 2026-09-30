const { errorResponse } = require('../utils/apiResponse');

/**
 * Require an explicit API-key scope.
 *
 * Deliberately does NOT accept a role as a substitute. Scopes are how machine
 * credentials are granted capability in this codebase; `role` is how humans are,
 * and it is what every admin WRITE route gates on. Letting a role satisfy a
 * scope here would quietly re-open that boundary.
 *
 * A human admin JWT is accepted separately and explicitly, because admins do
 * legitimately read these endpoints from the app.
 */
function requireScope(...required) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return errorResponse(res, 'Access denied. Authentication required.', 401);

    // Human admins may read. This is an explicit allowance, not a role-for-scope
    // substitution: it applies only where requireScope guards a READ route.
    if (user.role === 'admin') return next();

    const held = Array.isArray(user.scopes) ? user.scopes : [];
    const missing = required.filter((s) => !held.includes(s));
    if (missing.length) {
      return errorResponse(
        res,
        `Forbidden: missing scope(s) ${missing.join(', ')}.`,
        403,
      );
    }
    return next();
  };
}

module.exports = { requireScope };
