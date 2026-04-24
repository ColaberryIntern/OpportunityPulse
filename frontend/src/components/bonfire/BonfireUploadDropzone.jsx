import React, { useRef, useState } from 'react';
import { uploadFile, uploadJsonArray } from '../../services/bonfireService';

function BonfireUploadDropzone({ onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [jsonText, setJsonText] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const result = await uploadFile(file);
      setSummary(result);
      if (onUploaded) onUploaded(result);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleJsonSubmit() {
    if (!jsonText.trim()) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of opportunity objects');
      const result = await uploadJsonArray(parsed);
      setSummary(result);
      if (onUploaded) onUploaded(result);
      setJsonText('');
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-md">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Upload Bonfire opportunities</div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded bg-accent text-white text-sm hover:bg-accent/90 disabled:opacity-50"
        >
          Choose file (.csv or .json)
        </button>
        <span className="text-xs text-gray-500">Required columns: title, agency, description, category_raw, estimated_value, close_date, source_url</span>
      </div>
      <details className="mt-2">
        <summary className="text-xs text-gray-500 cursor-pointer">or paste JSON array</summary>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder='[{"title":"...","agency":"...","description":"...","estimated_value":450000,"close_date":"2026-05-20","source_url":"https://..."}]'
          className="mt-2 w-full h-32 px-2 py-1 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
        <button
          type="button"
          disabled={busy || !jsonText.trim()}
          onClick={handleJsonSubmit}
          className="mt-2 px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          Submit JSON
        </button>
      </details>
      {busy && <div className="mt-2 text-xs text-gray-500">Uploading…</div>}
      {error && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
      {summary && (
        <div className="mt-2 text-xs text-green-700 dark:text-green-400">
          Inserted {summary.inserted}, skipped {summary.skipped}
          {summary.errors && summary.errors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer">errors ({summary.errors.length})</summary>
              <ul className="list-disc pl-5">
                {summary.errors.map((e, i) => <li key={i}>{e.reason}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default BonfireUploadDropzone;
