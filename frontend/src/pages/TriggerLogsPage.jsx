import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { listTriggerLogs, runTriggers } from '../services/oiedService';

const STATUS_TONE = {
  success:  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  skipped:  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  failed:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  dry_run:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

function StatusPill({ status }) {
  const cls = STATUS_TONE[status] || STATUS_TONE.skipped;
  return <span className={`text-xs px-2 py-0.5 rounded font-mono ${cls}`}>{status}</span>;
}

function TriggerLogsPage() {
  const { user } = useSelector((s) => s.auth);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [banner, setBanner] = useState(null);
  const [dryRun, setDryRun] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listTriggerLogs({ limit: 100 });
      setLogs(res.data || []);
      setTotal(res.pagination?.total ?? (res.data || []).length);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRun() {
    if (!window.confirm(
      dryRun
        ? 'Run triggers in dry-run mode? Logs only — no AI calls.'
        : 'Run triggers FOR REAL? Auto-generates proposals and bundle strategies.'
    )) return;
    setBusy(true);
    setBanner(null);
    try {
      const out = await runTriggers(dryRun);
      setBanner(
        `Run complete: ${out.fired || 0} fired · ${out.dry_run_count || 0} dry-run · `
        + `${out.skipped || 0} skipped · ${out.failed || 0} failed.`
      );
      await load();
    } catch (e) {
      setBanner('Run failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <div className="p-6 text-center text-gray-500">Please log in.</div>;
  if (user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto" data-testid="trigger-logs-page">
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              ⚡ Trigger Logs
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 font-medium">
                OIED v4
              </span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Auto-execution log for the trigger engine. Dry-run mode logs
              every match without invoking generators — review here before
              flipping to live.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                data-testid="trigger-dry-run-toggle"
              />
              Dry run
            </label>
            <button
              type="button"
              onClick={handleRun}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50"
              data-testid="trigger-run-btn"
            >
              {busy ? 'Running…' : 'Run Triggers Now'}
            </button>
          </div>
        </header>

        {banner && (
          <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 text-sm text-blue-900 dark:text-blue-100 mb-3">
            {banner}
          </div>
        )}
        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        <div className="text-xs text-gray-500 mb-2" data-testid="trigger-logs-count">
          {total} log entries
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded" data-testid="trigger-logs-empty">
            No trigger activity yet. Click "Run Triggers Now" to evaluate the rules.
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="trigger-logs-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Rule</th>
                  <th className="px-2 py-2">Target</th>
                  <th className="px-2 py-2">Action</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Confidence</th>
                  <th className="px-2 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800" data-testid="trigger-log-row">
                    <td className="px-2 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{row.ruleName}</td>
                    <td className="px-2 py-2 text-xs">
                      {row.targetType} #{row.targetId}
                    </td>
                    <td className="px-2 py-2 text-xs">{row.action}</td>
                    <td className="px-2 py-2"><StatusPill status={row.status} /></td>
                    <td className="px-2 py-2 text-xs font-mono text-gray-700 dark:text-gray-300" data-testid="trigger-log-confidence">
                      {row.confidenceScore != null ? Number(row.confidenceScore).toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {row.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default TriggerLogsPage;
