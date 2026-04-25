const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const { isScraperEnabled } = require('./scraper');
const controller = require('./scraper.controller');

const router = express.Router();

// requireScraperEnabled is local to this router. Mirrors bonfire.middleware's
// per-request flag read so toggling the env var takes effect immediately.
function requireScraperEnabled(req, res, next) {
  if (!isScraperEnabled()) {
    return res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      code: 404,
    });
  }
  next();
}

// /flag is intentionally OUTSIDE the gate so the frontend (or admin tooling)
// can probe whether the scraper is on without seeing a 404.
router.get('/flag', controller.getFlag);

router.use(requireScraperEnabled);
router.post('/run', verifyToken, checkPermissions(ROLES.ADMIN), controller.triggerRun);
router.get('/status', verifyToken, checkPermissions(ROLES.ADMIN), controller.getStatus);

module.exports = router;
