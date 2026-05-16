import api from './api';

// Deep Research Intelligence Engine — frontend API client.
// Mirrors backend routes mounted at /api/v1/deep-research.

const base = '/deep-research';

// Kick off a deep research synthesis. Pass the current search term and/or
// the explicit opportunity ids from the filtered My Opportunities results.
export async function runDeepResearch({ searchTerm, opportunityIds } = {}) {
  const res = await api.post(`${base}/run`, { searchTerm, opportunityIds });
  return res.data?.data;
}

// Full report — report + venture ideas + any generation jobs.
export async function getDeepResearchReport(id) {
  const res = await api.get(`${base}/${id}`);
  return res.data?.data;
}

// Lightweight status poll for the loading state.
export async function getDeepResearchStatus(id) {
  const res = await api.get(`${base}/${id}/status`);
  return res.data?.data;
}

// Start requirements generation for one venture idea on a report.
export async function generateRequirements(reportId, ventureIdeaId) {
  const res = await api.post(`${base}/${reportId}/generate-requirements`, { ventureIdeaId });
  return res.data?.data;
}

// Poll a project generation job's progress.
export async function getJobStatus(jobId) {
  const res = await api.get(`${base}/jobs/${jobId}/status`);
  return res.data?.data;
}

// ---- Phase 2 — reports index + management --------------------------------

// The searchable / filterable reports index.
export async function listReports(params = {}) {
  const res = await api.get(base, { params });
  return res.data?.data;
}

// Re-run a report (snapshots history, bumps version, re-synthesizes).
export async function reRunReport(id) {
  const res = await api.post(`${base}/${id}/rerun`);
  return res.data?.data;
}

// Toggle favorite / archived flags.
export async function setReportFlags(id, flags) {
  const res = await api.patch(`${base}/${id}/flags`, flags);
  return res.data?.data;
}

// Report version history (metadata only).
export async function getReportVersions(id) {
  const res = await api.get(`${base}/${id}/versions`);
  return res.data?.data?.versions || [];
}

// ---- Phase 2 — briefing center -------------------------------------------

export async function listBriefingSubscriptions() {
  const res = await api.get(`${base}/briefings`);
  return res.data?.data?.subscriptions || [];
}

export async function createBriefingSubscription(body) {
  const res = await api.post(`${base}/briefings`, body);
  return res.data?.data;
}

export async function updateBriefingSubscription(id, body) {
  const res = await api.patch(`${base}/briefings/${id}`, body);
  return res.data?.data;
}

export async function deleteBriefingSubscription(id) {
  const res = await api.delete(`${base}/briefings/${id}`);
  return res.data?.data;
}

export async function previewBriefing() {
  const res = await api.get(`${base}/briefings/preview`);
  return res.data?.data;
}

export async function getBriefingHistory() {
  const res = await api.get(`${base}/briefings/history`);
  return res.data?.data?.history || [];
}

// ---- Phase 3 — execution intelligence ------------------------------------

export async function getVentureLifecycle(ventureIdeaId) {
  const res = await api.get(`${base}/ventures/${ventureIdeaId}/lifecycle`);
  return res.data?.data;
}

export async function transitionVentureLifecycle(ventureIdeaId, toState, note) {
  const res = await api.post(`${base}/ventures/${ventureIdeaId}/lifecycle`, { toState, note });
  return res.data?.data;
}

export async function setVentureOwner(ventureIdeaId, owner) {
  const res = await api.patch(`${base}/ventures/${ventureIdeaId}/owner`, { owner });
  return res.data?.data;
}

// Run the deterministic engines (execution readiness + build-vs-monitor).
export async function assessVenture(ventureIdeaId) {
  const res = await api.post(`${base}/ventures/${ventureIdeaId}/assess`);
  return res.data?.data;
}

// Run the AI engines (MVP plan + launch strategy) + deployment readiness.
export async function planVentureMvp(ventureIdeaId) {
  const res = await api.post(`${base}/ventures/${ventureIdeaId}/mvp-plan`);
  return res.data?.data;
}

// All execution intelligence for one venture.
export async function getVentureExecution(ventureIdeaId) {
  const res = await api.get(`${base}/ventures/${ventureIdeaId}/execution`);
  return res.data?.data;
}

export async function getExecutionQueue(params = {}) {
  const res = await api.get(`${base}/execution/queue`, { params });
  return res.data?.data;
}

export async function getOpportunityPipeline() {
  const res = await api.get(`${base}/execution/pipeline`);
  return res.data?.data;
}

// ---- Phase 4 — portfolio intelligence ------------------------------------

export async function refreshPortfolio() {
  const res = await api.post(`${base}/portfolio/refresh`);
  return res.data?.data;
}
export async function getPortfolioDashboard() {
  const res = await api.get(`${base}/portfolio`);
  return res.data?.data;
}
export async function getPortfolioCapacity() {
  const res = await api.get(`${base}/portfolio/capacity`);
  return res.data?.data;
}
export async function getPortfolioRanking() {
  const res = await api.get(`${base}/portfolio/ranking`);
  return res.data?.data;
}
export async function getPortfolioForecasts() {
  const res = await api.get(`${base}/portfolio/forecasts`);
  return res.data?.data;
}
export async function getPortfolioDependencies() {
  const res = await api.get(`${base}/portfolio/dependencies`);
  return res.data?.data;
}
export async function getPortfolioPlan() {
  const res = await api.get(`${base}/portfolio/plan`);
  return res.data?.data;
}
export async function getPortfolioTemplates() {
  const res = await api.get(`${base}/portfolio/templates`);
  return res.data?.data?.templates || [];
}
export async function getPortfolioRecommendations() {
  const res = await api.get(`${base}/portfolio/recommendations`);
  return res.data?.data?.recommendations || [];
}
export async function acknowledgeRecommendation(id) {
  const res = await api.post(`${base}/portfolio/recommendations/${id}/acknowledge`);
  return res.data?.data;
}
export async function dismissRecommendation(id) {
  const res = await api.post(`${base}/portfolio/recommendations/${id}/dismiss`);
  return res.data?.data;
}
export async function getPortfolioOperations() {
  const res = await api.get(`${base}/portfolio/operations`);
  return res.data?.data;
}

// ---- Phase 5 — observatory + temporal intelligence -----------------------

export async function refreshObservatory() {
  const res = await api.post(`${base}/observatory/refresh`);
  return res.data?.data;
}
export async function getObservatoryDashboard(params = {}) {
  const res = await api.get(`${base}/observatory`, { params });
  return res.data?.data;
}
export async function acknowledgeDriftAlert(id) {
  const res = await api.post(`${base}/observatory/drift/${id}/acknowledge`);
  return res.data?.data;
}
export async function dismissDriftAlert(id) {
  const res = await api.post(`${base}/observatory/drift/${id}/dismiss`);
  return res.data?.data;
}
export async function setDependencyEdgeStatus(id, status) {
  const res = await api.patch(`${base}/observatory/dependencies/${id}`, { status });
  return res.data?.data;
}

// ---- Phase 6 — adaptive strategic operations -----------------------------

export async function getPlanningWorkspace(params = {}) {
  const res = await api.get(`${base}/planning`, { params });
  return res.data?.data;
}
export async function runAdaptiveRefresh(runType = 'full') {
  const res = await api.post(`${base}/planning/refresh`, { runType });
  return res.data?.data;
}
export async function listRefreshRuns(params = {}) {
  const res = await api.get(`${base}/planning/refresh-runs`, { params });
  return res.data?.data;
}
export async function getRefreshRun(id) {
  const res = await api.get(`${base}/planning/refresh-runs/${id}`);
  return res.data?.data;
}
export async function getAdaptiveAnalytics(params = {}) {
  const res = await api.get(`${base}/planning/analytics`, { params });
  return res.data?.data;
}
export async function getForecastAccuracy(params = {}) {
  const res = await api.get(`${base}/planning/forecast-accuracy`, { params });
  return res.data?.data;
}
export async function listInterventions(pendingOnly = false) {
  const res = await api.get(`${base}/planning/interventions`, { params: { pendingOnly } });
  return res.data?.data;
}
export async function acknowledgeIntervention(id) {
  const res = await api.post(`${base}/planning/interventions/${id}/acknowledge`);
  return res.data?.data;
}
export async function dismissIntervention(id) {
  const res = await api.post(`${base}/planning/interventions/${id}/dismiss`);
  return res.data?.data;
}
export async function listStrategicRecommendations(pendingOnly = false) {
  const res = await api.get(`${base}/planning/strategic-recommendations`, { params: { pendingOnly } });
  return res.data?.data;
}
export async function acknowledgeStrategicRecommendation(id) {
  const res = await api.post(`${base}/planning/strategic-recommendations/${id}/acknowledge`);
  return res.data?.data;
}
export async function dismissStrategicRecommendation(id) {
  const res = await api.post(`${base}/planning/strategic-recommendations/${id}/dismiss`);
  return res.data?.data;
}
export async function getVentureHealth() {
  const res = await api.get(`${base}/planning/venture-health`);
  return res.data?.data;
}
export async function getVentureHealthHistory(ventureId, params = {}) {
  const res = await api.get(`${base}/planning/venture-health/${ventureId}`, { params });
  return res.data?.data;
}
export async function listOperationalDrift(pendingOnly = false) {
  const res = await api.get(`${base}/planning/operational-drift`, { params: { pendingOnly } });
  return res.data?.data;
}
export async function acknowledgeDriftItem(id) {
  const res = await api.post(`${base}/planning/operational-drift/${id}/acknowledge`);
  return res.data?.data;
}
export async function dismissDriftItem(id) {
  const res = await api.post(`${base}/planning/operational-drift/${id}/dismiss`);
  return res.data?.data;
}
export async function listOpenDependencyEdges(params = {}) {
  const res = await api.get(`${base}/planning/dependency-review`, { params });
  return res.data?.data;
}
export async function getDependencyReviews(id) {
  const res = await api.get(`${base}/planning/dependency-review/${id}`);
  return res.data?.data;
}
export async function recordDependencyAction(id, { action, owner, note }) {
  const res = await api.post(`${base}/planning/dependency-review/${id}/actions`, { action, owner, note });
  return res.data?.data;
}

// ---- Phase 7 — traceability + opportunity action intelligence ------------

export async function getActionIntelligence() {
  const res = await api.get(`${base}/action-intelligence`);
  return res.data?.data;
}

export async function getEvidence(kind, id, params = {}) {
  const res = await api.get(`${base}/evidence/${kind}/${id}`, { params });
  return res.data?.data;
}
export async function rebuildEvidence(kind, id) {
  const res = await api.post(`${base}/evidence/${kind}/${id}/rebuild`);
  return res.data?.data;
}
export async function getOpportunityInsights(opportunityId) {
  const res = await api.get(`${base}/opportunities/${opportunityId}/insights`);
  return res.data?.data;
}

export async function getJustification(kind, id, { rebuild = false } = {}) {
  const res = await api.get(`${base}/justification/${kind}/${id}`, { params: { rebuild } });
  return res.data?.data;
}

export async function getClusterDrilldown(id, params = {}) {
  const res = await api.get(`${base}/clusters/${id}/drilldown`, { params });
  return res.data?.data;
}
export async function refreshClusterDrilldown(id) {
  const res = await api.post(`${base}/clusters/${id}/drilldown/refresh`);
  return res.data?.data;
}

export async function listResearchRuns(params = {}) {
  const res = await api.get(`${base}/research-runs`, { params });
  return res.data?.data;
}
export async function createResearchRun(body) {
  const res = await api.post(`${base}/research-runs`, body);
  return res.data?.data;
}
export async function previewResearchQuery(body) {
  const res = await api.post(`${base}/research-runs/preview`, body);
  return res.data?.data;
}
export async function getResearchRun(id) {
  const res = await api.get(`${base}/research-runs/${id}`);
  return res.data?.data;
}
export async function updateResearchRun(id, body) {
  const res = await api.patch(`${base}/research-runs/${id}`, body);
  return res.data?.data;
}
export async function rerunResearchRun(id) {
  const res = await api.post(`${base}/research-runs/${id}/rerun`);
  return res.data?.data;
}
export async function deleteResearchRun(id) {
  const res = await api.delete(`${base}/research-runs/${id}`);
  return res.data?.data;
}

export async function getGraphSummary() {
  const res = await api.get(`${base}/graph/summary`);
  return res.data?.data;
}
export async function getGraphNeighborhood(params) {
  const res = await api.get(`${base}/graph/neighborhood`, { params });
  return res.data?.data;
}
export async function refreshGraph() {
  const res = await api.post(`${base}/graph/refresh`);
  return res.data?.data;
}

export async function listRecurringRelationships(params = {}) {
  const res = await api.get(`${base}/relationships/recurring`, { params });
  return res.data?.data;
}
export async function refreshRelationships(body = {}) {
  const res = await api.post(`${base}/relationships/refresh`, body);
  return res.data?.data;
}

export async function listAccelerationAssets(params = {}) {
  const res = await api.get(`${base}/acceleration/assets`, { params });
  return res.data?.data;
}
export async function refreshAccelerationAssets() {
  const res = await api.post(`${base}/acceleration/refresh`);
  return res.data?.data;
}
export async function suggestAcceleration(opportunityId) {
  const res = await api.get(`${base}/acceleration/suggest/${opportunityId}`);
  return res.data?.data;
}

export async function listPursuits(params = {}) {
  const res = await api.get(`${base}/pursuits`, { params });
  return res.data?.data;
}
export async function createPursuit(body) {
  const res = await api.post(`${base}/pursuits`, body);
  return res.data?.data;
}
export async function getPursuit(id) {
  const res = await api.get(`${base}/pursuits/${id}`);
  return res.data?.data;
}
export async function updatePursuit(id, body) {
  const res = await api.patch(`${base}/pursuits/${id}`, body);
  return res.data?.data;
}
export async function deletePursuit(id) {
  const res = await api.delete(`${base}/pursuits/${id}`);
  return res.data?.data;
}

// ---- Phase 7.5 — strategic context bridge --------------------------------

export async function getStrategicContext(kind, id) {
  const res = await api.get(`${base}/context/${kind}/${encodeURIComponent(id)}`);
  return res.data?.data;
}

export async function getOpportunityContextTrace(opportunityId, { kind, id } = {}) {
  const params = {};
  if (kind) params.kind = kind;
  if (id != null) params.id = id;
  const res = await api.get(`${base}/context/opportunity/${opportunityId}/trace`, { params });
  return res.data?.data;
}

// Map a context kind to the My Opportunities query param name. Used by
// "Open in My Opportunities" buttons throughout the Deep Research surfaces.
export const CONTEXT_PARAM_MAP = {
  deepResearch: 'deepResearchId',
  cluster: 'clusterId',
  pattern: 'strategicPatternId',
  venture: 'ventureId',
  recommendation: 'recommendationId',
  intervention: 'interventionId',
  pursuit: 'pursuitId',
  researchRun: 'researchRunId',
  agency: 'agencyValue',
  technology: 'technologyValue',
};

export function myOpportunitiesContextUrl(kind, id, extras = {}) {
  const param = CONTEXT_PARAM_MAP[kind];
  if (!param) return '/admin/opportunities/my';
  const qs = new URLSearchParams({ [param]: String(id), ...extras }).toString();
  return `/admin/opportunities/my?${qs}`;
}

// ---- Phase 8 — pursuit activation + strategic capture intelligence ------

export async function activatePursuit(body) {
  const res = await api.post(`${base}/pursuits/activate`, body);
  return res.data?.data;
}
export async function generatePursuitDrafts(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/generate-drafts`, body);
  return res.data?.data;
}
export async function listPursuitHandoffs(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/handoffs`);
  return res.data?.data;
}
export async function scorePursuitReadiness(pursuitId) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/readiness/score`);
  return res.data?.data;
}
export async function getPursuitReadiness(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/readiness`);
  return res.data?.data;
}
export async function getOpportunityExpansion(kind, id, params = {}) {
  const res = await api.get(`${base}/expansion/${kind}/${encodeURIComponent(id)}`, { params });
  return res.data?.data;
}
export async function computeVentureConflicts(ventureId) {
  const res = await api.post(`${base}/ventures/${ventureId}/conflicts`);
  return res.data?.data;
}
export async function listVentureConflicts(ventureId) {
  const res = await api.get(`${base}/ventures/${ventureId}/conflicts`);
  return res.data?.data;
}
export async function refreshResearchRevenue(body = {}) {
  const res = await api.post(`${base}/research-revenue/refresh`, body);
  return res.data?.data;
}
export async function listResearchRevenue(params = {}) {
  const res = await api.get(`${base}/research-revenue`, { params });
  return res.data?.data;
}
export async function buildCaptureStrategy(pursuitId) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/capture-strategy`);
  return res.data?.data;
}
export async function getCaptureStrategy(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/capture-strategy`);
  return res.data?.data;
}
export async function listSubmissionArtifacts(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/submission-artifacts`);
  return res.data?.data;
}
export async function addSubmissionArtifact(pursuitId, body) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/submission-artifacts`, body);
  return res.data?.data;
}
export async function applySubmissionTemplate(pursuitId) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/submission-artifacts/template`);
  return res.data?.data;
}
export async function updateSubmissionArtifact(artifactId, body) {
  const res = await api.patch(`${base}/submission-artifacts/${artifactId}`, body);
  return res.data?.data;
}
export async function deleteSubmissionArtifact(artifactId) {
  const res = await api.delete(`${base}/submission-artifacts/${artifactId}`);
  return res.data?.data;
}

// ---- Phase 9 — submission readiness + compliance intelligence -----------

export async function getCaptureOps() {
  const res = await api.get(`${base}/capture-ops`);
  return res.data?.data;
}
export async function listRfpAttachments(pursuitId, params = {}) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/rfp-attachments`, { params });
  return res.data?.data;
}
export async function addRfpAttachment(pursuitId, body) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/rfp-attachments`, body);
  return res.data?.data;
}
export async function summarizeRfpAttachments(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/rfp-attachments/summary`);
  return res.data?.data;
}
export async function updateRfpAttachment(id, body) {
  const res = await api.patch(`${base}/rfp-attachments/${id}`, body);
  return res.data?.data;
}
export async function deleteRfpAttachment(id) {
  const res = await api.delete(`${base}/rfp-attachments/${id}`);
  return res.data?.data;
}
export async function listProposalArtifacts(params = {}) {
  const res = await api.get(`${base}/proposal-artifacts`, { params });
  return res.data?.data;
}
export async function addProposalArtifact(body) {
  const res = await api.post(`${base}/proposal-artifacts`, body);
  return res.data?.data;
}
export async function updateProposalArtifact(id, body) {
  const res = await api.patch(`${base}/proposal-artifacts/${id}`, body);
  return res.data?.data;
}
export async function deleteProposalArtifact(id) {
  const res = await api.delete(`${base}/proposal-artifacts/${id}`);
  return res.data?.data;
}
export async function refreshArtifactExpirations() {
  const res = await api.post(`${base}/proposal-artifacts/refresh-expirations`);
  return res.data?.data;
}
export async function getComplianceMatrix(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/compliance-matrix`);
  return res.data?.data;
}
export async function buildComplianceMatrix(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/compliance-matrix/build`, body);
  return res.data?.data;
}
export async function updateComplianceMatrixItem(id, body) {
  const res = await api.patch(`${base}/compliance-matrix-items/${id}`, body);
  return res.data?.data;
}
export async function listSubmissionPackages(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/submission-packages`);
  return res.data?.data;
}
export async function assembleSubmissionPackage(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/submission-packages`, body);
  return res.data?.data;
}
export async function getSubmissionPackage(id) {
  const res = await api.get(`${base}/submission-packages/${id}`);
  return res.data?.data;
}
export async function updateSubmissionPackage(id, body) {
  const res = await api.patch(`${base}/submission-packages/${id}`, body);
  return res.data?.data;
}
export async function listProposalTimeline(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/timeline`);
  return res.data?.data;
}
export async function addTimelineEvent(pursuitId, body) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/timeline`, body);
  return res.data?.data;
}
export async function seedDefaultTimeline(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/timeline/seed`, body);
  return res.data?.data;
}
export async function updateTimelineEvent(id, body) {
  const res = await api.patch(`${base}/timeline-events/${id}`, body);
  return res.data?.data;
}
export async function listComplianceGaps(pursuitId, params = {}) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/compliance-gaps`, { params });
  return res.data?.data;
}
export async function refreshComplianceGaps(pursuitId) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/compliance-gaps/refresh`);
  return res.data?.data;
}
export async function updateComplianceGap(id, body) {
  const res = await api.patch(`${base}/compliance-gaps/${id}`, body);
  return res.data?.data;
}
export async function scoreSubmissionReadiness(pursuitId) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/submission-readiness/score`);
  return res.data?.data;
}
export async function enqueueParallelDrafts(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/parallel-drafts`, body);
  return res.data?.data;
}
export async function listParallelDraftJobs(pursuitId, params = {}) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/parallel-drafts`, { params });
  return res.data?.data;
}
export async function getPursuitContextBlock(pursuitId, params = {}) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/context-block`, { params });
  return res.data?.data;
}

// ---- Phase 10 — operational scalability + execution infrastructure -------

export async function getCaptureInfra() {
  const res = await api.get(`${base}/capture-infra`);
  return res.data?.data;
}

export async function listWorkerJobs(params = {}) {
  const res = await api.get(`${base}/worker-jobs`, { params });
  return res.data?.data;
}
export async function getWorkerJob(id) {
  const res = await api.get(`${base}/worker-jobs/${id}`);
  return res.data?.data;
}
export async function cancelWorkerJob(id) {
  const res = await api.post(`${base}/worker-jobs/${id}/cancel`);
  return res.data?.data;
}
export async function drainWorkerOnce(body = {}) {
  const res = await api.post(`${base}/worker-jobs/drain`, body);
  return res.data?.data;
}

export async function enqueueExecutionDraftBatch(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/execution-queue/draft-batch`, body);
  return res.data?.data;
}
export async function enqueueExecutionSingleJob(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/execution-queue/single`, body);
  return res.data?.data;
}
export async function listExecutionQueue(params = {}) {
  const res = await api.get(`${base}/execution-queue`, { params });
  return res.data?.data;
}
export async function getExecutionQueueEntry(id) {
  const res = await api.get(`${base}/execution-queue/${id}`);
  return res.data?.data;
}
export async function refreshExecutionEntry(id) {
  const res = await api.post(`${base}/execution-queue/${id}/refresh`);
  return res.data?.data;
}
export async function cancelExecutionEntry(id) {
  const res = await api.post(`${base}/execution-queue/${id}/cancel`);
  return res.data?.data;
}

export async function runSlaScan() {
  const res = await api.post(`${base}/sla/scan`);
  return res.data?.data;
}
export async function listSlaEvents(params = {}) {
  const res = await api.get(`${base}/sla/events`, { params });
  return res.data?.data;
}
export async function updateSlaEvent(id, body) {
  const res = await api.patch(`${base}/sla/events/${id}`, body);
  return res.data?.data;
}

export async function runArtifactLifecycleScan() {
  const res = await api.post(`${base}/artifact-lifecycle/scan`);
  return res.data?.data;
}
export async function recommendArtifactRenewals() {
  const res = await api.get(`${base}/artifact-lifecycle/renewals`);
  return res.data?.data;
}
export async function listArtifactLifecycleEvents(artifactId, params = {}) {
  const res = await api.get(`${base}/artifact-lifecycle/${artifactId}/events`, { params });
  return res.data?.data;
}

export async function getQueueObservability(params = {}) {
  const res = await api.get(`${base}/queue-observability`, { params });
  return res.data?.data;
}
export async function snapshotQueueMetrics(body = {}) {
  const res = await api.post(`${base}/queue-observability/snapshot`, body);
  return res.data?.data;
}
export async function getQueueSnapshots(params = {}) {
  const res = await api.get(`${base}/queue-observability/snapshots`, { params });
  return res.data?.data;
}

export async function registerStorageAsset(body) {
  const res = await api.post(`${base}/storage-assets`, body);
  return res.data?.data;
}
export async function listStorageAssets(params = {}) {
  const res = await api.get(`${base}/storage-assets`, { params });
  return res.data?.data;
}
export async function getStorageSignedUrl(id) {
  const res = await api.get(`${base}/storage-assets/${id}/signed-url`);
  return res.data?.data;
}
export async function deleteStorageAsset(id) {
  const res = await api.delete(`${base}/storage-assets/${id}`);
  return res.data?.data;
}

export async function enqueueDurableDrafts(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/durable-drafts`, body);
  return res.data?.data;
}
export async function listDurableDrafts(pursuitId) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/durable-drafts`);
  return res.data?.data;
}

export async function previewPursuitContextBlock(pursuitId, params = {}) {
  const res = await api.get(`${base}/pursuits/${pursuitId}/context-block/preview`, { params });
  return res.data?.data;
}

export async function llmAugmentComplianceMatrix(pursuitId, body = {}) {
  const res = await api.post(`${base}/pursuits/${pursuitId}/compliance-matrix/llm-augment`, body);
  return res.data?.data;
}

// ---- Phase 11 — multi-tenant governance + operational auditability ------

export async function getGovernance() {
  const res = await api.get(`${base}/governance`);
  return res.data?.data;
}

// Tenant
export async function getTenantSettings() {
  const res = await api.get(`${base}/governance/tenant`);
  return res.data?.data;
}
export async function updateTenantSettings(body) {
  const res = await api.patch(`${base}/governance/tenant`, body);
  return res.data?.data;
}

// RBAC
export async function describeMyPermissions() {
  const res = await api.get(`${base}/governance/me/permissions`);
  return res.data?.data;
}
export async function listRolesAndPermissions() {
  const res = await api.get(`${base}/governance/roles`);
  return res.data?.data;
}
export async function listRoleGrants(params = {}) {
  const res = await api.get(`${base}/governance/grants`, { params });
  return res.data?.data;
}
export async function grantRole(body) {
  const res = await api.post(`${base}/governance/grants`, body);
  return res.data?.data;
}
export async function revokeRoles(userId) {
  const res = await api.delete(`${base}/governance/grants/user/${userId}`);
  return res.data?.data;
}

// Audit
export async function listAuditEvents(params = {}) {
  const res = await api.get(`${base}/governance/audit`, { params });
  return res.data?.data;
}
export async function summarizeAuditTrail(params = {}) {
  const res = await api.get(`${base}/governance/audit/summary`, { params });
  return res.data?.data;
}
export function auditExportCsvUrl(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return `${base}/governance/audit/export.csv${qs ? `?${qs}` : ''}`;
}

// Lineage
export async function getLineage(kind, id, params = {}) {
  const res = await api.get(`${base}/governance/lineage/${kind}/${id}`, { params });
  return res.data?.data;
}
export async function recordLineageEdge(body) {
  const res = await api.post(`${base}/governance/lineage`, body);
  return res.data?.data;
}
export async function getPursuitLineage(pursuitId) {
  const res = await api.get(`${base}/governance/pursuits/${pursuitId}/lineage`);
  return res.data?.data;
}

// SLA escalation
export async function actOnSlaEvent(id, body) {
  const res = await api.post(`${base}/governance/sla-events/${id}/actions`, body);
  return res.data?.data;
}
export async function getSlaEventHistory(id) {
  const res = await api.get(`${base}/governance/sla-events/${id}/history`);
  return res.data?.data;
}
export async function getSlaDigest() {
  const res = await api.get(`${base}/governance/sla/digest`);
  return res.data?.data;
}

// Workflow governance
export async function listWorkflowAssignments(params = {}) {
  const res = await api.get(`${base}/governance/workflows`, { params });
  return res.data?.data;
}
export async function createWorkflowAssignment(body) {
  const res = await api.post(`${base}/governance/workflows`, body);
  return res.data?.data;
}
export async function transitionWorkflowAssignment(id, body) {
  const res = await api.patch(`${base}/governance/workflows/${id}`, body);
  return res.data?.data;
}
export async function getOperatorWorkloads() {
  const res = await api.get(`${base}/governance/workflows/workloads`);
  return res.data?.data;
}
export async function getWorkflowBottlenecks() {
  const res = await api.get(`${base}/governance/workflows/bottlenecks`);
  return res.data?.data;
}

// Storage providers
export async function getStorageProviderHealth() {
  const res = await api.get(`${base}/governance/storage/health`);
  return res.data?.data;
}
export async function getStorageMigrationStatus() {
  const res = await api.get(`${base}/governance/storage/migration`);
  return res.data?.data;
}

// Observability stream (SSE) — caller manages EventSource lifecycle
export function observabilityStreamUrl({ channels, lastEventId } = {}) {
  const params = new URLSearchParams();
  if (channels && channels.length) params.set('channels', channels.join(','));
  if (lastEventId) params.set('lastEventId', lastEventId);
  const qs = params.toString();
  return `/api/v1/deep-research/governance/stream${qs ? `?${qs}` : ''}`;
}
export async function getObservabilityHealth() {
  const res = await api.get(`${base}/governance/stream/health`);
  return res.data?.data;
}

// Pursuit context prompt preview (Phase 11)
export async function previewPursuitContextPrompt(pursuitId, params = {}) {
  const res = await api.get(`${base}/governance/pursuits/${pursuitId}/prompt-block`, { params });
  return res.data?.data;
}

// ---- Phase 12 — tenant-safe operational consistency + provenance --------

export async function getGovernanceIntegrity() {
  const res = await api.get(`${base}/governance-integrity`);
  return res.data?.data;
}
export async function snapshotGovernanceIntegrity() {
  const res = await api.post(`${base}/governance-integrity/snapshot`);
  return res.data?.data;
}
export async function listGovernanceIntegrity(params = {}) {
  const res = await api.get(`${base}/governance-integrity/history`, { params });
  return res.data?.data;
}

// Prompt provenance
export async function listProvenanceForPursuit(pursuitId, params = {}) {
  const res = await api.get(`${base}/provenance/pursuit/${pursuitId}`, { params });
  return res.data?.data;
}
export async function getProvenanceByOutput(outputId) {
  const res = await api.get(`${base}/provenance/output/${outputId}`);
  return res.data?.data;
}
export async function getProvenanceByHash(hash) {
  const res = await api.get(`${base}/provenance/hash/${hash}`);
  return res.data?.data;
}
export async function summarizeProvenance() {
  const res = await api.get(`${base}/provenance/summary`);
  return res.data?.data;
}
export async function buildProvenanceForPursuit(pursuitId, body = {}) {
  const res = await api.post(`${base}/provenance/pursuit/${pursuitId}/build`, body);
  return res.data?.data;
}

// RBAC coverage
export async function getRbacCoverage() {
  const res = await api.get(`${base}/rbac/coverage`);
  return res.data?.data;
}
export async function snapshotRbacCoverage() {
  const res = await api.post(`${base}/rbac/coverage/snapshot`);
  return res.data?.data;
}

// SLA digest
export async function previewSlaDigest(body = {}) {
  const res = await api.post(`${base}/sla-digest/preview`, body);
  return res.data?.data;
}
export async function sendSlaDigest(body = {}) {
  const res = await api.post(`${base}/sla-digest/send`, body);
  return res.data?.data;
}
export async function listSlaEmails(params = {}) {
  const res = await api.get(`${base}/sla-digest/emails`, { params });
  return res.data?.data;
}
export async function summarizeSlaEmails(params = {}) {
  const res = await api.get(`${base}/sla-digest/summary`, { params });
  return res.data?.data;
}

// SSE stream metrics
export async function getStreamMetrics() {
  const res = await api.get(`${base}/stream-metrics`);
  return res.data?.data;
}
export async function snapshotStreamMetrics(body = {}) {
  const res = await api.post(`${base}/stream-metrics/snapshot`, body);
  return res.data?.data;
}
export async function listStreamMetrics(params = {}) {
  const res = await api.get(`${base}/stream-metrics/history`, { params });
  return res.data?.data;
}

// Asset migration
export async function planAssetMigration(params = {}) {
  const res = await api.get(`${base}/asset-migration/plan`, { params });
  return res.data?.data;
}
export async function runAssetMigration(body = {}) {
  const res = await api.post(`${base}/asset-migration/run`, body);
  return res.data?.data;
}
export async function summarizeAssetMigration() {
  const res = await api.get(`${base}/asset-migration/summary`);
  return res.data?.data;
}
export async function recentAssetMigrationAttempts(params = {}) {
  const res = await api.get(`${base}/asset-migration/attempts`, { params });
  return res.data?.data;
}

// Audit retention
export async function getRetentionPressure() {
  const res = await api.get(`${base}/audit-retention/pressure`);
  return res.data?.data;
}
export async function recommendArchive(params = {}) {
  const res = await api.get(`${base}/audit-retention/recommend`, { params });
  return res.data?.data;
}
export async function archiveAuditWindow(body = {}) {
  const res = await api.post(`${base}/audit-retention/archive`, body);
  return res.data?.data;
}
export async function listAuditArchives(params = {}) {
  const res = await api.get(`${base}/audit-retention/archives`, { params });
  return res.data?.data;
}

// ---- Phase 13 — cross-phase provenance + governance consistency --------

export async function getGovernanceAssurance() {
  const res = await api.get(`${base}/governance-assurance`);
  return res.data?.data;
}

// Cross-provenance
export async function recordCrossProvenance(body) {
  const res = await api.post(`${base}/cross-provenance`, body);
  return res.data?.data;
}
export async function listCrossProvenanceForSubject(kind, id, params = {}) {
  const res = await api.get(`${base}/cross-provenance/${kind}/${id}`, { params });
  return res.data?.data;
}
export async function listCrossProvenanceForPursuit(pursuitId) {
  const res = await api.get(`${base}/cross-provenance/pursuit/${pursuitId}`);
  return res.data?.data;
}
export async function summarizeCrossProvenance() {
  const res = await api.get(`${base}/cross-provenance-summary`);
  return res.data?.data;
}

// Operational lineage
export async function recordOperationalLineage(body) {
  const res = await api.post(`${base}/operational-lineage`, body);
  return res.data?.data;
}
export async function getOperationalLineage(kind, id, params = {}) {
  const res = await api.get(`${base}/operational-lineage/${kind}/${id}`, { params });
  return res.data?.data;
}
export async function getProposalAncestry(outputId) {
  const res = await api.get(`${base}/operational-lineage/proposal/${outputId}`);
  return res.data?.data;
}

// Permission integrity
export async function getPermissionIntegrity() {
  const res = await api.get(`${base}/permission-integrity`);
  return res.data?.data;
}
export async function snapshotPermissionIntegrity() {
  const res = await api.post(`${base}/permission-integrity/snapshot`);
  return res.data?.data;
}
export async function permissionMismatchReport() {
  const res = await api.get(`${base}/permission-integrity/mismatches`);
  return res.data?.data;
}

// Governance consistency
export async function runConsistencyScans() {
  const res = await api.post(`${base}/governance-consistency/scan`);
  return res.data?.data;
}
export async function listConsistencyFindings(params = {}) {
  const res = await api.get(`${base}/governance-consistency`, { params });
  return res.data?.data;
}
export async function updateConsistencyFinding(id, body) {
  const res = await api.patch(`${base}/governance-consistency/${id}`, body);
  return res.data?.data;
}

// Proposal explainability
export async function getProposalExplanation(outputId) {
  const res = await api.get(`${base}/explainability/output/${outputId}`);
  return res.data?.data;
}

// Governance drift
export async function runDriftScans() {
  const res = await api.post(`${base}/governance-drift/scan`);
  return res.data?.data;
}
export async function listDriftFindings(params = {}) {
  const res = await api.get(`${base}/governance-drift`, { params });
  return res.data?.data;
}
export async function updateDriftFinding(id, body) {
  const res = await api.patch(`${base}/governance-drift/${id}`, body);
  return res.data?.data;
}

// Approval provenance
export async function listApprovalsForWorkflow(id) {
  const res = await api.get(`${base}/approval-provenance/workflow/${id}`);
  return res.data?.data;
}
export async function listApprovalsForSubject(kind, id) {
  const res = await api.get(`${base}/approval-provenance/subject/${kind}/${id}`);
  return res.data?.data;
}
export async function approvalBottlenecks(params = {}) {
  const res = await api.get(`${base}/approval-provenance/bottlenecks`, { params });
  return res.data?.data;
}
export async function backfillApprovalProvenance(body = {}) {
  const res = await api.post(`${base}/approval-provenance/backfill`, body);
  return res.data?.data;
}

// Operational replay
export async function buildOperationalReplay(scope, scopeId) {
  const res = await api.get(`${base}/replay/${scope}/${scopeId}`);
  return res.data?.data;
}
export async function persistOperationalReplay(scope, scopeId) {
  const res = await api.post(`${base}/replay/${scope}/${scopeId}/persist`);
  return res.data?.data;
}

// Stream integrity
export async function getStreamIntegrity(params = {}) {
  const res = await api.get(`${base}/stream-integrity`, { params });
  return res.data?.data;
}
export async function snapshotStreamIntegrity(body = {}) {
  const res = await api.post(`${base}/stream-integrity/snapshot`, body);
  return res.data?.data;
}
export async function streamIntegrityHistory(params = {}) {
  const res = await api.get(`${base}/stream-integrity/history`, { params });
  return res.data?.data;
}
