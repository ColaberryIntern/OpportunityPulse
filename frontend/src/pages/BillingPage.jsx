import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getBillingUsage, getBillingPlan, changeBillingPlan } from '../services/oiedService';

const TIERS = ['basic', 'pro', 'enterprise'];

function pct(used, limit) {
  if (limit < 0 || limit == null) return 0;
  if (limit === 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function UsageRow({ metric, info }) {
  const p = pct(info.used, info.limit);
  const overEighty = p >= 80;
  const overLimit  = info.limit >= 0 && info.used >= info.limit;
  const barColor = overLimit
    ? 'bg-red-500'
    : overEighty
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  const label = info.limit < 0 ? '∞' : info.limit;
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800" data-testid={`billing-usage-row-${metric}`}>
      <td className="py-2 px-2 font-mono text-xs">{metric}</td>
      <td className="py-2 px-2 text-right text-sm">{info.used}</td>
      <td className="py-2 px-2 text-right text-sm">{label}</td>
      <td className="py-2 px-2 text-right text-xs text-gray-500">
        {info.limit < 0 ? '—' : (info.remaining != null ? info.remaining : '—')}
      </td>
      <td className="py-2 px-2 w-1/3">
        {info.limit < 0 ? (
          <div className="text-xs text-gray-400">unlimited</div>
        ) : (
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded">
            <div className={`h-2 rounded ${barColor}`} style={{ width: `${p}%` }} />
          </div>
        )}
      </td>
    </tr>
  );
}

function BillingPage() {
  const { user } = useSelector((s) => s.auth);
  const [usage, setUsage] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [u, p] = await Promise.all([getBillingUsage(), getBillingPlan()]);
      setUsage(u); setPlan(p);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTier(tier) {
    if (!user || user.role !== 'admin') return;
    if (!window.confirm(`Change plan tier to "${tier}"? This affects every member of your organization.`)) return;
    setBusy(true);
    setBanner(null);
    try {
      await changeBillingPlan(tier);
      setBanner(`✅ Tier updated to ${tier}.`);
      await load();
    } catch (e) {
      setBanner('Failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <div className="p-6 text-center text-gray-500">Please log in.</div>;

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto" data-testid="billing-page">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            💳 Billing & Usage
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 font-medium">
              OIED v6
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Plan tier and monthly usage for your organization. Limits enforce
            when <code>OIED_BILLING_ENFORCE</code> is on at the server.
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

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : (
          <>
            <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Current plan</h2>
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold text-gray-900 dark:text-gray-100" data-testid="billing-current-tier">
                  {plan?.tier || '—'}
                </span>
                <div className="text-xs text-gray-500">
                  Enforcement is <strong>{plan?.enforcing ? 'ON' : 'OFF'}</strong>
                </div>
              </div>
              {user.role === 'admin' && (
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Change tier:</span>
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy || plan?.tier === t}
                      onClick={() => handleTier(t)}
                      className={`px-3 py-1.5 rounded text-sm border ${
                        plan?.tier === t
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      } disabled:opacity-50`}
                      data-testid={`billing-tier-btn-${t}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Usage this month
              </h2>
              {usage && usage.metrics ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                      <th className="py-2 px-2">Metric</th>
                      <th className="py-2 px-2 text-right">Used</th>
                      <th className="py-2 px-2 text-right">Limit</th>
                      <th className="py-2 px-2 text-right">Remaining</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(usage.metrics).map(([m, info]) => (
                      <UsageRow key={m} metric={m} info={info} />
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-gray-500">No usage recorded yet.</div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default BillingPage;
