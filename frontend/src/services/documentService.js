// Submission Readiness Engine v0.1 — frontend service for the doc vault
// + per-bid Bonfire readiness.

import api from './api';

const base = '/documents';

export async function listDocumentTypes() {
  const res = await api.get(`${base}/types`);
  return res.data?.data?.types || [];
}

export async function listDocuments(params = {}) {
  const res = await api.get(`${base}`, { params });
  return res.data?.data || { documents: [], count: 0 };
}

export async function uploadDocument({ file, type, name, expiresAt, metadata }) {
  const form = new FormData();
  form.append('file', file);
  form.append('type', type);
  if (name) form.append('name', name);
  if (expiresAt) form.append('expires_at', expiresAt);
  if (metadata) form.append('metadata', JSON.stringify(metadata));
  const res = await api.post(`${base}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data;
}

export async function deleteDocument(id) {
  const res = await api.delete(`${base}/${encodeURIComponent(id)}`);
  return res.data?.data;
}

export function downloadDocumentUrl(id) {
  // The api client's baseURL already includes /api/v1 — return the path
  // and let api.get handle auth headers.
  return `${base}/${encodeURIComponent(id)}/download`;
}

// Bonfire readiness — both single-bid + bulk-summaries.
export async function getBonfireReadiness(opportunityId) {
  const res = await api.get(`/bonfire/opportunities/${encodeURIComponent(opportunityId)}/readiness`);
  return res.data?.data || null;
}

export async function getBonfireReadinessSummaries(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return {};
  const res = await api.post('/bonfire/opportunities/readiness-summaries', { ids });
  return res.data?.data || {};
}
