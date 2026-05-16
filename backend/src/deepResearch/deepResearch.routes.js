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

// ---- Phase 7.5 — strategic context bridge ---------------------------------
// Returns the full strategic context summary (banner + channel breakdown +
// linked pursuits + opportunity ids) for any insight kind.
router.get('/context/:kind/:id', ...admin, c.getStrategicContext);
// Per-opportunity traceability within an active context (for the
// expandable traceability panel on My Opportunities rows).
router.get('/context/opportunity/:id/trace', ...admin, c.getOpportunityContextTrace);

// ---- Phase 8 — pursuit activation + capture intelligence ------------------
// Pursuit activation
router.post('/pursuits/activate', ...admin, jsonSmall, c.activatePursuit);
router.get('/pursuits/activations', ...admin, c.listPursuitActivations);

// Review Queue handoff
router.post('/pursuits/:id/generate-drafts', ...admin, jsonSmall, c.generatePursuitDrafts);
router.get('/pursuits/:id/handoffs', ...admin, c.listPursuitHandoffs);

// Proposal readiness
router.post('/pursuits/:id/readiness/score', ...admin, c.scorePursuitReadiness);
router.get('/pursuits/:id/readiness', ...admin, c.getPursuitReadiness);

// Opportunity expansion
router.get('/expansion/:kind/:id', ...admin, c.getOpportunityExpansion);

// Venture conflict
router.post('/ventures/:id/conflicts', ...admin, c.computeVentureConflicts);
router.get('/ventures/:id/conflicts', ...admin, c.listVentureConflicts);

// Research-to-revenue
router.post('/research-revenue/refresh', ...admin, jsonSmall, c.refreshResearchRevenue);
router.get('/research-revenue', ...admin, c.listResearchRevenue);

// Capture strategy
router.post('/pursuits/:id/capture-strategy', ...admin, c.buildCaptureForPursuit);
router.get('/pursuits/:id/capture-strategy', ...admin, c.getCaptureForPursuit);

// Submission readiness foundations
router.get('/pursuits/:id/submission-artifacts', ...admin, c.listSubmissionArtifactsForPursuit);
router.post('/pursuits/:id/submission-artifacts', ...admin, jsonSmall, c.addSubmissionArtifact);
router.post('/pursuits/:id/submission-artifacts/template', ...admin, c.applySubmissionTemplate);
router.patch('/submission-artifacts/:id', ...admin, jsonSmall, c.updateSubmissionArtifact);
router.delete('/submission-artifacts/:id', ...admin, c.deleteSubmissionArtifact);

// ---- Phase 9 — submission readiness + compliance intelligence ------------
// Capture Operations Dashboard
router.get('/capture-ops', ...admin, c.getCaptureOps);

// RFP attachments per pursuit
router.get('/pursuits/:id/rfp-attachments', ...admin, c.listRfpAttachments);
router.post('/pursuits/:id/rfp-attachments', ...admin, jsonLarge, c.addRfpAttachment);
router.get('/pursuits/:id/rfp-attachments/summary', ...admin, c.summarizeRfpAttachments);
router.patch('/rfp-attachments/:id', ...admin, jsonLarge, c.updateRfpAttachment);
router.delete('/rfp-attachments/:id', ...admin, c.deleteRfpAttachment);

// Proposal artifact vault (org-wide)
router.get('/proposal-artifacts', ...admin, c.listProposalArtifacts);
router.post('/proposal-artifacts', ...admin, jsonLarge, c.addProposalArtifact);
router.post('/proposal-artifacts/refresh-expirations', ...admin, c.refreshArtifactExpirations);
router.patch('/proposal-artifacts/:id', ...admin, jsonLarge, c.updateProposalArtifact);
router.delete('/proposal-artifacts/:id', ...admin, c.deleteProposalArtifact);

// Compliance matrix
router.get('/pursuits/:id/compliance-matrix', ...admin, c.getComplianceMatrix);
router.post('/pursuits/:id/compliance-matrix/build', ...admin, jsonLarge, c.buildComplianceMatrix);
router.patch('/compliance-matrix-items/:id', ...admin, jsonSmall, c.updateComplianceMatrixItem);

// Submission packages
router.get('/pursuits/:id/submission-packages', ...admin, c.listSubmissionPackages);
router.post('/pursuits/:id/submission-packages', ...admin, jsonSmall, c.assembleSubmissionPackage);
router.get('/submission-packages/:id', ...admin, c.getSubmissionPackage);
router.patch('/submission-packages/:id', ...admin, jsonSmall, c.updateSubmissionPackage);

// Proposal timeline
router.get('/pursuits/:id/timeline', ...admin, c.listProposalTimeline);
router.post('/pursuits/:id/timeline', ...admin, jsonSmall, c.addTimelineEvent);
router.post('/pursuits/:id/timeline/seed', ...admin, jsonSmall, c.seedDefaultTimeline);
router.patch('/timeline-events/:id', ...admin, jsonSmall, c.updateTimelineEvent);

// Compliance gaps
router.get('/pursuits/:id/compliance-gaps', ...admin, c.listComplianceGaps);
router.post('/pursuits/:id/compliance-gaps/refresh', ...admin, c.refreshComplianceGaps);
router.patch('/compliance-gaps/:id', ...admin, jsonSmall, c.updateComplianceGap);

// Submission readiness engine + parallel draft queue + context injector
router.post('/pursuits/:id/submission-readiness/score', ...admin, c.scoreSubmissionReadiness);
router.post('/pursuits/:id/parallel-drafts', ...admin, jsonSmall, c.enqueueParallelDrafts);
router.get('/pursuits/:id/parallel-drafts', ...admin, c.listParallelDraftJobs);
router.get('/pursuits/:id/context-block', ...admin, c.getPursuitContextBlock);

// ---- report (:id) routes --------------------------------------------------

router.get('/:id', ...admin, c.getReport);
router.get('/:id/status', ...admin, c.getStatus);
router.get('/:id/versions', ...admin, c.getVersions);
router.post('/:id/rerun', ...admin, c.reRun);
router.patch('/:id/flags', ...admin, jsonSmall, c.setFlags);
router.post('/:id/generate-requirements', ...admin, jsonSmall, c.generateRequirements);

module.exports = router;
