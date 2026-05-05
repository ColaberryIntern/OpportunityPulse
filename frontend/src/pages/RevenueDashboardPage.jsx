import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getRevenueDashboard } from '../services/oiedService';
import VelocityPanel from '../components/oied/VelocityPanel';

function fmtUSD(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function StatCard({ label, value, hint, tone = 'gray', testId }) {
  const tones = {
    gray:    'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    blue:    'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    purple:  'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
  };
  return (
    <div
      className={`p-4 rounded-lg border ${tones[tone]}`}
      data-testid={testId}
    >
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

function BucketBar({ bucket, value, count, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const labels = {
    act_now:    { text: '🔥 Act Now',     bar: 'bg-red-400 dark:bg-red-600' },
    high_value: { text: '💰 High Value',  bar: 'bg-emerald-400 dark:bg-emerald-600' },
    quick_win:  { text: '⚡ Quick Win',   bar: 'bg-amber-400 dark:bg-amber-600' },
    standard:   { text: '· Standard',     bar: 'bg-gray-300 dark:bg-gray-600' },
  };
  const meta = labels[bucket] || labels.standard;
  return (
    <div className="mb-2" data-testid={`bucket-bar-${bucket}`}>
      <div className="flex items-baseline justify-between text-xs text-gray-500 mb-1">
        <span>{meta.text} <span className="text-gray-400">({count})</span></span>
        <span className="font-mono">{fmtUSD(value)}</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded">
        <div
          className={`h-2 rounded ${meta.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WeeklyTrend({ trend }) {
  if (!trend || trend.length === 0) return null;
  const max = Math.max(1, ...trend.map((w) => w.won_value || 0));
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Weekly trend (last 12 weeks)
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1">Week of</th>
            <th className="py-1 text-right">Wins</th>
            <th className="py-1 text-right">Value</th>
            <th className="py-1 w-1/3 pl-3">·</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((w) => (
            <tr key={w.week_start} className="border-t border-gray-100 dark:border-gray-700">
              <td className="py-1 font-mono text-gray-500">{w.week_start}</td>
              <td className="py-1 text-right">{w.won_count}</td>
              <td className="py-1 text-right">{fmtUSD(w.won_value)}</td>
              <td className="py-1 pl-3">
                <div className="h-2 bg-emerald-200 dark:bg-emerald-800 rounded"
                  style={{ width: `${Math.round(((w.won_value || 0) / max) * 100)}%`, minWidth: w.won_count > 0 ? '4%' : 0 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueDashboardPage() {
  const { user } = useSelector((s) => s.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await getRevenueDashboard());
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user) return <div className="p-6 text-center text-gray-500">Please log in.</div>;
  if (user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }

  const maxBucket = Math.max(1, ...(data?.pipeline_by_bucket || []).map((b) => b.value || 0));

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto" data-testid="revenue-dashboard-page">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            💰 Revenue Dashboard
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 font-medium">
              OIED v5
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pipeline value, expected revenue (Σ value × win prob), actual revenue,
            and weekly trend across the last 12 weeks.
          </p>
        </header>

        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading dashboard…</div>
        ) : !data ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded">
            No data yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <StatCard label="Pipeline value"   value={fmtUSD(data.pipeline_value)}
                hint={`drafts in queue`} tone="blue" testId="rev-stat-pipeline" />
              <StatCard label="Expected revenue" value={fmtUSD(data.expected_revenue)}
                hint={`Σ value × win prob`} tone="purple" testId="rev-stat-expected" />
              <StatCard label="Actual revenue"   value={fmtUSD(data.actual_revenue)}
                hint={`${data.won_count} wins recorded`} tone="emerald" testId="rev-stat-actual" />
              <StatCard label="Conversion rate"
                value={data.conversion_rate != null ? `${Math.round(data.conversion_rate * 100)}%` : '—'}
                hint={`${data.won_count} won / ${data.lost_count} lost`} tone="gray"
                testId="rev-stat-conversion" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard label="Submitted"  value={data.submitted_count} tone="gray" />
              <StatCard label="Responded"  value={data.response_count}   tone="gray" />
              <StatCard label="Submit→Win"
                value={data.submit_to_win_rate != null ? `${Math.round(data.submit_to_win_rate * 100)}%` : '—'}
                hint="wins / submissions" tone="gray" />
            </div>

            <VelocityPanel velocity={data.velocity} />

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              data-testid="rev-pipeline-by-bucket">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Pipeline by bucket
              </h3>
              {(data.pipeline_by_bucket || []).map((b) => (
                <BucketBar key={b.bucket} bucket={b.bucket} value={b.value} count={b.count} max={maxBucket} />
              ))}
            </div>

            <WeeklyTrend trend={data.weekly_trend} />
          </div>
        )}
      </div>
    </div>
  );
}

export default RevenueDashboardPage;
