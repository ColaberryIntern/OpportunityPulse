import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listBriefingSubscriptions, createBriefingSubscription, updateBriefingSubscription,
  deleteBriefingSubscription, previewBriefing, getBriefingHistory,
} from '../services/deepResearchService';

// Deep Research Phase 2 — Daily Executive Briefing Center.
//
// /admin/deep-research/briefings — manage recurring scan topics: frequency,
// recipients, enable/disable. Preview the briefing email, and review the
// history of previous automated scans.

function BriefingCenterPage() {
  const [subs, setSubs] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({ scanTopic: '', frequency: 'daily', recipients: '' });
  const [previewHtml, setPreviewHtml] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, h] = await Promise.all([listBriefingSubscriptions(), getBriefingHistory()]);
      setSubs(s);
      setHistory(h);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load briefing center');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.scanTopic.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createBriefingSubscription({
        scanTopic: form.scanTopic.trim(),
        frequency: form.frequency,
        recipients: form.recipients,
      });
      setForm({ scanTopic: '', frequency: 'daily', recipients: '' });
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(sub) {
    setBusy(true);
    try {
      await updateBriefingSubscription(sub.id, { enabled: !sub.enabled });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this briefing subscription?')) return;
    setBusy(true);
    try {
      await deleteBriefingSubscription(id);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    setBusy(true);
    try {
      const res = await previewBriefing();
      setPreviewHtml(res.html);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4">
          <Link to="/admin/deep-research" className="text-sm text-blue-600">← Deep Research</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">📬 Daily Executive Briefing Center</h1>
          <p className="text-sm text-gray-500">
            Recurring scan topics that auto-generate deep research reports and email an executive briefing.
            The scan runs on a daily cron (opt-in via <code>DEEP_RESEARCH_SCAN_ENABLED</code>).
          </p>
        </header>

        {err && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{err}</div>
        )}

        {/* Add subscription */}
        <form
          onSubmit={handleCreate}
          className="bg-white border border-gray-200 rounded-lg p-4 mb-5 flex flex-wrap gap-2 items-end"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Scan topic</label>
            <input
              value={form.scanTopic}
              onChange={(e) => setForm((f) => ({ ...f, scanTopic: e.target.value }))}
              placeholder="e.g. government AI procurement"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              data-testid="briefing-topic-input"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Frequency</label>
            <select
              value={form.frequency}
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Recipients (comma-separated)</label>
            <input
              value={form.recipients}
              onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
              placeholder="ali@colaberry.com"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !form.scanTopic.trim()}
            className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Add scan
          </button>
        </form>

        {/* Subscriptions table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 flex justify-between">
            <span>{loading ? 'Loading…' : `${subs.length} scan subscription${subs.length === 1 ? '' : 's'}`}</span>
            <button type="button" onClick={handlePreview} disabled={busy} className="text-blue-600 hover:underline">
              Preview briefing email
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2">Topic</th>
                <th className="px-3 py-2">Frequency</th>
                <th className="px-3 py-2">Recipients</th>
                <th className="px-3 py-2">Last scan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No scan subscriptions yet — add one above. (The scheduler falls back to env topics until one exists.)
                </td></tr>
              )}
              {subs.map((s) => (
                <tr key={s.id} className="border-b border-gray-50" data-testid={`briefing-row-${s.id}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{s.scanTopic}</td>
                  <td className="px-3 py-2.5 text-gray-600 capitalize">{s.frequency}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {Array.isArray(s.recipients) && s.recipients.length
                      ? s.recipients.join(', ') : <span className="text-gray-300">none</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {s.lastScanAt ? new Date(s.lastScanAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      s.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button" onClick={() => handleToggle(s)} disabled={busy}
                      className="text-xs text-indigo-600 hover:underline mr-3 disabled:opacity-40"
                    >
                      {s.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button" onClick={() => handleDelete(s.id)} disabled={busy}
                      className="text-xs text-red-600 hover:underline disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Previous briefings history */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
            Previous scans ({history.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2">Topic</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Report</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No scans have run yet.</td></tr>
              )}
              {history.map((h) => (
                <tr key={h.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-800">{h.scan_topic}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-semibold ${
                      h.status === 'success' ? 'text-emerald-600'
                        : h.status === 'failed' ? 'text-red-600' : 'text-gray-500'
                    }`}>{h.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {h.report_id
                      ? <Link to={`/admin/deep-research/${h.report_id}`} className="text-blue-600 hover:underline">#{h.report_id}</Link>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview modal */}
      {previewHtml != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-semibold text-gray-900">Briefing email preview</h2>
              <button type="button" onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <iframe
              title="Briefing preview"
              srcDoc={previewHtml}
              className="flex-1 w-full rounded-b-xl"
              style={{ minHeight: 420 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default BriefingCenterPage;
