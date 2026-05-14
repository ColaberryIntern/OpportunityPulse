import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listReports, reRunReport, setReportFlags,
} from '../services/deepResearchService';
import { MarketStageBadge, STAGE_META } from '../components/deepResearch/IntelVisuals';

// Deep Research Phase 2 — the reports index / command center.
//
// /admin/deep-research — a searchable, filterable terminal for every deep
// research report: market stage, confidence, commercialization + timing
// scores, correlation strength, with re-run / favorite / archive / open
// actions. Executive intelligence terminal: clean, dense, light theme.

const STAGE_OPTIONS = [
  { value: '', label: 'All stages' },
  ...Object.entries(STAGE_META)
    .filter(([k]) => k !== 'unknown')
    .map(([value, m]) => ({ value, label: m.label })),
];

function StatusDot({ status }) {
  const map = {
    success: 'bg-emerald-500', partial: 'bg-amber-500',
    running: 'bg-blue-500 animate-pulse', failed: 'bg-red-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] || 'bg-gray-300'}`} title={status} />;
}

function ScoreCell({ value, suffix = '' }) {
  if (value == null) return <span className="text-gray-300">—</span>;
  const n = Number(value);
  return <span className="font-medium text-gray-700">{Math.round(n)}{suffix}</span>;
}

function DeepResearchIndexPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    search: '', marketStage: '', minConfidence: '', favorite: false, archived: false,
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.marketStage) params.marketStage = filters.marketStage;
      if (filters.minConfidence) params.minConfidence = filters.minConfidence;
      if (filters.favorite) params.favorite = true;
      if (filters.archived) params.archived = true;
      const res = await listReports(params);
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  async function handleReRun(id) {
    setBusyId(id);
    try {
      await reRunReport(id);
      navigate(`/admin/deep-research/${id}`);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Re-run failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleFlag(id, flag, value) {
    setBusyId(id);
    try {
      await setReportFlags(id, { [flag]: value });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🧠 Deep Research
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-medium">
              Intelligence Terminal
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Every synthesized venture intelligence report — searchable, scored, and re-runnable.
            Start a new one from the Deep Research button on{' '}
            <Link to="/admin/opportunities/my" className="text-blue-600">My Opportunities</Link>.
          </p>
        </header>

        {/* Filter bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 flex flex-wrap gap-2 items-center">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search topics…"
            className="flex-1 min-w-[180px] border border-gray-300 rounded px-3 py-1.5 text-sm"
            data-testid="reports-search"
          />
          <select
            value={filters.marketStage}
            onChange={(e) => setFilter('marketStage', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            data-testid="reports-stage-filter"
          >
            {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            Min confidence
            <input
              type="number" min="0" max="1" step="0.1"
              value={filters.minConfidence}
              onChange={(e) => setFilter('minConfidence', e.target.value)}
              placeholder="0"
              className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox" checked={filters.favorite}
              onChange={(e) => setFilter('favorite', e.target.checked)}
            />
            ⭐ Favorites
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox" checked={filters.archived}
              onChange={(e) => setFilter('archived', e.target.checked)}
            />
            Archived
          </label>
        </div>

        {err && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{err}</div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
            {loading ? 'Loading…' : `${total} report${total === 1 ? '' : 's'}`}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2">Topic</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Conf.</th>
                <th className="px-3 py-2 text-right">Comm.</th>
                <th className="px-3 py-2 text-right">Timing</th>
                <th className="px-3 py-2 text-right">Corr.</th>
                <th className="px-3 py-2 text-right">Ideas</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No reports match these filters.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50" data-testid={`report-row-${r.id}`}>
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/deep-research/${r.id}`} className="font-medium text-gray-900 hover:text-blue-700">
                      {r.isFavorite ? '⭐ ' : ''}{r.searchTerm}
                    </Link>
                    <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                      <StatusDot status={r.status} />
                      {r.status}
                      {r.version > 1 && <span>· v{r.version}</span>}
                      {r.origin === 'daily_scan' && <span>· daily scan</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><MarketStageBadge stage={r.marketStage} /></td>
                  <td className="px-3 py-2.5 text-right">
                    <ScoreCell value={r.confidenceScore != null ? r.confidenceScore * 100 : null} suffix="%" />
                  </td>
                  <td className="px-3 py-2.5 text-right"><ScoreCell value={r.commercializationScore} /></td>
                  <td className="px-3 py-2.5 text-right">
                    <ScoreCell value={r.timingScore != null ? r.timingScore * 100 : null} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ScoreCell value={r.correlationStrength != null ? r.correlationStrength * 100 : null} suffix="%" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{r.ventureIdeaCount}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Link
                      to={`/admin/deep-research/${r.id}`}
                      className="text-xs text-blue-600 hover:underline mr-2"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleReRun(r.id)}
                      disabled={busyId === r.id || r.status === 'running'}
                      className="text-xs text-indigo-600 hover:underline mr-2 disabled:opacity-40"
                    >
                      Re-run
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFlag(r.id, 'favorite', !r.isFavorite)}
                      disabled={busyId === r.id}
                      className="text-xs hover:underline mr-2 disabled:opacity-40"
                      title={r.isFavorite ? 'Unfavorite' : 'Favorite'}
                    >
                      {r.isFavorite ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFlag(r.id, 'archived', !r.isArchived)}
                      disabled={busyId === r.id}
                      className="text-xs text-gray-500 hover:underline disabled:opacity-40"
                    >
                      {r.isArchived ? 'Unarchive' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DeepResearchIndexPage;
