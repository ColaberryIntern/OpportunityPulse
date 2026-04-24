import api from './api';

const base = '/bonfire';

// ---- Flag probe (public) ----------------------------------------------------
// Used to decide whether to show the "Bonfire" nav link.
export async function fetchBonfireFlag() {
  try {
    const res = await api.get(`${base}/flag`);
    return !!res.data?.data?.enabled;
  } catch {
    return false;
  }
}

// ---- Reads ------------------------------------------------------------------

export async function listOpportunities(params = {}) {
  const res = await api.get(`${base}/opportunities`, { params });
  return res.data; // { status, data: [...], pagination: {...} }
}

export async function getOpportunity(id) {
  const res = await api.get(`${base}/opportunities/${id}`);
  return res.data?.data;
}

// ---- Admin uploads ----------------------------------------------------------

export async function uploadJsonArray(rows) {
  // Route-local parser has a 5 MB cap (matches backend).
  const res = await api.post(`${base}/upload/json`, rows);
  return res.data?.data;
}

export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post(`${base}/upload/file`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data;
}

// ---- Enrichment -------------------------------------------------------------

export async function enrichOne(id, { force = false } = {}) {
  const res = await api.post(`${base}/enrich/${id}`, null, { params: { force } });
  return res.data?.data;
}

export async function enrichAll({ force = false } = {}) {
  const res = await api.post(`${base}/enrich-all`, null, { params: { force } });
  return res.data?.data;
}

// ---- Strategy ---------------------------------------------------------------

export async function generateStrategy(id) {
  const res = await api.post(`${base}/generate-strategy/${id}`);
  return res.data?.data;
}

// ---- Client-side constants (used for filter UI) -----------------------------

export const BONFIRE_CATEGORIES = [
  'Staffing',
  'Data & Analytics',
  'Consulting',
  'Compliance',
  'Financial Services',
  'Education',
  'IT Services',
];

export const SIGNAL_META = {
  HIGH_ROI: { emoji: '🔥', label: 'High ROI' },
  HIGH_AUTOMATION: { emoji: '🤖', label: 'High Automation' },
  QUICK_WIN: { emoji: '⚡', label: 'Quick Win' },
  PRODUCTIZABLE: { emoji: '🧱', label: 'Productizable' },
};
