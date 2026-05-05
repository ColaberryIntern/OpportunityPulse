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

// Per-user business profile.
router.get('/profile',    verifyToken, c.getMyProfile);
router.post('/profile',   verifyToken, c.postMyProfile);
router.patch('/profile',  verifyToken, c.patchMyProfile);

// Bundles: read open to all auth'd; rebuild + strategy are admin-only.
router.get('/bundles',         verifyToken, c.listBundles);
router.post('/bundles/run',    verifyToken, checkPermissions(ROLES.ADMIN), c.runBundler);
router.post(
  '/bundles/:id/strategy',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  c.generateBundleStrategy,
);

// v3 — Revenue Intelligence Layer.
router.get('/recommendations',          verifyToken, c.listRecommendations);
router.get('/conversion-stats',         verifyToken, c.getConversionStats);
router.post(
  '/opportunities/:id/mark-result',
  verifyToken,
  c.markResult,
);

// v4 — Autonomous Revenue Engine.
router.get('/briefing',         verifyToken, c.getBriefing);
router.post('/briefing/send',   verifyToken, checkPermissions(ROLES.ADMIN), c.sendBriefing);
router.post('/triggers/run',    verifyToken, checkPermissions(ROLES.ADMIN), c.runTriggers);
router.get('/triggers/logs',    verifyToken, checkPermissions(ROLES.ADMIN), c.listTriggerLogs);
router.post(
  '/bundles/:id/blueprint',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  c.generateBundleBlueprint,
);

// v5 — Revenue Velocity System.
router.get('/execution-queue',           verifyToken, c.listExecutionQueue);
router.get('/revenue/dashboard',         verifyToken, c.getRevenueDashboard);
router.get('/feedback/pending-outcomes', verifyToken, c.getPendingOutcomes);
router.get('/feedback/weekly-summary',   verifyToken, c.getWeeklySummary);
router.post('/feedback/weekly-summary/send', verifyToken, checkPermissions(ROLES.ADMIN), c.sendWeeklySummary);
router.post('/bundles/:id/execution-plan',       verifyToken, checkPermissions(ROLES.ADMIN), c.generateExecutionPlan);
router.get('/bundles/:id/execution-plan',        verifyToken, c.getExecutionPlan);
router.post('/bundles/:id/execution-plan/start', verifyToken, checkPermissions(ROLES.ADMIN), c.startBuild);
router.get('/billing/usage',  verifyToken, c.getBillingUsage);
router.get('/billing/plan',   verifyToken, c.getBillingPlan);
router.patch('/billing/plan', verifyToken, checkPermissions(ROLES.ADMIN), c.changeBillingPlan);

module.exports = router;
