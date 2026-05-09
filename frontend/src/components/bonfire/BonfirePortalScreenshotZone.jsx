// Submission Readiness Engine v0.10 — portal screenshot drop zone.
//
// The user opens the Bonfire portal page in their real browser (since CF
// Super Bot Fight Mode blocks every automated bypass we tried), takes a
// screenshot of the "Required Information" section, drops it here. We
// send it to gpt-4o-mini's vision API and persist the extracted checklist
// as the canonical readiness model — no more hardcoded baseline.

import React, { useState, useRef, useCallback } from 'react';
import { uploadPortalScreenshot } from '../../services/bonfireAttachmentsService';

const ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
const MAX_BYTES = 20 * 1024 * 1024;

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function BonfirePortalScreenshotZone({ opportunityId, onExtracted, sourceUrl }) {
  const [staged, setStaged] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const validate = useCallback((f) => {
    if (!f) return 'No file';
    if (f.size > MAX_BYTES) return `Too large (${fmtBytes(f.size)} > 20 MB)`;
    if (!/\.(png|jpe?g|webp)$/i.test(f.name) && !/^image\/(png|jpeg|webp)$/i.test(f.type)) {
      return 'Not a PNG / JPG / WEBP image';
    }
    return null;
  }, []);

  const setFile = useCallback((f) => {
    setErr(null); setResult(null);
    const reason = validate(f);
    if (reason) { setErr(`${f?.name || 'file'}: ${reason}`); return; }
    setStaged(f);
  }, [validate]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.[0]) setFile(e.dataTransfer.files[0]);
  };

  // Paste-from-clipboard support — Cmd/Ctrl+V drops the screenshot directly.
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          // Synthesize a name since clipboard images come in nameless.
          const named = new File([f], `pasted-${Date.now()}.png`, { type: f.type });
          setFile(named);
          e.preventDefault();
          break;
        }
      }
    }
  }, [setFile]);

  async function handleExtract() {
    if (!staged || uploading) return;
    setUploading(true); setProgress(0); setErr(null); setResult(null);
    try {
      const out = await uploadPortalScreenshot(opportunityId, staged, (loaded, total) => {
        if (total) setProgress(Math.round((loaded / total) * 100));
      });
      setResult(out);
      if (onExtracted) onExtracted(out);
      // Don't clear staged so the user can verify before re-extract if needed.
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Extraction failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div
      className="mb-4 rounded border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/30 dark:bg-purple-900/10 p-4"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="text-xs uppercase tracking-wide text-purple-800 dark:text-purple-200 font-semibold mb-1">
        📸 Step 1 · Capture the agency's Required Information
      </div>
      <p className="text-[12px] text-gray-700 dark:text-gray-300 mb-3">
        Cloudflare blocks our scraper, so we can't read the Bonfire portal page
        directly. Open it in your browser{sourceUrl ? (
          <>
            {' '}(<a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-purple-700 dark:text-purple-300 underline font-medium">
              link ↗
            </a>)
          </>
        ) : ''},
        scroll to the <strong>Required Information</strong> section, screenshot it (Win+Shift+S
        / Cmd+Shift+4), and drop it here. We use AI vision to extract the structured submission
        checklist. <span className="text-gray-500">Tip: you can also paste from clipboard.</span>
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`rounded border-2 border-dashed cursor-pointer p-6 text-center transition ${
          dragActive
            ? 'border-purple-500 bg-purple-100 dark:bg-purple-900/40'
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
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
        <div className="text-2xl mb-1" aria-hidden="true">📸</div>
        <div className="text-sm text-gray-700 dark:text-gray-200 font-medium">
          Drop screenshot here · click to browse · or paste (Ctrl/Cmd+V)
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          PNG · JPG · WEBP · max 20 MB
        </div>
      </div>

      {staged && !uploading && !result && (
        <div className="mt-3 px-3 py-2 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm flex items-center gap-2 flex-wrap">
          <span className="flex-1 truncate text-gray-800 dark:text-gray-100" title={staged.name}>
            🖼 {staged.name}
          </span>
          <span className="text-[11px] text-gray-500 shrink-0">{fmtBytes(staged.size)}</span>
          <button
            type="button"
            onClick={() => { setStaged(null); setResult(null); }}
            className="text-xs text-gray-500 hover:text-red-600 px-1.5 py-0.5"
            aria-label="Remove staged screenshot"
          >×</button>
          <button
            type="button"
            onClick={handleExtract}
            className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
          >
            🤖 Extract requirements
          </button>
        </div>
      )}

      {uploading && (
        <div className="mt-3">
          <div className="text-[12px] text-purple-800 dark:text-purple-200 mb-1">
            ⏳ {progress < 100 ? `Uploading ${progress}%` : 'AI vision reading the page…'}
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-purple-600 transition-all" style={{ width: progress + '%' }} />
          </div>
        </div>
      )}

      {result && result.found && (
        <div className="mt-3 px-3 py-2 rounded bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-900/40 text-[12px] text-green-900 dark:text-green-100">
          ✅ Extracted <strong>{result.rows?.length || 0} required item{(result.rows?.length || 0) === 1 ? '' : 's'}</strong>
          {result.section_label ? <> from <em>{result.section_label}</em></> : null}.
          {result.rows?.length > 0 && (
            <ul className="mt-2 list-disc pl-5 space-y-0.5">
              {result.rows.slice(0, 8).map((r, i) => (
                <li key={i}>
                  <strong>{r.name}</strong>
                  {r.file_type ? ` · ${r.file_type}` : ''}
                  {r.required ? ' · required' : ' · optional'}
                  {r.conditions ? ` · ${r.conditions}` : ''}
                </li>
              ))}
              {result.rows.length > 8 && <li className="italic">…and {result.rows.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}
      {result && !result.found && (
        <div className="mt-3 px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-[12px] text-amber-900 dark:text-amber-100">
          ⚠ Couldn't find a Required Information table in this screenshot.{' '}
          {result.reason ? <em>{result.reason}</em> : 'Make sure you captured the right section of the page (usually below the Supporting Documentation table).'}
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
