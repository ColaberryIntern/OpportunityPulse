// v0.4 — Bonfire RFP attachment locker frontend service.

import api from './api';

export async function listAttachments(bonfireOpportunityId) {
  const res = await api.get(`/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/attachments`);
  return res.data?.data || {
    attachments: [], count: 0, attachments_fetched_at: null, last_attachment_fetch: null,
  };
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

// v0.5 (Phase 4) — download the assembled submission ZIP. Streams directly
// from the server. Caller passes a hint for the filename; backend sends
// a Content-Disposition that the browser respects.
export async function downloadSubmissionPackage(bonfireOpportunityId, hintName) {
  const res = await api.get(
    `/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/submission-package`,
    { responseType: 'blob' },
  );
  const blob = new Blob([res.data], { type: 'application/zip' });
  // Try to honor server-provided filename; otherwise fall back.
  let filename = `submission-package_${hintName || bonfireOpportunityId}.zip`;
  const cd = res.headers['content-disposition'];
  if (cd) {
    const m = cd.match(/filename="([^"]+)"/);
    if (m) filename = decodeURIComponent(m[1]);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
