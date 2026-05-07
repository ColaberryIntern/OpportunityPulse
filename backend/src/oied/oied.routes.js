const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { verifyJwtOrIntelligenceKey } = require('../middleware/intelligenceAuth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const c = require('./oied.controller');
const intel = require('./intelligence.controller');
const partner = require('./partner.controller');

const router = express.Router();

// v7: bridge-gated routes accept BOTH JWT (existing React app) and the
// static OIED_INTELLIGENCE_API_KEY (companion Claude system).
// Non-bridge routes (briefing, triggers, billing, weekly-summary, etc.)
// stay JWT-only — their blast radius is too big to expose to a service
// account today.
const BRIDGE = verifyJwtOrIntelligenceKey;

// ---- Bridge READ endpoints (envelope-wrapped, dual-auth) ---------------
router.get('/recommendations',          BRIDGE, c.listRecommendations);
router.get('/opportunities/my',         BRIDGE, c.listMy);
router.get('/opportunities/execution',  BRIDGE, intel.listExecutionQueueIntelligence);
router.get('/opportunities/:id',        BRIDGE, intel.getOpportunityIntelligence);
router.get('/bundles',                  BRIDGE, c.listBundles);
router.get('/bundles/:id/blueprint',    BRIDGE, intel.getBundleBlueprintIntelligence);
router.get('/revenue',                  BRIDGE, intel.getRevenueAlias);
router.get('/channels/summary',         BRIDGE, intel.getChannelsSummary);
router.get('/news/word-cloud',          BRIDGE, intel.getNewsWordCloudHandler);
router.get('/profile',                  BRIDGE, c.getMyProfile);

// ---- Bridge ACTION endpoints (dual-auth + admin) -----------------------
router.post(
  '/opportunities/:id/generate',
  BRIDGE, checkPermissions(ROLES.ADMIN), c.generate,
);
router.post(
  '/opportunities/:id/mark-submitted',
  BRIDGE, c.markSubmitted,
);
router.post(
  '/opportunities/:id/mark-result',
  BRIDGE, c.markResult,
);
// v9: partner discovery + outreach drafting (bridge-gated, admin-only).
router.post(
  '/opportunities/:id/partner-search',
  BRIDGE, checkPermissions(ROLES.ADMIN), partner.partnerSearch,
);
router.post(
  '/opportunities/:id/partner-outreach',
  BRIDGE, checkPermissions(ROLES.ADMIN), partner.partnerOutreach,
);
router.post(
  '/bundles/:id/strategy',
  BRIDGE, checkPermissions(ROLES.ADMIN), c.generateBundleStrategy,
);
router.post(
  '/bundles/:id/blueprint',
  BRIDGE, checkPermissions(ROLES.ADMIN), c.generateBundleBlueprint,
);

// ---- Non-bridge routes (JWT-only) --------------------------------------

router.get('/opportunity-outputs', verifyToken, c.listOutputs);
router.get('/opportunity-outputs/:id', verifyToken, c.getOutput);
router.patch(
  '/opportunity-outputs/:id/status',
  verifyToken, checkPermissions(ROLES.ADMIN), c.patchOutput,
);

// Events: any authenticated user can record (UI tracking).
router.post('/opportunity-events', verifyToken, c.postEvent);

// Per-org business profile.
router.post('/profile',   verifyToken, c.postMyProfile);
router.patch('/profile',  verifyToken, c.patchMyProfile);

// Bundles (rebuild is admin-only).
router.post('/bundles/run', verifyToken, checkPermissions(ROLES.ADMIN), c.runBundler);

// v3 — Revenue Intelligence Layer.
router.get('/conversion-stats', verifyToken, c.getConversionStats);

// v4 — Autonomous Revenue Engine.
router.get('/briefing',         verifyToken, c.getBriefing);
router.post('/briefing/send',   verifyToken, checkPermissions(ROLES.ADMIN), c.sendBriefing);
router.post('/triggers/run',    verifyToken, checkPermissions(ROLES.ADMIN), c.runTriggers);
router.get('/triggers/logs',    verifyToken, checkPermissions(ROLES.ADMIN), c.listTriggerLogs);

// v5 — Revenue Velocity System.
// Note: GET /execution-queue is the legacy URL — kept for the React app.
// The bridge-friendly alias is GET /opportunities/execution above.
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

// v6 — Autonomous + Monetization Layer.
router.get('/velocity', verifyToken, c.getVelocity);

module.exports = router;
