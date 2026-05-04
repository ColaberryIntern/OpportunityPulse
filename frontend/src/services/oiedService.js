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
