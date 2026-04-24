const { errorResponse } = require('../utils/apiResponse');

// Read the flag fresh on every request — do NOT capture at module load.
// Enables env changes to take effect on the next request in tests, and makes
// the prototype fully reversible without touching code.
function isBonfireEnabled() {
  return String(process.env.BONFIRE_ENGINE_ENABLED || '').toLowerCase() === 'true';
}

// Middleware: 404 every bonfire route when the flag is off. The /flag probe
// endpoint is mounted BEFORE this middleware in bonfire.routes.js so the
// frontend can still ask.
function requireBonfireEnabled(req, res, next) {
  if (!isBonfireEnabled()) {
    return res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      code: 404,
    });
  }
  next();
}

module.exports = { isBonfireEnabled, requireBonfireEnabled };
