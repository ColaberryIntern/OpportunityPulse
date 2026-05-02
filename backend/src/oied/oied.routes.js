const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const c = require('./oied.controller');

const router = express.Router();

// All OIED routes require authentication. Action generation + status updates
// require admin (the spec calls these admin-only flows under /admin/).
router.get('/opportunities/my', verifyToken, c.listMy);

router.post(
  '/opportunities/:id/generate',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  c.generate,
);

router.get('/opportunity-outputs', verifyToken, c.listOutputs);
router.get('/opportunity-outputs/:id', verifyToken, c.getOutput);
router.patch(
  '/opportunity-outputs/:id/status',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  c.patchOutput,
);

// Events: any authenticated user can record (UI tracking).
router.post('/opportunity-events', verifyToken, c.postEvent);

module.exports = router;
