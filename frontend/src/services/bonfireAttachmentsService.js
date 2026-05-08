// v0.4 — Bonfire RFP attachment locker frontend service.

import api from './api';

export async function listAttachments(bonfireOpportunityId) {
  const res = await api.get(`/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/attachments`);
  return res.data?.data || { attachments: [], count: 0 };
}

// Admin-only. Triggers Playwright on the backend; ~5–30s per opp.
export async function fetchAttachments(bonfireOpportunityId) {
  const res = await api.post(
    `/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/fetch-attachments`,
  );
  return res.data?.data || null;
}

export async function downloadAttachment(bonfireOpportunityId, attachmentId, name) {
  const res = await api.get(
    `/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    { responseType: 'blob' },
  );
  const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'attachment';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
