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
