import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { getRecommendations, generateOutput, markResult } from '../services/oiedService';
import OpportunityDetailModal from '../components/oied/OpportunityDetailModal';

function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function bucketLabel(bucket) {
  switch (bucket) {
    case 'act_now':    return { text: '🔥 Act Now', tone: 'red' };
    case 'high_value': return { text: '💰 High Value', tone: 'green' };
    case 'quick_win':  return { text: '⚡ Quick Win', tone: 'amber' };
    default:           return null;
  }
}

const TONE_CLASS = {
  red:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

function ResultMenu({ opportunityId, onResult }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const choices = [
    { value: 'submitted', label: 'Submitted' },
    { value: 'responded', label: 'Got a response' },
    { value: 'won',       label: '✅ Won' },
    { value: 'lost',      label: '❌ Lost' },
  ];
  async function pick(status) {
    setBusy(true);
    try {
      await markResult(opportunityId, status);
      onResult && onResult(status);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }
  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        data-testid="mark-result-btn"
      >
        {busy ? '…' : '✅ Mark Result ▾'}
      </button>
      {open && (
        <ul className="absolute right-0 mt-1 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg w-44 text-sm" data-testid="mark-result-menu">
          {choices.map((c) => (
            <li key={c.value}>
              <button
                type="button"
                onClick={() => pick(c.value)}
                className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendationCard({ rec, onGenerated, onResult, onOpenDetail }) {
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const bucket = bucketLabel(rec.bucket);

  async function handleGenerate() {
    if (!window.confirm(`Generate a proposal draft for "${rec.title}"?`)) return;
    setBusy(true);
    setBanner(null);
    try {
      const out = await generateOutput(rec.opportunity_id, 'proposal');
      setBanner('✅ Proposal drafted (#' + (out && out.id) + '). Find it in the Review Queue.');
      onGenerated && onGenerated(out);
    } catch (e) {
      setBanner('Failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 mb-4"
      data-testid="recommendation-card"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <button
          type="button"
          onClick={() => onOpenDetail && onOpenDetail(rec.opportunity_id)}
          className="text-left text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 hover:underline cursor-pointer"
          data-testid="rec-card-title-btn"
        >
          {rec.title}
        </button>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-500">Score</div>
          <div className="text-lg font-bold">{Math.round(rec.recommendation_score)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
        {bucket && (
          <span className={`px-2 py-0.5 rounded ${TONE_CLASS[bucket.tone]}`}>{bucket.text}</span>
        )}
        <span className="text-gray-500">{fmtUSD(rec.expected_value)}</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-500">priority {rec.priority_score}</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-500">fit {rec.fit_score}</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-500">win prob {Math.round(rec.win_probability * 100)}%</span>
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3" data-testid="rec-reason">
        <span className="font-medium">Why: </span>{rec.reason}
      </p>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Effort: {rec.effort_estimate.proposal_hours}h proposal · {rec.effort_estimate.build_days}d build
        · score {rec.effort_estimate.effort_score}/100
      </p>

      {banner && (
        <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 text-sm text-blue-900 dark:text-blue-100 mb-3">
          {banner}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          data-testid="rec-generate-btn"
        >
          {busy ? 'Generating…' : '✍️ Generate Proposal'}
        </button>
        <Link
          to={`/admin/opportunities/${rec.opportunity_id}`}
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          🔗 Open
        </Link>
        <ResultMenu opportunityId={rec.opportunity_id} onResult={onResult} />
      </div>
    </article>
  );
}

function RecommendationsPage() {
  const { user } = useSelector((s) => s.auth);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [detailOppId, setDetailOppId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setItems(await getRecommendations(3));
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return <div className="p-6 text-center text-gray-500">Please log in.</div>;
  }
  if (user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            🎯 Top Actions
            <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 font-medium">
              OIED v3 — Cory Lite
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The 3 opportunities you should work on right now —
            ranked by priority × win probability ÷ effort.
          </p>
        </header>

        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : items.length === 0 ? (
          <div
            className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded"
            data-testid="recommendations-empty"
          >
            No recommendations yet — generate fit scores via the My Opportunities
            page first.
          </div>
        ) : (
          <div data-testid="recommendations-list">
            {items.map((r, i) => (
              <div key={r.opportunity_id} data-testid={`recommendation-rank-${i + 1}`}>
                <RecommendationCard
                  rec={r}
                  onGenerated={load}
                  onResult={load}
                  onOpenDetail={setDetailOppId}
                />
              </div>
            ))}
          </div>
        )}

        {detailOppId && (
          <OpportunityDetailModal
            opportunityId={detailOppId}
            onClose={() => setDetailOppId(null)}
          />
        )}
      </div>
    </div>
  );
}

export default RecommendationsPage;
