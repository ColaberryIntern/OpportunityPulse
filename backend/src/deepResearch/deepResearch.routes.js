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

// ---- Phase 5 — observatory + temporal intelligence ------------------------
router.post('/observatory/refresh', ...admin, c.refreshObservatory);
router.get('/observatory', ...admin, c.getObservatoryDashboard);
router.get('/observatory/ecosystems', ...admin, c.getEcosystems);
router.get('/observatory/trajectories', ...admin, c.getTrajectories);
router.get('/observatory/decision-accuracy', ...admin, c.getDecisionAccuracy);
router.get('/observatory/predictive-capacity', ...admin, c.getPredictiveCapacity);
router.get('/observatory/drift', ...admin, c.getDriftAlerts);
router.post('/observatory/drift/:id/acknowledge', ...admin, c.acknowledgeDrift);
router.post('/observatory/drift/:id/dismiss', ...admin, c.dismissDrift);
router.get('/observatory/dependencies', ...admin, c.getDirectedDependencyGraph);
router.patch('/observatory/dependencies/:id', ...admin, jsonSmall, c.setDependencyEdgeStatus);
router.get('/observatory/history', ...admin, c.getHistoricalAnalytics);
router.get('/observatory/signals', ...admin, c.getSignalTimelines);

// ---- Phase 6 — adaptive strategic operations ------------------------------
router.get('/planning', ...admin, c.getPlanningWorkspace);
router.post('/planning/refresh', ...admin, jsonSmall, c.runAdaptiveRefresh);
router.get('/planning/refresh-runs', ...admin, c.listRefreshRuns);
router.get('/planning/refresh-runs/:id', ...admin, c.getRefreshRun);
router.get('/planning/analytics', ...admin, c.getAdaptiveAnalytics);
router.get('/planning/forecast-accuracy', ...admin, c.getForecastAccuracy);

router.get('/planning/interventions', ...admin, c.listInterventions);
router.post('/planning/interventions/:id/acknowledge', ...admin, c.acknowledgeIntervention);
router.post('/planning/interventions/:id/dismiss', ...admin, c.dismissIntervention);

router.get('/planning/strategic-recommendations', ...admin, c.listStrategicRecommendations);
router.post('/planning/strategic-recommendations/:id/acknowledge', ...admin, c.acknowledgeStrategicRecommendation);
router.post('/planning/strategic-recommendations/:id/dismiss', ...admin, c.dismissStrategicRecommendation);

router.get('/planning/venture-health', ...admin, c.getVentureHealth);
router.get('/planning/venture-health/:id', ...admin, c.getVentureHealthHistory);

router.get('/planning/operational-drift', ...admin, c.listOperationalDrift);
router.post('/planning/operational-drift/:id/acknowledge', ...admin, c.acknowledgeDriftItem);
router.post('/planning/operational-drift/:id/dismiss', ...admin, c.dismissDriftItem);

router.get('/planning/dependency-review', ...admin, c.listOpenDependencyEdges);
router.get('/planning/dependency-review/:id', ...admin, c.getDependencyReviews);
router.post('/planning/dependency-review/:id/actions', ...admin, jsonSmall, c.recordDependencyAction);

// ---- Phase 7 — traceability + opportunity action intelligence --------------
// Action intelligence dashboard (top-level).
router.get('/action-intelligence', ...admin, c.getActionIntelligence);

// Evidence / traceability.
router.get('/evidence/:kind/:id', ...admin, c.getEvidence);
router.post('/evidence/:kind/:id/rebuild', ...admin, c.rebuildEvidence);
router.get('/opportunities/:id/insights', ...admin, c.getOpportunityInsights);

// Justification.
router.get('/justification/:kind/:id', ...admin, c.getJustification);

// Cluster drilldown.
router.get('/clusters/:id/drilldown', ...admin, c.getClusterDrilldown);
router.post('/clusters/:id/drilldown/refresh', ...admin, c.refreshClusterDrilldown);

// Custom research runs.
router.get('/research-runs', ...admin, c.listResearchRuns);
router.post('/research-runs', ...admin, jsonSmall, c.createResearchRun);
router.post('/research-runs/preview', ...admin, jsonSmall, c.previewResearchQuery);
router.get('/research-runs/:id', ...admin, c.getResearchRun);
router.patch('/research-runs/:id', ...admin, jsonSmall, c.updateResearchRun);
router.post('/research-runs/:id/rerun', ...admin, c.rerunResearchRun);
router.delete('/research-runs/:id', ...admin, c.deleteResearchRun);

// Opportunity graph.
router.get('/graph/summary', ...admin, c.getGraphSummary);
router.get('/graph/neighborhood', ...admin, c.getGraphNeighborhood);
router.post('/graph/refresh', ...admin, c.refreshGraph);

// Relationships.
router.get('/relationships/recurring', ...admin, c.listRecurringRelationships);
router.post('/relationships/refresh', ...admin, jsonSmall, c.refreshRelationships);

// Proposal acceleration.
router.get('/acceleration/assets', ...admin, c.listAccelerationAssets);
router.post('/acceleration/refresh', ...admin, c.refreshAccelerationAssets);
router.get('/acceleration/suggest/:id', ...admin, c.suggestAccelerationForOpportunity);

// Pursuit workspaces.
router.get('/pursuits', ...admin, c.listPursuits);
router.post('/pursuits', ...admin, jsonSmall, c.createPursuit);
router.get('/pursuits/:id', ...admin, c.getPursuit);
router.patch('/pursuits/:id', ...admin, jsonSmall, c.updatePursuit);
router.delete('/pursuits/:id', ...admin, c.deletePursuit);

// ---- report (:id) routes --------------------------------------------------

router.get('/:id', ...admin, c.getReport);
router.get('/:id/status', ...admin, c.getStatus);
router.get('/:id/versions', ...admin, c.getVersions);
router.post('/:id/rerun', ...admin, c.reRun);
router.patch('/:id/flags', ...admin, jsonSmall, c.setFlags);
router.post('/:id/generate-requirements', ...admin, jsonSmall, c.generateRequirements);

module.exports = router;
