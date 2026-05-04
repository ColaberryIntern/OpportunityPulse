import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { getBriefing, sendBriefingEmail } from '../services/oiedService';

function fmtUSD(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function TopActionMini({ rank, action }) {
  return (
    <Link
      to={`/admin/opportunities/recommendations`}
      className="block p-3 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
      data-testid="briefing-top-action"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-gray-500 font-mono">#{rank}</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{action.title}</span>
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{action.reason}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
        <span>{fmtUSD(action.expected_value)}</span>
        <span>·</span>
        <span>win {Math.round((action.win_probability || 0) * 100)}%</span>
        <span>·</span>
        <span>{action.effort_estimate?.proposal_hours || '?'}h</span>
      </div>
    </Link>
  );
}

function BundleOfTheDay({ bundle }) {
  if (!bundle) return null;
  return (
    <div
      className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
      data-testid="briefing-bundle"
    >
      <div className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-300 mb-1">
        🧩 Bundle of the Day
      </div>
      <div className="font-semibold text-gray-900 dark:text-gray-100">{bundle.theme}</div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
        {bundle.opportunity_count} opportunities · {fmtUSD(bundle.estimated_total_value)} total value
      </div>
      {bundle.strategy?.what_to_build && (
        <div className="text-sm text-gray-800 dark:text-gray-200 mt-2">
          <span className="font-medium">Build: </span>{bundle.strategy.what_to_build}
        </div>
      )}
      <Link
        to="/admin/opportunities/bundles"
        className="inline-block mt-3 text-sm text-purple-700 dark:text-purple-300 hover:underline"
      >
        View bundle →
      </Link>
    </div>
  );
}

function SkipWarning({ warning }) {
  if (!warning) return null;
  return (
    <div
      className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      data-testid="briefing-skip-warning"
    >
      <div className="text-xs font-semibold uppercase text-red-700 dark:text-red-300 mb-1">
        ⚠️  Skip This
      </div>
      <div className="font-semibold text-gray-900 dark:text-gray-100">{warning.title}</div>
      <div className="text-xs text-red-700 dark:text-red-300 mt-1">{warning.reason}</div>
    </div>
  );
}

function Totals({ totals }) {
  return (
    <div
      className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
      data-testid="briefing-totals"
    >
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Today's potential</div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtUSD(totals.revenue_potential_usd)}</div>
          <div className="text-xs text-gray-500">in revenue</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totals.effort_hours_today}h</div>
          <div className="text-xs text-gray-500">of effort</div>
        </div>
        {totals.bundle_revenue_usd > 0 && (
          <div>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{fmtUSD(totals.bundle_revenue_usd)}</div>
            <div className="text-xs text-gray-500">bundle play</div>
          </div>
        )}
      </div>
    </div>
  );
}

function BriefingPage() {
  const { user } = useSelector((s) => s.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [emailing, setEmailing] = useState(false);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await getBriefing());
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleEmail() {
    setEmailing(true);
    setBanner(null);
    try {
      const out = await sendBriefingEmail();
      setBanner(out && out.sent ? '✅ Email sent.' : 'Email skipped (no recipient configured).');
    } catch (e) {
      setBanner('Failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setEmailing(false);
    }
  }

  if (!user) return <div className="p-6 text-center text-gray-500">Please log in.</div>;

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto" data-testid="briefing-page">
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              📨 Today's Briefing
              <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 font-medium">
                OIED v4
              </span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {data?.date && `For ${data.date}. `}Top 3 actions, bundle of the day,
              one row to skip, and today's revenue + effort totals.
            </p>
          </div>
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={handleEmail}
              disabled={emailing}
              className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50"
              data-testid="briefing-email-btn"
            >
              {emailing ? 'Sending…' : '📤 Email me this'}
            </button>
          )}
        </header>

        {banner && (
          <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 text-sm text-blue-900 dark:text-blue-100 mb-3">
            {banner}
          </div>
        )}
        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading briefing…</div>
        ) : !data ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded">
            No briefing data available.
          </div>
        ) : (
          <div className="space-y-4">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Top 3 Actions
              </h2>
              {data.top_actions.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 italic border rounded">
                  No recommendations available — generate fit scores via the My Opportunities page first.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.top_actions.map((a, i) => (
                    <TopActionMini key={a.opportunity_id} rank={i + 1} action={a} />
                  ))}
                </div>
              )}
            </section>

            <BundleOfTheDay bundle={data.bundle_opportunity} />
            <SkipWarning warning={data.ignore_warning} />
            <Totals totals={data.totals} />
          </div>
        )}
      </div>
    </div>
  );
}

export default BriefingPage;
