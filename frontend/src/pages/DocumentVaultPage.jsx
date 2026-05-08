// Submission Readiness Engine v0.1 — Document Vault UI.
//
// Admin-only. Upload + list + delete the org's evergreen documents
// (W-9, COI, capability statement, past performance, certs, etc.).
// The Bonfire readiness panel reads from this same store.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../services/api';
import {
  listDocumentTypes, listDocuments, uploadDocument, deleteDocument, downloadDocumentUrl,
} from '../services/documentService';

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toISOString().slice(0, 10);
}
function expiryStatus(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days < 0) return { label: 'Expired', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' };
  return { label: `Expires ${fmtDate(expiresAt)}`, cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
}

function UploadModal({ types, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [type, setType] = useState(types[0]?.key || 'other');
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { setErr('Pick a file first'); return; }
    setBusy(true); setErr(null);
    try {
      await uploadDocument({
        file, type,
        name: name || file.name,
        expiresAt: expiresAt || null,
      });
      onUploaded();
    } catch (ex) {
      setErr(ex?.response?.data?.message || ex.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg p-5 w-full max-w-lg shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Upload document</h3>
        {err && <div className="mb-3 p-2 rounded bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm">{err}</div>}
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-300">Document type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1.5 text-sm">
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-300">File</span>
            <input type="file" onChange={(e) => setFile(e.target.files[0] || null)}
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt"
              className="mt-1 block w-full text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-300">Display name <span className="text-gray-400">(optional)</span></span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="(uses file name)"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 dark:text-gray-300">Expires on <span className="text-gray-400">(optional, e.g. for COI)</span></span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button type="submit" disabled={busy} className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}

async function streamDownload(id, name) {
  // Use api client so the JWT goes with the request, then trigger a save.
  const res = await api.get(downloadDocumentUrl(id), { responseType: 'blob' });
  const blob = new Blob([res.data], { type: res.headers['content-type'] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name || 'document';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

export default function DocumentVaultPage() {
  const { user } = useSelector((s) => s.auth);
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterScope, setFilterScope] = useState(''); // '' | 'global' | 'bid'
  const [filterSource, setFilterSource] = useState(''); // '' | 'manual' | 'ai_generated'

  const reload = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = {};
      if (filterType)   params.type = filterType;
      if (filterScope)  params.scope = filterScope;
      if (filterSource) params.source = filterSource;
      const [t, d] = await Promise.all([listDocumentTypes(), listDocuments(params)]);
      setTypes(t);
      setDocs(d.documents || []);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterScope, filterSource]);

  useEffect(() => { reload(); }, [reload]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const d of docs) {
      if (!m.has(d.type)) m.set(d.type, []);
      m.get(d.type).push(d);
    }
    return m;
  }, [docs]);

  const typeLookup = useMemo(() => {
    const m = new Map(types.map((t) => [t.key, t]));
    return m;
  }, [types]);

  const summary = useMemo(() => {
    let withExpiry = 0, expiring = 0, expired = 0;
    const now = Date.now();
    for (const d of docs) {
      if (!d.expires_at) continue;
      withExpiry += 1;
      const days = Math.round((new Date(d.expires_at).getTime() - now) / 86_400_000);
      if (days < 0) expired += 1;
      else if (days <= 30) expiring += 1;
    }
    return { total: docs.length, withExpiry, expiring, expired };
  }, [docs]);

  if (!user || user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              📁 Document Vault
              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">v0.1</span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Evergreen org documents (W-9, COI, capability, certs, past performance, …).
              The Bonfire readiness panel checks this vault to compute completion %.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            data-testid="upload-doc-btn"
          >+ Upload document</button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.total}</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Active documents</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.withExpiry}</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">With expiry tracked</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-yellow-200 dark:border-yellow-800 rounded p-3">
            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{summary.expiring}</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Expiring (≤30d)</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded p-3">
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{summary.expired}</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Expired</div>
          </div>
        </div>

        <div className="mb-3 flex items-center gap-2 text-sm flex-wrap">
          <label>Type:
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="ml-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1">
              <option value="">All</option>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label>Scope:
            <select value={filterScope} onChange={(e) => setFilterScope(e.target.value)}
              className="ml-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1">
              <option value="">All</option>
              <option value="global">🌐 Global vault</option>
              <option value="bid">📌 Local to a bid</option>
            </select>
          </label>
          <label>Source:
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
              className="ml-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1">
              <option value="">All</option>
              <option value="manual">Uploaded</option>
              <option value="ai_generated">🤖 AI-generated</option>
            </select>
          </label>
          <span className="text-gray-500">{docs.length} document{docs.length === 1 ? '' : 's'}</span>
        </div>

        {err && <div className="mb-3 p-3 rounded bg-red-50 text-red-700 text-sm">{err}</div>}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded">
            No documents uploaded yet. Click <strong>Upload document</strong> to add your first
            evergreen file (W-9, capability statement, COI, past performance, certifications).
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([typeKey, list]) => {
              const meta = typeLookup.get(typeKey);
              return (
                <div key={typeKey} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center justify-between">
                    <span>{meta ? meta.label : typeKey}</span>
                    <span className="text-xs text-gray-500">{list.length} version{list.length === 1 ? '' : 's'}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="text-left py-2 px-3">Name</th>
                        <th className="text-left py-2 px-3">Version</th>
                        <th className="text-left py-2 px-3">Size</th>
                        <th className="text-left py-2 px-3">Expiry</th>
                        <th className="text-left py-2 px-3">Uploaded</th>
                        <th className="text-right py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((d) => {
                        const exp = expiryStatus(d.expires_at);
                        return (
                          <tr key={d.id} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="py-2 px-3 text-gray-900 dark:text-gray-100">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{d.name}</span>
                                {d.scope === 'bid' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200" title={`Local to bid ${d.scope_id}`}>
                                    📌 bid
                                  </span>
                                )}
                                {d.source === 'ai_generated' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" title="AI-generated">
                                    🤖 AI
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-gray-600 dark:text-gray-400">v{d.version}</td>
                            <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{fmtBytes(d.size_bytes)}</td>
                            <td className="py-2 px-3">
                              {exp
                                ? <span className={`text-[11px] px-2 py-0.5 rounded ${exp.cls}`}>{exp.label}</span>
                                : <span className="text-gray-400 text-xs">—</span>}
                            </td>
                            <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{fmtDate(d.created_at)}</td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => streamDownload(d.id, d.name).catch((e) => alert('Download failed: ' + e.message))}
                                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 mr-1"
                              >Download</button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm(`Deactivate "${d.name}"? It will stop counting toward readiness.`)) return;
                                  await deleteDocument(d.id);
                                  reload();
                                }}
                                className="px-2 py-1 text-xs rounded border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                              >Deactivate</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {showUpload && (
          <UploadModal
            types={types}
            onClose={() => setShowUpload(false)}
            onUploaded={() => { setShowUpload(false); reload(); }}
          />
        )}
      </div>
    </div>
  );
}
