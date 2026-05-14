// Deep Research Intelligence Engine — routes.
//
// Mounted at /api/v1/deep-research. Admin-only: deep research synthesis is
// an expensive, strategy-shaping operation — same access posture as the
// other OIED action endpoints (generate, bundle strategy, partner search).

const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const c = require('./deepResearch.controller');

const router = express.Router();

// Run a deep research synthesis (manual — from the My Opportunities button).
router.post(
  '/run',
  verifyToken, checkPermissions(ROLES.ADMIN), express.json({ limit: '64kb' }), c.run,
);

// Read a full report (report + venture ideas + generation jobs).
router.get('/:id', verifyToken, checkPermissions(ROLES.ADMIN), c.getReport);

// Lightweight status poll — drives the report page's loading state.
router.get('/:id/status', verifyToken, checkPermissions(ROLES.ADMIN), c.getStatus);

// Kick off requirements generation for one venture idea on a report.
router.post(
  '/:id/generate-requirements',
  verifyToken, checkPermissions(ROLES.ADMIN), express.json({ limit: '4kb' }), c.generateRequirements,
);

// Poll a project generation job's progress.
router.get('/jobs/:id/status', verifyToken, checkPermissions(ROLES.ADMIN), c.getJobStatus);

module.exports = router;
