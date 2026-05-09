// Submission Readiness Engine v0.8 — manual RFP attachment drop zone.
//
// Cloudflare blocks ~80% of Bonfire portals from automated download, so the
// human-in-the-loop workflow is: open the portal, download every file from
// the Documents tab, drag them here. The zone accepts PDF / DOCX / XLSX / TXT
// / CSV / ZIP / images, multi-file, up to 50 MB each.

import React, { useState, useRef, useCallback } from 'react';
import { uploadAttachments } from '../../services/bonfireAttachmentsService';

const ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,.zip,.png,.jpg,.jpeg';
const MAX_BYTES = 50 * 1024 * 1024;

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function validateFile(f) {
  if (f.size > MAX_BYTES) return { ok: false, reason: `Too large (${fmtBytes(f.size)} > 50 MB)` };
  if (!/\.(pdf|docx?|xlsx?|txt|csv|zip|png|jpe?g)$/i.test(f.name)) {
    return { ok: false, reason: 'Unsupported file type' };
  }
  return { ok: true };
}

export default function BonfireUploadZone({ opportunityId, onUploaded, sourceUrl }) {
  const [staged, setStaged] = useState([]);  // files awaiting upload
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    setErr(null);
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    const validated = arr.map((f) => ({ file: f, ...validateFile(f) }));
    const rejects = validated.filter((v) => !v.ok);
    if (rejects.length) {
      setErr(rejects.map((r) => `${r.file.name}: ${r.reason}`).join(' · '));
    }
    const ok = validated.filter((v) => v.ok).map((v) => v.file);
    setStaged((prev) => [...prev, ...ok]);
  }, []);

  const removeStaged = useCallback((idx) => {
    setStaged((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setDragActive(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragActive(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  };

  async function handleUpload() {
    if (!staged.length || uploading) return;
    setUploading(true); setProgress(0); setErr(null); setResult(null);
    try {
      const out = await uploadAttachments(opportunityId, staged, (loaded, total) => {
        if (total) setProgress(Math.round((loaded / total) * 100));
      });
      setResult(out);
      setStaged([]);
      if (onUploaded) onUploaded(out);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div className="mb-4 rounded border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10 p-4">
      <div className="text-xs uppercase tracking-wide text-blue-800 dark:text-blue-200 font-semibold mb-1">
        📥 Step 2 · Drop the RFP files here
      </div>
      <p className="text-[12px] text-gray-700 dark:text-gray-300 mb-3">
        Cloudflare blocks our automated download on most Bonfire portals, so we need
        a human to grab the files.
        {sourceUrl && (
          <>
            {' '}
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
               className="text-blue-700 dark:text-blue-300 underline font-medium">
              Open the original RFP on Bonfire ↗
            </a>
            ,
          </>
        )}{' '}
        download every file under the <strong>Documents</strong> tab, then drag them into the zone below.
      </p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`rounded border-2 border-dashed cursor-pointer p-6 text-center transition ${
          dragActive
            ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/40'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="text-2xl mb-1" aria-hidden="true">📎</div>
        <div className="text-sm text-gray-700 dark:text-gray-200 font-medium">
          Drag files here or click to browse
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          PDF · DOCX · XLSX · TXT · CSV · ZIP · PNG · JPG · max 50 MB each
        </div>
      </div>

      {staged.length > 0 && (
        <div className="mt-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            Ready to upload ({staged.length})
          </div>
          <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
            {staged.map((f, idx) => (
              <li key={`${f.name}-${idx}`} className="flex items-center gap-2 py-0.5">
                <span className="flex-1 truncate text-gray-800 dark:text-gray-100">{f.name}</span>
                <span className="text-[11px] text-gray-500 shrink-0">{fmtBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeStaged(idx); }}
                  className="text-xs text-gray-400 hover:text-red-600"
                  aria-label={`Remove ${f.name}`}
                  disabled={uploading}
                >×</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={uploading}
              onClick={handleUpload}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {uploading ? `⏳ Uploading… ${progress}%` : `⬆ Upload ${staged.length} file${staged.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => setStaged([])}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
          {uploading && (
            <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: progress + '%' }} />
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-2 px-2 py-1.5 rounded bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-900/40 text-[12px] text-green-900 dark:text-green-100">
          ✅ Uploaded {result.saved} of {result.received} file{result.received === 1 ? '' : 's'}.
          {result.failed > 0 && <span> {result.failed} failed.</span>}
        </div>
      )}
      {err && (
        <div className="mt-2 px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/40 text-[12px] text-red-900 dark:text-red-200">
          {err}
        </div>
      )}
    </div>
  );
}
