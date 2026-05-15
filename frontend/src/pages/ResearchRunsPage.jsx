import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  listResearchRuns, createResearchRun, getResearchRun, updateResearchRun,
  rerunResearchRun, deleteResearchRun, previewResearchQuery,
  myOpportunitiesContextUrl,
} from '../services/deepResearchService';
import {
  StatCard, ChannelBadge, OpportunityRow,
} from '../components/deepResearch/ActionVisuals';

// Deep Research Phase 7 — Custom Strategic Research Runs.

function Section({ title, subtitle, right, children, testId }) {
  return (
    <section
      className="bg-white border border-gray-200 rounded-xl p-6 mb-5"
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function ResearchRunsPage() {
  const [search] = useSearchParams();
  const [runs, setRuns] = useState([]);
  const [focused, setFocused] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // New-run form.
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');

  // Preview-only form.
  const [previewQ, setPreviewQ] = useState('');
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const list = await listResearchRuns({ limit: 100 });
      setRuns(list || []);
      const focusId = search.get('focus');
      if (focusId) {
        const detail = await getResearchRun(focusId);
        setFocused(detail);
      } else if (list && list.length > 0 && !focused) {
        setFocused(list[0]);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load runs');
    } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, errLabel) {
    setBusy(true); setErr(null);
    try { await fn(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || errLabel); }
    finally { setBusy(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || !newQuery.trim()) return;
    await withBusy(async () => {
      const created = await createResearchRun({ name: newName, query: newQuery });
      setNewName(''); setNewQuery('');
      setFocused(created);
      await load();
    }, 'Create failed');
  }

  async function handleRerun(id) {
    await withBusy(async () => {
      const r = await rerunResearchRun(id);
      if (focused && focused.id === id) setFocused(r);
      await load();
    }, 'Rerun failed');
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this run?')) return;
    await withBusy(async () => {
      await deleteResearchRun(id);
      if (focused && focused.id === id) setFocused(null);
      await load();
    }, 'Delete failed');
  }

  async function handleTogglePin(run) {
    await withBusy(async () => {
      await updateResearchRun(run.id, { pinned: !run.pinned });
      await load();
    }, 'Pin failed');
  }

  async function handlePreview() {
    if (!previewQ.trim()) return;
    await withBusy(async () => {
      const out = await previewResearchQuery({ query: previewQ });
      setPreview(out);
    }, 'Preview failed');
  }

  if (loading && runs.length === 0) {
    return <div className="p-6 text-center text-gray-500">Loading research runs…</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4">
          <Link to="/admin/deep-research/action-intelligence" className="text-xs text-cyan-700 hover:underline">
            ← Action Intelligence
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">🔎 Custom Strategic Research Runs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Saved searches across every channel. Pin the ones you re-run weekly; diff results over time.
          </p>
        </header>

        {err && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}

        <Section title="New Strategic Run" testId="section-new-run">
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder='Name — e.g. "AI video generation for defense"'
              required
              className="text-sm px-3 py-2 border border-gray-300 rounded"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                placeholder='Comma-separated tokens — e.g. "video, generation, defense"'
                required
                className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-2 rounded-md bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </form>
        </Section>

        <Section title="Preview Query (no save)" subtitle="Dry-run before you commit to saving a run." testId="section-preview">
          <div className="flex gap-2">
            <input
              type="text"
              value={previewQ}
              onChange={(e) => setPreviewQ(e.target.value)}
              placeholder='Try: "rag, government" or "workflow automation, healthcare"'
              className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded"
            />
            <button
              type="button"
              onClick={handlePreview}
              disabled={busy || !previewQ.trim()}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-40"
            >
              Run preview
            </button>
          </div>
          {preview && (
            <div className="mt-3">
              <div className="flex gap-2 flex-wrap mb-2 text-xs">
                <span className="text-gray-500">{preview.match_count} matches in</span>
                {Object.entries(preview.breakdown || {}).map(([k, n]) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <ChannelBadge channel={k} />
                    <span className="font-semibold text-gray-700">{n}</span>
                  </span>
                ))}
              </div>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                {(preview.results || []).slice(0, 15).map((r) => (
                  <div key={r.id} className="rounded border border-gray-200 p-2 text-xs">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <ChannelBadge channel={r.type} />
                      {r.source && <span className="text-[10px] text-gray-500">{r.source}</span>}
                    </div>
                    <p className="text-gray-900 leading-snug">{r.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-1">
            <Section title="Saved Runs" testId="section-list">
              {runs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No saved runs yet.</p>
              ) : (
                <div className="space-y-1">
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setFocused(r)}
                      className={`w-full text-left p-2 rounded text-xs ${
                        focused && focused.id === r.id
                          ? 'bg-cyan-100 border border-cyan-300'
                          : 'border border-transparent hover:bg-gray-100'
                      }`}
                      data-testid={`run-row-${r.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900 truncate">{r.name}</span>
                        {r.pinned && <span className="text-[10px] text-amber-700">📌</span>}
                      </div>
                      <p className="text-gray-500 italic truncate">{r.query}</p>
                      <p className="text-gray-400 mt-0.5">{r.lastMatchCount || 0} matches</p>
                    </button>
                  ))}
                </div>
              )}
            </Section>
          </div>
          <div className="md:col-span-2">
            {focused ? (
              <Section
                title={focused.name}
                subtitle={focused.query}
                testId="section-focused"
                right={
                  <div className="flex gap-1 flex-wrap">
                    <Link
                      to={myOpportunitiesContextUrl('researchRun', focused.id)}
                      className="text-[11px] px-2 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-700"
                      data-testid="run-open-in-my-opps"
                    >
                      Open in My Opportunities →
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleTogglePin(focused)}
                      className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    >
                      {focused.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRerun(focused.id)}
                      disabled={busy}
                      className="text-[11px] px-2 py-1 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200 disabled:opacity-40"
                    >
                      Rerun
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(focused.id)}
                      disabled={busy}
                      className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                }
              >
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <StatCard label="Latest Matches" value={focused.lastMatchCount || 0} />
                  <StatCard
                    label="Last Run"
                    value={focused.lastRunAt ? new Date(focused.lastRunAt).toLocaleDateString() : '—'}
                    sub={focused.lastRunAt ? new Date(focused.lastRunAt).toLocaleTimeString() : ''}
                  />
                  <StatCard
                    label="Total Runs"
                    value={Array.isArray(focused.history) ? focused.history.length : 0}
                  />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Latest breakdown</h3>
                <div className="flex gap-2 flex-wrap mb-4 text-xs">
                  {Object.entries(focused.lastBreakdown || {}).map(([k, n]) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      <ChannelBadge channel={k} />
                      <span className="font-semibold text-gray-700">{n}</span>
                    </span>
                  ))}
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recent matches</h3>
                <div className="grid gap-2 max-h-[400px] overflow-y-auto">
                  {(focused.lastResults || []).slice(0, 30).map((r) => (
                    <div key={r.id} className="rounded border border-gray-200 p-2 text-xs">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <ChannelBadge channel={r.type} />
                        {r.source && <span className="text-[10px] text-gray-500">{r.source}</span>}
                      </div>
                      <p className="text-gray-900 leading-snug">{r.title}</p>
                    </div>
                  ))}
                </div>
                {Array.isArray(focused.history) && focused.history.length > 1 && (
                  <>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 mt-4">
                      Run history
                    </h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-200">
                          <th className="text-left py-1 px-2">When</th>
                          <th className="text-right py-1 px-2">Matches</th>
                          <th className="text-right py-1 px-2">Δ vs prior</th>
                        </tr>
                      </thead>
                      <tbody>
                        {focused.history.map((h, i) => {
                          const prior = focused.history[i + 1];
                          const delta = prior ? (h.match_count - prior.match_count) : 0;
                          return (
                            <tr key={h.run_at} className="border-b border-gray-100">
                              <td className="py-1 px-2 text-gray-700">
                                {new Date(h.run_at).toLocaleString()}
                              </td>
                              <td className="py-1 px-2 text-right font-semibold text-gray-900">{h.match_count}</td>
                              <td className={`py-1 px-2 text-right ${
                                delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-gray-500'
                              }`}>
                                {delta > 0 ? '+' : ''}{delta}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </Section>
            ) : (
              <Section title="No run selected" testId="section-empty">
                <p className="text-sm text-gray-500">Select a run from the left to inspect it.</p>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResearchRunsPage;
