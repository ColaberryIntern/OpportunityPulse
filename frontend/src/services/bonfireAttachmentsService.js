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

// v0.8 — pursuit state machine + manual upload. Cloudflare bypass for
// Bonfire portals: human downloads from the agency portal + drops files here.
export async function getPursuitStatus(bonfireOpportunityId) {
  const res = await api.get(`/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/pursuit`);
  return res.data?.data || null;
}

export async function pursueBid(bonfireOpportunityId) {
  const res = await api.post(`/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/pursue`);
  return res.data?.data || null;
}

export async function cancelPursuit(bonfireOpportunityId, { decline = false } = {}) {
  const res = await api.post(
    `/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/cancel-pursuit`,
    { to: decline ? 'declined' : 'none' },
  );
  return res.data?.data || null;
}

// v0.10 — upload a screenshot of the Bonfire portal page so vision extracts
// the agency's published Required Information table. Single PNG/JPG/WEBP.
export async function uploadPortalScreenshot(bonfireOpportunityId, file, onProgress = null) {
  const fd = new FormData();
  fd.append('screenshot', file, file.name);
  const res = await api.post(
    `/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/portal-screenshot`,
    fd,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? (e) => onProgress(e.loaded || 0, e.total || 0)
        : undefined,
    },
  );
  return res.data?.data || null;
}

// Manual upload. files: an array of File objects from a drop-zone or input.
// onProgress: optional (loaded, total) callback for the UI's progress bar.
export async function uploadAttachments(bonfireOpportunityId, files, onProgress = null) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f, f.name);
  const res = await api.post(
    `/bonfire/opportunities/${encodeURIComponent(bonfireOpportunityId)}/attachments`,
    fd,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? (e) => onProgress(e.loaded || 0, e.total || 0)
        : undefined,
    },
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
