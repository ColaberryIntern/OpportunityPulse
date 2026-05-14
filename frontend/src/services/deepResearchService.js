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
