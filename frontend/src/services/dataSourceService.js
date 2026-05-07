import api from './api';

const base = '/admin/data-sources';

// v9.9: Data Source Health page.
export async function getDataSourceHealth() {
  const res = await api.get(`${base}/health`);
  return res.data?.data || { sources: [], summary: {}, ingestion_cron: null, next_run_at: null };
}

export async function runDataSource(name) {
  const res = await api.post(`${base}/${encodeURIComponent(name)}/run`);
  return res.data?.data || null;
}
