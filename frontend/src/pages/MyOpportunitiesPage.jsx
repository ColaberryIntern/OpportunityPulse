import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { listMyOpportunities, recordEvent } from '../services/oiedService';
import OpportunityActionButtons from '../components/oied/OpportunityActionButtons';

function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function ScoreBadge({ score }) {
  let bg = 'bg-gray-100 text-gray-700';
  if (score >= 80) bg = 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  else if (score >= 60) bg = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  else if (score >= 40) bg = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${bg}`}>
      {score}
    </span>
  );
}

function OppRow({ opp, onGenerated }) {
  useEffect(() => {
    // 'viewed' event — best-effort. Fires once per row mount.
    recordEvent(opp.id, 'viewed', { source: 'my_opportunities_list' });
  }, [opp.id]);

  return (
    <li
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3 hover:border-blue-300 transition"
      data-testid="my-opportunity-row"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ScoreBadge score={opp.fitScore} />
            <span className="text-xs text-gray-500 uppercase tracking-wide">{opp.type}</span>
            {opp.category && (
              <span className="text-xs text-gray-500">· {opp.category}</span>
            )}
            <span className="text-xs text-gray-500" data-testid="opportunity-value">· {fmtUSD(opp.value)}</span>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-0.5">
            {opp.title}
          </h3>
          {opp.location && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{opp.location}</p>
          )}
          {opp.fitBreakdown && (
            <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-3">
              <span>service:{opp.fitBreakdown.service_match}/25</span>
              <span>revenue:{opp.fitBreakdown.revenue_weight}/20</span>
              <span>auto:{opp.fitBreakdown.automation_score}/15</span>
              <span>repeat:{opp.fitBreakdown.repeatability_score}/15</span>
              <span>ease:{opp.fitBreakdown.ease_of_entry}/10</span>
              <span>strat:{opp.fitBreakdown.strategic_alignment}/15</span>
            </div>
          )}
          <OpportunityActionButtons opportunityId={opp.id} compact onGenerated={onGenerated} />
        </div>
        {opp.sourceUrl && (
          <a
            href={opp.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm whitespace-nowrap"
          >
            Source ↗
          </a>
        )}
      </div>
    </li>
  );
}

function MyOpportunitiesPage() {
  const { user } = useSelector((s) => s.auth);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [minScore, setMinScore] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = { limit: pageSize, offset: (page - 1) * pageSize };
      if (minScore) params.minScore = minScore;
      const res = await listMyOpportunities(params);
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? (res.data || []).length);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, minScore]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-6 text-center text-gray-500">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            🎯 My Opportunities
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">
              OIED
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All active opportunities ≥ $1,000 ranked by Fit Score (deterministic
            scoring across service match, revenue, automation, repeatability,
            ease, strategic alignment).
          </p>
        </header>

        <div className="flex items-center gap-3 mb-4 text-sm">
          <label className="flex items-center gap-1.5">
            Min score:
            <input
              type="number"
              value={minScore}
              onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
              placeholder="0"
              min="0"
              max="100"
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1 w-24"
              data-testid="min-score-input"
            />
          </label>
          <span className="text-gray-500" data-testid="total-count">{total} matching</span>
          <div className="flex-1" />
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            Next →
          </button>
        </div>

        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded">
            No opportunities match the filters.
          </div>
        ) : (
          <ul className="list-none p-0" data-testid="my-opportunities-list">
            {rows.map((opp) => <OppRow key={opp.id} opp={opp} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

export default MyOpportunitiesPage;
