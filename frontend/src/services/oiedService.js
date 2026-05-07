import api from './api';

const base = '/oied';

// ---- My Opportunities -------------------------------------------------------
export async function listMyOpportunities(params = {}) {
  const res = await api.get(`${base}/opportunities/my`, { params });
  return res.data;
}

// ---- Action Generator -------------------------------------------------------
export async function generateOutput(opportunityId, type) {
  const res = await api.post(`${base}/opportunities/${opportunityId}/generate`, { type });
  return res.data?.data;
}

// ---- Review Queue -----------------------------------------------------------
export async function listOutputs(params = {}) {
  const res = await api.get(`${base}/opportunity-outputs`, { params });
  return res.data;
}

export async function getOutput(id) {
  const res = await api.get(`${base}/opportunity-outputs/${id}`);
  return res.data?.data;
}

export async function patchOutputStatus(id, body) {
  const res = await api.patch(`${base}/opportunity-outputs/${id}/status`, body);
  return res.data?.data;
}

// ---- Profile ----------------------------------------------------------------
export async function getProfile() {
  const res = await api.get(`${base}/profile`);
  return res.data?.data;
}
export async function saveProfile(body) {
  const res = await api.post(`${base}/profile`, body);
  return res.data?.data;
}
export async function patchProfile(body) {
  const res = await api.patch(`${base}/profile`, body);
  return res.data?.data;
}

// ---- Bundles ----------------------------------------------------------------
export async function listBundles(params = {}) {
  const res = await api.get(`${base}/bundles`, { params });
  return res.data?.data || [];
}
export async function runBundler() {
  const res = await api.post(`${base}/bundles/run`);
  return res.data?.data;
}

// ---- Events -----------------------------------------------------------------
export async function recordEvent(opportunityId, eventType, payload = {}) {
  try {
    const res = await api.post(`${base}/opportunity-events`, {
      opportunityId, eventType, payload,
    });
    return res.data?.data;
  } catch {
    // Best-effort tracking — never throws to caller.
    return null;
  }
}

// ---- v3: Recommendations ----------------------------------------------------
export async function getRecommendations(limit = 3) {
  const res = await api.get(`${base}/recommendations`, { params: { limit } });
  return res.data?.data || [];
}

// ---- v3: Conversion tracking ------------------------------------------------
export async function markResult(opportunityId, status, extras = {}) {
  const res = await api.post(
    `${base}/opportunities/${opportunityId}/mark-result`,
    { status, ...extras },
  );
  return res.data?.data;
}

export async function getConversionStats(since = null) {
  const params = since ? { since } : {};
  const res = await api.get(`${base}/conversion-stats`, { params });
  return res.data?.data || null;
}

// ---- v3: Bundle strategy ----------------------------------------------------
export async function generateBundleStrategy(bundleId, force = false) {
  const res = await api.post(`${base}/bundles/${bundleId}/strategy`, { force });
  return res.data?.data;
}

// ---- v4: Daily briefing -----------------------------------------------------
export async function getBriefing() {
  const res = await api.get(`${base}/briefing`);
  return res.data?.data || null;
}
export async function sendBriefingEmail(to) {
  const res = await api.post(`${base}/briefing/send`, to ? { to } : {});
  return res.data?.data;
}

// ---- v4: Trigger engine -----------------------------------------------------
export async function runTriggers(dryRun = true) {
  const res = await api.post(`${base}/triggers/run`, { dryRun });
  return res.data?.data;
}
export async function listTriggerLogs(params = {}) {
  const res = await api.get(`${base}/triggers/logs`, { params });
  return res.data;
}

// ---- v4: Bundle product blueprint ------------------------------------------
export async function generateBundleBlueprint(bundleId, force = false) {
  const res = await api.post(`${base}/bundles/${bundleId}/blueprint`, { force });
  return res.data?.data;
}

// ---- v5: Execution queue ---------------------------------------------------
export async function listExecutionQueue(params = {}) {
  const res = await api.get(`${base}/execution-queue`, { params });
  return res.data;
}

// ---- v5: Revenue dashboard -------------------------------------------------
export async function getRevenueDashboard() {
  const res = await api.get(`${base}/revenue/dashboard`);
  return res.data?.data || null;
}

// ---- v5: Feedback loop -----------------------------------------------------
export async function getPendingOutcomes() {
  const res = await api.get(`${base}/feedback/pending-outcomes`);
  return res.data?.data || { pending: [] };
}
export async function getWeeklySummary() {
  const res = await api.get(`${base}/feedback/weekly-summary`);
  return res.data?.data || null;
}
export async function sendWeeklySummary(to) {
  const res = await api.post(`${base}/feedback/weekly-summary/send`, to ? { to } : {});
  return res.data?.data;
}

// ---- v5: Execution planner -------------------------------------------------
export async function generateExecutionPlan(bundleId, force = false) {
  const res = await api.post(`${base}/bundles/${bundleId}/execution-plan`, { force });
  return res.data?.data;
}
export async function getExecutionPlan(bundleId) {
  const res = await api.get(`${base}/bundles/${bundleId}/execution-plan`);
  return res.data?.data || null;
}
export async function startBuild(bundleId) {
  const res = await api.post(`${base}/bundles/${bundleId}/execution-plan/start`);
  return res.data?.data;
}

// ---- v5: Billing -----------------------------------------------------------
export async function getBillingUsage() {
  const res = await api.get(`${base}/billing/usage`);
  return res.data?.data || null;
}
export async function getBillingPlan() {
  const res = await api.get(`${base}/billing/plan`);
  return res.data?.data || null;
}
export async function changeBillingPlan(tier) {
  const res = await api.patch(`${base}/billing/plan`, { tier });
  return res.data?.data;
}

// ---- v6: Pipeline velocity -------------------------------------------------
export async function getVelocity() {
  const res = await api.get(`${base}/velocity`);
  return res.data?.data || null;
}

// ---- v9.3: Channel summary (one row per channel; powers dashboard grid) -----
export async function getChannelsSummary() {
  const res = await api.get(`${base}/channels/summary`);
  return res.data?.data || [];
}
