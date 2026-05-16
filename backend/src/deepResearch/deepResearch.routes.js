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
const { tenantMiddleware } = require('./tenantIsolation.service');
const admin = [verifyToken, checkPermissions(ROLES.ADMIN), tenantMiddleware];
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

// ---- Phase 10 — operational scalability + execution infrastructure -------
// Capture Infrastructure dashboard
router.get('/capture-infra', ...admin, c.getCaptureInfra);

// Worker jobs
router.get('/worker-jobs', ...admin, c.listWorkerJobs);
router.get('/worker-jobs/:id', ...admin, c.getWorkerJob);
router.post('/worker-jobs/:id/cancel', ...admin, c.cancelWorkerJob);
router.post('/worker-jobs/drain', ...admin, jsonSmall, c.drainWorkerOnce);

// Proposal execution queue
router.post('/pursuits/:id/execution-queue/draft-batch', ...admin, jsonSmall, c.enqueueExecutionDraftBatch);
router.post('/pursuits/:id/execution-queue/single', ...admin, jsonSmall, c.enqueueExecutionSingleJob);
router.get('/execution-queue', ...admin, c.listExecutionQueue);
router.get('/execution-queue/:id', ...admin, c.getExecutionQueueEntry);
router.post('/execution-queue/:id/refresh', ...admin, c.refreshExecutionEntry);
router.post('/execution-queue/:id/cancel', ...admin, c.cancelExecutionEntry);

// SLA intelligence
router.post('/sla/scan', ...admin, c.runSlaScan);
router.get('/sla/events', ...admin, c.listSlaEvents);
router.patch('/sla/events/:id', ...admin, jsonSmall, c.updateSlaEvent);

// Artifact lifecycle
router.post('/artifact-lifecycle/scan', ...admin, c.runArtifactLifecycleScan);
router.get('/artifact-lifecycle/renewals', ...admin, c.recommendArtifactRenewals);
router.get('/artifact-lifecycle/:id/events', ...admin, c.listArtifactLifecycleEvents);

// Queue observability
router.get('/queue-observability', ...admin, c.getQueueObservability);
router.post('/queue-observability/snapshot', ...admin, jsonSmall, c.snapshotQueueMetrics);
router.get('/queue-observability/snapshots', ...admin, c.getQueueSnapshots);

// Storage assets
router.post('/storage-assets', ...admin, jsonLarge, c.registerStorageAsset);
router.get('/storage-assets', ...admin, c.listStorageAssets);
router.get('/storage-assets/:id/signed-url', ...admin, c.getStorageSignedUrl);
router.delete('/storage-assets/:id', ...admin, c.deleteStorageAsset);

// Durable draft generation
router.post('/pursuits/:id/durable-drafts', ...admin, jsonSmall, c.enqueueDurableDrafts);
router.get('/pursuits/:id/durable-drafts', ...admin, c.listDurableDrafts);

// Pursuit context preview
router.get('/pursuits/:id/context-block/preview', ...admin, c.previewPursuitContextBlock);

// LLM compliance augment
router.post('/pursuits/:id/compliance-matrix/llm-augment', ...admin, jsonLarge, c.llmAugmentComplianceMatrix);

// ---- Phase 11 — multi-tenant governance + operational auditability -------

// Governance dashboard composite
router.get('/governance', ...admin, c.getGovernance);

// Tenant settings
router.get('/governance/tenant', ...admin, c.getTenantSettings);
router.patch('/governance/tenant', ...admin, jsonSmall, c.updateTenantSettings);

// RBAC
router.get('/governance/me/permissions', verifyToken, c.describeMyPermissions);
router.get('/governance/roles', verifyToken, c.listRolesAndPermissions);
router.get('/governance/grants', ...admin, c.listRoleGrants);
router.post('/governance/grants', ...admin, jsonSmall, c.grantRole);
router.delete('/governance/grants/user/:userId', ...admin, c.revokeRoles);

// Audit trail
router.get('/governance/audit', ...admin, c.listAuditEvents);
router.get('/governance/audit/summary', ...admin, c.summarizeAuditTrail);
router.get('/governance/audit/export.csv', ...admin, c.exportAuditCsv);

// Event lineage
router.get('/governance/lineage/:kind/:id', ...admin, c.getLineage);
router.post('/governance/lineage', ...admin, jsonSmall, c.recordLineageEdge);
router.get('/governance/pursuits/:id/lineage', ...admin, c.getPursuitLineage);

// SLA escalation
router.post('/governance/sla-events/:id/actions', ...admin, jsonSmall, c.actOnSlaEvent);
router.get('/governance/sla-events/:id/history', ...admin, c.getSlaEventHistory);
router.get('/governance/sla/digest', ...admin, c.getSlaDigest);

// Workflow governance
router.get('/governance/workflows', ...admin, c.listWorkflowAssignments);
router.post('/governance/workflows', ...admin, jsonSmall, c.createWorkflowAssignment);
router.patch('/governance/workflows/:id', ...admin, jsonSmall, c.transitionWorkflowAssignment);
router.get('/governance/workflows/workloads', ...admin, c.operatorWorkloads);
router.get('/governance/workflows/bottlenecks', ...admin, c.workflowBottlenecks);

// Storage providers
router.get('/governance/storage/health', ...admin, c.storageProviderHealth);
router.get('/governance/storage/migration', ...admin, c.storageMigrationStatus);

// Real-time observability stream (SSE)
router.get('/governance/stream', verifyToken, c.observabilitySubscribe);
router.get('/governance/stream/health', ...admin, c.observabilityHealth);
router.post('/governance/stream/publish', ...admin, jsonSmall, c.observabilityPublish);

// Pursuit context prompt preview (Phase 11 — deterministic prompt composition)
router.get('/governance/pursuits/:id/prompt-block', ...admin, c.previewPursuitContextPrompt);

// ---- Phase 12 — tenant-safe operational consistency + provenance ---------

// Governance Integrity dashboard
router.get('/governance-integrity', ...admin, c.getGovernanceIntegrity);
router.post('/governance-integrity/snapshot', ...admin, jsonSmall, c.snapshotGovernanceIntegrity);
router.get('/governance-integrity/history', ...admin, c.listGovernanceIntegrity);

// Prompt provenance
router.get('/provenance/pursuit/:id', ...admin, c.listProvenanceForPursuit);
router.get('/provenance/output/:outputId', ...admin, c.getProvenanceByOutput);
router.get('/provenance/hash/:hash', ...admin, c.getProvenanceByHash);
router.get('/provenance/summary', ...admin, c.summarizeProvenance);
router.post('/provenance/pursuit/:id/build', ...admin, jsonSmall, c.buildProvenanceForPursuit);

// RBAC coverage
router.get('/rbac/coverage', ...admin, c.getRbacCoverage);
router.post('/rbac/coverage/snapshot', ...admin, jsonSmall, c.snapshotRbacCoverage);

// SLA digest pipeline
router.post('/sla-digest/preview', ...admin, jsonSmall, c.previewSlaDigest);
router.post('/sla-digest/send', ...admin, jsonSmall, c.sendSlaDigest);
router.get('/sla-digest/emails', ...admin, c.listSlaEmails);
router.get('/sla-digest/summary', ...admin, c.summarizeSlaEmails);

// SSE stream metrics
router.get('/stream-metrics', ...admin, c.getStreamMetrics);
router.post('/stream-metrics/snapshot', ...admin, jsonSmall, c.snapshotStreamMetrics);
router.get('/stream-metrics/history', ...admin, c.listStreamMetrics);

// Asset migration
router.get('/asset-migration/plan', ...admin, c.planAssetMigration);
router.post('/asset-migration/run', ...admin, jsonSmall, c.runAssetMigration);
router.get('/asset-migration/summary', ...admin, c.summarizeAssetMigration);
router.get('/asset-migration/attempts', ...admin, c.recentAssetMigrationAttempts);

// Audit retention
router.get('/audit-retention/pressure', ...admin, c.getRetentionPressure);
router.get('/audit-retention/recommend', ...admin, c.recommendArchive);
router.post('/audit-retention/archive', ...admin, jsonSmall, c.archiveWindow);
router.get('/audit-retention/archives', ...admin, c.listArchives);

// ---- report (:id) routes --------------------------------------------------

router.get('/:id', ...admin, c.getReport);
router.get('/:id/status', ...admin, c.getStatus);
router.get('/:id/versions', ...admin, c.getVersions);
router.post('/:id/rerun', ...admin, c.reRun);
router.patch('/:id/flags', ...admin, jsonSmall, c.setFlags);
router.post('/:id/generate-requirements', ...admin, jsonSmall, c.generateRequirements);

module.exports = router;
