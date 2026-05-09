// Submission Readiness Engine v0.10.2 — combined drop zone.
//
// Earlier the readiness panel had TWO zones side-by-side: purple (screenshot
// → AI vision extracts the agency's Required Information table) and blue
// (files → attachment upload + classification). The user testing surfaced
// the obvious UX problem: it's not clear which thing goes where, and after
// dropping both, the panel re-asked for screenshots.
//
// This zone replaces both. Drop anything; on submit we route by mime/ext:
//   - PNG / JPG / WEBP  → portal-screenshot endpoint (single AI call across all)
//   - PDF / DOCX / XLSX / TXT / CSV / ZIP  → attachments endpoint (auto-extracts ZIPs)
// Both calls happen in parallel; one combined progress + result panel.

import React, { useCallback, useRef, useState } from 'react';
import {
  uploadAttachments,
  uploadPortalScreenshot,
} from '../../services/bonfireAttachmentsService';

const ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,.zip,.png,.jpg,.jpeg,.webp';
const MAX_BYTES_FILE = 50 * 1024 * 1024;
const MAX_BYTES_IMAGE = 20 * 1024 * 1024;
const MAX_TOTAL = 30;
const MAX_IMAGES = 5;

const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const FILE_RE = /\.(pdf|docx?|xlsx?|txt|csv|zip)$/i;

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function isImage(f) {
  return IMAGE_RE.test(f.name) || (f.type && f.type.startsWith('image/'));
}

function isAcceptableFile(f) {
  return FILE_RE.test(f.name) || isImage(f);
}

function validate(f) {
  if (!f) return 'No file';
  if (!isAcceptableFile(f)) return 'Unsupported file type';
  if (isImage(f) && f.size > MAX_BYTES_IMAGE) return `Image too large (${fmtBytes(f.size)} > 20 MB)`;
  if (!isImage(f) && f.size > MAX_BYTES_FILE) return `File too large (${fmtBytes(f.size)} > 50 MB)`;
  return null;
}

export default function BonfireCombinedDropZone({ opportunityId, sourceUrl, onChange }) {
  const [staged, setStaged] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ images: 0, files: 0 });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    setErr(null); setResult(null);
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const validated = incoming.map((f) => ({ file: f, reason: validate(f) }));
    const rejects = validated.filter((v) => v.reason);
    if (rejects.length) {
      setErr(rejects.map((r) => `${r.file?.name || 'file'}: ${r.reason}`).join(' · '));
    }
    const accepted = validated.filter((v) => !v.reason).map((v) => v.file);
    setStaged((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > MAX_TOTAL) {
        setErr((existing) => (existing ? existing + ' · ' : '') + `Capped at ${MAX_TOTAL} items.`);
      }
      return merged.slice(0, MAX_TOTAL);
    });
  }, []);

  const removeStaged = useCallback((idx) => {
    setStaged((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  };

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];
    const pasted = [];
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) pasted.push(new File([f], `pasted-${Date.now()}-${pasted.length}.png`, { type: f.type }));
      }
    }
    if (pasted.length) {
      addFiles(pasted);
      e.preventDefault();
    }
  }, [addFiles]);

  async function handleProcess() {
    if (!staged.length || uploading) return;
    setUploading(true); setErr(null); setResult(null);
    setProgress({ images: 0, files: 0 });

    const images = staged.filter(isImage);
    const otherFiles = staged.filter((f) => !isImage(f));

    if (images.length > MAX_IMAGES) {
      setErr(`Capped at ${MAX_IMAGES} screenshots — extra images ignored.`);
    }
    const imagesToSend = images.slice(0, MAX_IMAGES);

    const results = { images: null, files: null, errors: [] };

    const tasks = [];
    if (imagesToSend.length > 0) {
      tasks.push(
        uploadPortalScreenshot(opportunityId, imagesToSend, (loaded, total) => {
          if (total) setProgress((p) => ({ ...p, images: Math.round((loaded / total) * 100) }));
        })
          .then((out) => { results.images = out; })
          .catch((e) => {
            results.errors.push('Screenshot extraction: ' + (e?.response?.data?.message || e.message));
          }),
      );
    }
    if (otherFiles.length > 0) {
      tasks.push(
        uploadAttachments(opportunityId, otherFiles, (loaded, total) => {
          if (total) setProgress((p) => ({ ...p, files: Math.round((loaded / total) * 100) }));
        })
          .then((out) => { results.files = out; })
          .catch((e) => {
            results.errors.push('File upload: ' + (e?.response?.data?.message || e.message));
          }),
      );
    }
    await Promise.all(tasks);

    setResult(results);
    if (results.errors.length) setErr(results.errors.join(' · '));
    setUploading(false);
    setStaged([]);
    if (onChange) onChange(results);
  }

  const imageCount = staged.filter(isImage).length;
  const fileCount = staged.length - imageCount;

  return (
    <div
      className="mb-4 rounded border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10 p-4"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="text-xs uppercase tracking-wide text-blue-800 dark:text-blue-200 font-semibold mb-1">
        📥 Drop everything here
      </div>
      <p className="text-[12px] text-gray-700 dark:text-gray-300 mb-3">
        Open the agency portal in your browser
        {sourceUrl ? (
          <>
            {' '}(<a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-blue-700 dark:text-blue-300 underline font-medium">
              link ↗
            </a>)
          </>
        ) : ''} and grab two things:
      </p>
      <ul className="list-disc pl-5 text-[12px] text-gray-700 dark:text-gray-300 mb-3 space-y-0.5">
        <li>
          <strong>Screenshot of the Required Information section</strong> (PNG/JPG/WEBP). AI vision
          reads it and turns the agency's submission checklist into your readiness model. Long page?
          Drop multiple — up to {MAX_IMAGES}, sent to AI in one call.
        </li>
        <li>
          <strong>The supporting documents</strong> — click "Download All Files" on the portal,
          drop the ZIP here. We auto-expand + classify each file (RFP / SOW / form / schedule).
        </li>
      </ul>
      <p className="text-[11px] text-gray-500 mb-3">Drop them in any order; one extract action handles both.</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
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
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="text-2xl mb-1" aria-hidden="true">📥</div>
        <div className="text-sm text-gray-700 dark:text-gray-200 font-medium">
          Drop files here · click to browse · paste images (Ctrl/Cmd+V)
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          Images: PNG/JPG/WEBP, max 20 MB each, up to {MAX_IMAGES} ·
          Docs: PDF/DOCX/XLSX/TXT/CSV/ZIP, max 50 MB each
        </div>
      </div>

      {staged.length > 0 && !uploading && (
        <div className="mt-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2 flex-wrap">
            <span>Ready to process ({staged.length})</span>
            {imageCount > 0 && (
              <span className="text-purple-700 dark:text-purple-300">📸 {imageCount} screenshot{imageCount === 1 ? '' : 's'} → vision</span>
            )}
            {fileCount > 0 && (
              <span className="text-blue-700 dark:text-blue-300">📎 {fileCount} doc{fileCount === 1 ? '' : 's'} → attachments</span>
            )}
          </div>
          <ul className="text-sm space-y-1 max-h-44 overflow-y-auto">
            {staged.map((f, idx) => {
              const img = isImage(f);
              return (
                <li key={`${f.name}-${idx}`} className="flex items-center gap-2 py-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    img
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                  }`}>
                    {img ? '📸 screenshot' : '📎 doc'}
                  </span>
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-100" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-[11px] text-gray-500 shrink-0">{fmtBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeStaged(idx); }}
                    className="text-xs text-gray-400 hover:text-red-600 px-1"
                    aria-label={`Remove ${f.name}`}
                  >×</button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleProcess}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              ▶ Process {staged.length} item{staged.length === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={() => setStaged([])}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {uploading && (
        <div className="mt-3 space-y-2">
          {imageCount > 0 && (
            <div>
              <div className="text-[12px] text-purple-800 dark:text-purple-200 mb-1">
                📸 Screenshots → vision: {progress.images < 100 ? `Uploading ${progress.images}%` : 'AI reading…'}
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                <div className="h-full bg-purple-600 transition-all" style={{ width: progress.images + '%' }} />
              </div>
            </div>
          )}
          {fileCount > 0 && (
            <div>
              <div className="text-[12px] text-blue-800 dark:text-blue-200 mb-1">
                📎 Docs → attachments: Uploading {progress.files}%
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: progress.files + '%' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-2">
          {result.images && result.images.found && (
            <div className="px-3 py-2 rounded bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-900/40 text-[12px] text-green-900 dark:text-green-100">
              ✅ Extracted <strong>{result.images.rows?.length || 0} required item{(result.images.rows?.length || 0) === 1 ? '' : 's'}</strong>
              {result.images.section_label ? <> from <em>{result.images.section_label}</em></> : null}
              {result.images.screenshot_count > 1 ? <> ({result.images.screenshot_count} screenshots stitched)</> : null}.
            </div>
          )}
          {result.images && !result.images.found && (
            <div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-[12px] text-amber-900 dark:text-amber-100">
              ⚠ Couldn't find a Required Information table in the screenshot{result.images.screenshot_count > 1 ? 's' : ''}.{' '}
              {result.images.reason ? <em>{result.images.reason}</em> : 'Capture the section explicitly listing the documents to submit.'}
            </div>
          )}
          {result.files && (
            <div className="px-3 py-2 rounded bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-900/40 text-[12px] text-green-900 dark:text-green-100">
              ✅ Saved <strong>{result.files.saved}</strong> of {result.files.received} file{result.files.received === 1 ? '' : 's'}
              {result.files.expanded_from_zip > 0 ? <> (expanded {result.files.expanded_from_zip} from ZIP)</> : null}.
            </div>
          )}
        </div>
      )}
      {err && (
        <div className="mt-3 px-3 py-2 rounded bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/40 text-[12px] text-red-900 dark:text-red-200">
          {err}
        </div>
      )}
    </div>
  );
}
