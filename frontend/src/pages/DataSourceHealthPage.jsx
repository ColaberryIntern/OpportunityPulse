// OIED v9.9 — Data Source Health page.
//
// Lists every ingestion source with derived status (failing / stale /
// zero_yield / healthy / disabled), last-run details, recent created-row
// totals, a 14-day sparkline, and a "Run now" trigger. Designed so Ali
// can spot broken or silently-stalled sources at a glance — the kind of
// gap that left the capital channel dead for 80 days before we noticed.

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getDataSourceHealth, runDataSource, runSourceHealthAgent } from '../services/dataSourceService';

const STATUS_META = {
  failing:    { label: 'Failing',    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',         dot: 'bg-red-500',    order: 0 },
  stale:      { label: 'Stale',      badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200', dot: 'bg-orange-500', order: 1 },
  zero_yield: { label: 'Zero yield', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200', dot: 'bg-yellow-500', order: 2 },
  healthy:    { label: 'Healthy',    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200', dot: 'bg-green-500',  order: 3 },
  disabled:   { label: 'Disabled',   badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',         dot: 'bg-gray-400',   order: 4 },
};

function fmtRelative(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const ahead = -ms;
    const m = Math.round(ahead / 60_000);
    if (m < 60) return `in ${m}m`;
    const h = Math.round(ahead / 3_600_000);
    if (h < 48) return `in ${h}h`;
    return `in ${Math.round(ahead / 86_400_000)}d`;
  }
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(ms / 3_600_000);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function fmtIso(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function fmtDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

// 14-day sparkline. Pure inline SVG — no charting dep.
function Sparkline({ trend }) {
  if (!Array.isArray(trend) || trend.length === 0) return null;
  const w = 80;
  const h = 22;
  const max = Math.max(1, ...trend.map((d) => d.created || 0));
  const stepX = w / Math.max(1, trend.length - 1);
  const points = trend.map((d, i) => {
    const x = i * stepX;
    const y = h - ((d.created || 0) / max) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastY = h - ((trend[trend.length - 1].created || 0) / max) * (h - 2) - 1;
  const lastX = (trend.length - 1) * stepX;
  const allZero = trend.every((d) => !d.created);
  const stroke = allZero ? '#9ca3af' : '#2563eb';
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        points={points}
      />
      {!allZero && <circle cx={lastX} cy={lastY} r="2" fill={stroke} />}
    </svg>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.healthy;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function TriageReportCard({ report, onClose }) {
  if (!report) return null;
  const { recovered, still_failing: stillFailing, zero_yield: zy } = report;
  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">🤖 Auto-Triage Report</h3>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Retried {report.retried.length} failing source{report.retried.length === 1 ? '' : 's'}.
            {' '}
            {recovered.length > 0 && <span><strong>{recovered.length} recovered</strong>. </span>}
            {(stillFailing.length + zy.length) > 0
              ? <span><strong>{stillFailing.length + zy.length} still need attention.</strong></span>
              : <span>Everything else is healthy.</span>}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-blue-700 dark:text-blue-300 text-xs hover:underline">
          Dismiss
        </button>
      </div>
      {recovered.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium text-green-800 dark:text-green-300 mb-0.5">✅ Auto-recovered</div>
          <div className="text-xs text-gray-700 dark:text-gray-300">{recovered.join(', ')}</div>
        </div>
      )}
      {stillFailing.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium text-red-800 dark:text-red-300 mb-0.5">❌ Still failing</div>
          <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 ml-4 list-disc">
            {stillFailing.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong> <span className="text-gray-500">({s.category})</span> — {s.action}
              </li>
            ))}
          </ul>
        </div>
      )}
      {zy.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium text-yellow-800 dark:text-yellow-300 mb-0.5">⚠️ Zero yield (manual review)</div>
          <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 ml-4 list-disc">
            {zy.map((s) => (
              <li key={s.name}><strong>{s.name}</strong> — {s.action}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryHeader({ summary, ingestionCron, nextRunAt, onRefresh, refreshing, onTriage, triaging }) {
  const cells = [
    { key: 'failing',    label: 'Failing' },
    { key: 'stale',      label: 'Stale' },
    { key: 'zero_yield', label: 'Zero yield' },
    { key: 'healthy',    label: 'Healthy' },
    { key: 'disabled',   label: 'Disabled' },
  ];
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🩺 Data Source Health</h1>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Cron: <code className="text-[11px]">{ingestionCron || 'unknown'}</code>
          {' · '}Next run {fmtRelative(nextRunAt)} ({fmtIso(nextRunAt)})
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="ml-3 px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onTriage}
            disabled={triaging}
            className="ml-2 px-2 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 hover:bg-blue-100 disabled:opacity-50"
            title="Retry every failing source, classify what's still broken, and email a summary"
          >
            {triaging ? '🤖 Triaging…' : '🤖 Run Auto-Triage'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {cells.map((c) => {
          const meta = STATUS_META[c.key];
          const count = summary && summary[c.key] != null ? summary[c.key] : 0;
          return (
            <div
              key={c.key}
              className={`px-3 py-2 rounded border ${
                count > 0 && c.key !== 'healthy' && c.key !== 'disabled'
                  ? 'border-current ' + meta.badge
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
              }`}
            >
              <div className="text-2xl font-bold leading-tight">{count}</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-600 dark:text-gray-400">{c.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceRow({ row, onRunNow, runState }) {
  const [showError, setShowError] = useState(false);
  const isRunning = runState === 'running';

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60">
      <td className="py-2 pr-3 align-top w-32">
        <StatusPill status={row.status} />
      </td>
      <td className="py-2 pr-3 align-top">
        <div className="font-medium text-gray-900 dark:text-gray-100">{row.name}</div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          <span className="inline-block px-1 rounded bg-gray-100 dark:bg-gray-700 mr-1">{row.type}</span>
          {row.channel && row.channel.label && row.channel.key !== 'unknown' && (
            <span>· {row.channel.label}</span>
          )}
          {row.schedule && <span> · {row.schedule}</span>}
        </div>
        {row.last_run_error && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowError((v) => !v)}
              className="text-[11px] text-red-700 dark:text-red-300 hover:underline"
            >
              {showError ? 'Hide error' : 'Show last error'}
            </button>
            {showError && (
              <pre className="mt-1 text-[11px] bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded p-2 whitespace-pre-wrap max-w-xl">
                {row.last_run_error}
              </pre>
            )}
          </div>
        )}
      </td>
      <td className="py-2 pr-3 align-top text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
        <div title={fmtIso(row.last_run_at)}>{fmtRelative(row.last_run_at)}</div>
        {row.last_run && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            +{row.last_run.created} new · {row.last_run.fetched} fetched · {fmtDuration(row.last_run.duration_ms)}
          </div>
        )}
      </td>
      <td className="py-2 pr-3 align-top text-right text-sm">
        <div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.rows_24h}</span>
          <span className="text-[11px] text-gray-500"> /24h</span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {row.rows_7d} /7d · {row.rows_30d} /30d
        </div>
      </td>
      <td className="py-2 pr-3 align-top">
        <Sparkline trend={row.trend_14d} />
      </td>
      <td className="py-2 pl-2 align-top text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => onRunNow(row.name)}
          disabled={!row.enabled || isRunning}
          className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
          title={!row.enabled ? 'Source is disabled' : 'Trigger an ad-hoc ingestion run'}
        >
          {isRunning ? 'Running…' : 'Run now'}
        </button>
      </td>
    </tr>
  );
}

export default function DataSourceHealthPage() {
  const { user } = useSelector((s) => s.auth);
  const [data, setData] = useState({ sources: [], summary: {}, ingestion_cron: null, next_run_at: null });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [runStates, setRunStates] = useState({}); // { sourceName: 'running' | 'done' }
  const [triaging, setTriaging] = useState(false);
  const [triageReport, setTriageReport] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setErr(null);
    try {
      const out = await getDataSourceHealth();
      setData(out);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s while page is mounted.
  useEffect(() => {
    const id = setInterval(() => { load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const handleTriage = useCallback(async () => {
    setTriaging(true);
    setErr(null);
    try {
      const out = await runSourceHealthAgent({ retry: true, email: true });
      setTriageReport(out && out.report);
    } catch (e) {
      setErr(`Auto-triage failed: ${e?.response?.data?.message || e.message}`);
    } finally {
      setTriaging(false);
      load(); // refetch the table to reflect post-retry state
    }
  }, [load]);

  const handleRunNow = useCallback(async (name) => {
    setRunStates((s) => ({ ...s, [name]: 'running' }));
    try {
      await runDataSource(name);
    } catch (e) {
      setErr(`Run "${name}" failed: ${e?.response?.data?.message || e.message}`);
    } finally {
      setRunStates((s) => ({ ...s, [name]: 'done' }));
      load(); // refetch so the new last-run shows up
    }
  }, [load]);

  if (!user || user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }

  // Sort: failing → stale → zero_yield → healthy → disabled, then by name.
  const sorted = [...(data.sources || [])].sort((a, b) => {
    const oa = (STATUS_META[a.status] || STATUS_META.healthy).order;
    const ob = (STATUS_META[b.status] || STATUS_META.healthy).order;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <SummaryHeader
          summary={data.summary}
          ingestionCron={data.ingestion_cron}
          nextRunAt={data.next_run_at}
          onRefresh={load}
          refreshing={refreshing}
          onTriage={handleTriage}
          triaging={triaging}
        />

        {triageReport && <TriageReportCard report={triageReport} onClose={() => setTriageReport(null)} />}

        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded">
            No data sources registered.
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 pr-3">Source</th>
                  <th className="text-left py-2 pr-3">Last run</th>
                  <th className="text-right py-2 pr-3">Rows</th>
                  <th className="text-left py-2 pr-3">Trend (14d)</th>
                  <th className="text-right py-2 pl-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <SourceRow
                    key={row.id}
                    row={row}
                    onRunNow={handleRunNow}
                    runState={runStates[row.name]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          <strong>Failing</strong>: last run errored. <strong>Stale</strong>: no successful run in 48h+.{' '}
          <strong>Zero yield</strong>: 3+ runs in a row created 0 rows (likely a broken feed URL or ToS change).{' '}
          <strong>Disabled</strong>: source flag turned off.
        </p>
      </div>
    </div>
  );
}
