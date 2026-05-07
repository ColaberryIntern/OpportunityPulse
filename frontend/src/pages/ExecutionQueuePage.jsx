import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { listExecutionQueue, patchOutputStatus } from '../services/oiedService';
import OpportunityDetailModal from '../components/oied/OpportunityDetailModal';
import ChannelChip from '../components/oied/ChannelChip';

function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function ExecutionQueuePage() {
  const { user } = useSelector((s) => s.auth);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);
  const [banner, setBanner] = useState(null);
  const [detailOppId, setDetailOppId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listExecutionQueue({ limit: 100 });
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? (res.data || []).length);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleStatus(outputId, status) {
    setBusyId(outputId);
    setBanner(null);
    try {
      await patchOutputStatus(outputId, { status });
      setBanner(`Output #${outputId} → ${status}`);
      await load();
    } catch (e) {
      setBanner('Failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return <div className="p-6 text-center text-gray-500">Please log in.</div>;
  if (user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto" data-testid="execution-queue-page">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            📋 Execution Queue
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 font-medium">
              OIED v5
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Draft proposals ranked by ROI/hour — value × win&nbsp;probability ÷ proposal&nbsp;hours.
            Ship the top row first.
          </p>
        </header>

        {banner && (
          <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 text-sm text-blue-900 dark:text-blue-100 mb-3">
            {banner}
          </div>
        )}
        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        <div className="text-xs text-gray-500 mb-2" data-testid="execution-queue-count">
          {total} drafts
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded" data-testid="execution-queue-empty">
            No drafts in the queue. Generate a proposal from the My Opportunities page.
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="execution-queue-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                  <th className="px-2 py-2">Opportunity</th>
                  <th className="px-2 py-2 text-right">Value</th>
                  <th className="px-2 py-2 text-right">Effort</th>
                  <th className="px-2 py-2 text-right">Win prob</th>
                  <th className="px-2 py-2 text-right" data-testid="roi-header">ROI / hour ↓</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.output_id}
                    className="border-b border-gray-100 dark:border-gray-800"
                    data-testid="execution-queue-row"
                  >
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setDetailOppId(row.opportunity_id)}
                        className="text-left font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 hover:underline cursor-pointer"
                        data-testid="execution-row-title-btn"
                      >
                        {row.title}
                      </button>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        {row.context && row.context.channel && (
                          <ChannelChip channel={row.context.channel} />
                        )}
                        <span>{row.category || '—'} · #{row.opportunity_id}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-sm">{fmtUSD(row.value)}</td>
                    <td className="px-2 py-2 text-right text-xs text-gray-600 dark:text-gray-400">
                      {row.effort_estimate?.proposal_hours || '?'}h
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-gray-600 dark:text-gray-400">
                      {Math.round((row.win_probability || 0) * 100)}%
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {fmtUSD(row.roi_per_hour)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busyId === row.output_id}
                        onClick={() => handleStatus(row.output_id, 'approved')}
                        className="px-2 py-1 mr-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                        data-testid="execution-approve-btn"
                      >
                        Approve
                      </button>
                      <Link
                        to={`/admin/opportunities/review`}
                        className="px-2 py-1 mr-1 rounded border border-gray-300 dark:border-gray-600 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === row.output_id}
                        onClick={() => handleStatus(row.output_id, 'rejected')}
                        className="px-2 py-1 rounded border border-red-300 text-red-700 dark:border-red-700 dark:text-red-300 text-xs hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                        data-testid="execution-reject-btn"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

export default ExecutionQueuePage;
