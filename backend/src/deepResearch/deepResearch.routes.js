// Deep Research Intelligence Engine — routes.
//
// Mounted at /api/v1/deep-research. Admin-only — deep research synthesis is
// an expensive, strategy-shaping operation.
//
// Route ordering matters: the static + collection routes (/run, /briefings*,
// /jobs/*, and the GET / index) are declared BEFORE the /:id param routes so
// the param matcher can't swallow them.

const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const c = require('./deepResearch.controller');

const router = express.Router();
const admin = [verifyToken, checkPermissions(ROLES.ADMIN)];
const jsonSmall = express.json({ limit: '8kb' });
const jsonLarge = express.json({ limit: '64kb' });

// ---- collection / static routes (must precede /:id) -----------------------

// Reports index — searchable + filterable list.
router.get('/', ...admin, c.listReports);

// Run a fresh deep research synthesis.
router.post('/run', ...admin, jsonLarge, c.run);

// Briefing center.
router.get('/briefings', ...admin, c.listBriefings);
router.get('/briefings/preview', ...admin, c.previewBriefing);
router.get('/briefings/history', ...admin, c.briefingHistory);
router.post('/briefings', ...admin, jsonSmall, c.createBriefing);
router.patch('/briefings/:id', ...admin, jsonSmall, c.updateBriefing);
router.delete('/briefings/:id', ...admin, c.deleteBriefing);

// Project generation job status poll.
router.get('/jobs/:id/status', ...admin, c.getJobStatus);

// ---- Phase 3 — execution intelligence -------------------------------------
// Venture-scoped (static `ventures` + `execution` prefixes, so they never
// collide with the /:id param routes).
router.get('/ventures/:id/lifecycle', ...admin, c.getLifecycle);
router.post('/ventures/:id/lifecycle', ...admin, jsonSmall, c.transitionLifecycle);
router.patch('/ventures/:id/owner', ...admin, jsonSmall, c.setVentureOwner);
router.post('/ventures/:id/assess', ...admin, c.assessVenture);
router.post('/ventures/:id/mvp-plan', ...admin, c.planMvp);
router.get('/ventures/:id/execution', ...admin, c.getVentureExecution);
// Execution dashboard.
router.get('/execution/queue', ...admin, c.getExecutionQueue);
router.get('/execution/pipeline', ...admin, c.getPipeline);

// ---- Phase 4 — portfolio intelligence -------------------------------------
router.post('/portfolio/refresh', ...admin, c.refreshPortfolio);
router.get('/portfolio', ...admin, c.getPortfolioDashboard);
router.get('/portfolio/capacity', ...admin, c.getCapacity);
router.get('/portfolio/ranking', ...admin, c.getPortfolioRanking);
router.get('/portfolio/forecasts', ...admin, c.getForecasts);
router.get('/portfolio/overlaps', ...admin, c.getOverlaps);
router.get('/portfolio/dependencies', ...admin, c.getDependencies);
router.get('/portfolio/plan', ...admin, c.getCapacityPlan);
router.get('/portfolio/templates', ...admin, c.getTemplates);
router.get('/portfolio/recommendations', ...admin, c.getRecommendations);
router.post('/portfolio/recommendations/:id/acknowledge', ...admin, c.acknowledgeRecommendation);
router.post('/portfolio/recommendations/:id/dismiss', ...admin, c.dismissRecommendation);
router.get('/portfolio/operations', ...admin, c.getOperationalMetrics);

// ---- report (:id) routes --------------------------------------------------

router.get('/:id', ...admin, c.getReport);
router.get('/:id/status', ...admin, c.getStatus);
router.get('/:id/versions', ...admin, c.getVersions);
router.post('/:id/rerun', ...admin, c.reRun);
router.patch('/:id/flags', ...admin, jsonSmall, c.setFlags);
router.post('/:id/generate-requirements', ...admin, jsonSmall, c.generateRequirements);

module.exports = router;
