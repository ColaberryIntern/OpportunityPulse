import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { listBundles, runBundler } from '../services/oiedService';

function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function BundleCard({ bundle }) {
  return (
    <article className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3" data-testid="bundle-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          {bundle.theme}
        </h3>
        <div className="text-right">
          <div className="text-xs text-gray-500">Total value</div>
          <div className="font-semibold">{fmtUSD(bundle.estimatedTotalValue)}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
        <span>{bundle.opportunityCount} opportunities</span>
        <span>·</span>
        <span className="font-mono">{bundle.key}</span>
        <span>·</span>
        <span>{new Date(bundle.generatedAt).toLocaleString()}</span>
      </div>
      {bundle.summary && (
        <pre className="text-sm whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto">
{bundle.summary}
        </pre>
      )}
    </article>
  );
}

function BundlesPage() {
  const { user } = useSelector((s) => s.auth);
  const isAdmin = user && user.role === 'admin';
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await listBundles({ limit: 50 });
      setBundles(rows);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRun() {
    if (!isAdmin) return;
    if (!window.confirm('Rebuild all bundles now? This re-clusters every active opportunity (deterministic, no AI calls).')) return;
    setBusy(true);
    setBanner(null);
    try {
      const out = await runBundler();
      setBanner(`Rebuilt: ${out.bundles} bundle(s) from ${out.totalCandidates} active opportunities.`);
      await load();
    } catch (e) {
      setBanner('Run failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <div className="p-6 text-center text-gray-500">Please log in.</div>;

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              🧩 Grouped Opportunities
              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">
                OIED bundles
              </span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Active opportunities clustered by category + recommended product +
              shared keywords. ≥3 opportunities per cluster.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleRun}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
              data-testid="run-bundler-btn"
            >
              Rebuild bundles
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
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : bundles.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded" data-testid="bundles-empty">
            No bundles yet. {isAdmin && 'Click "Rebuild bundles" to generate.'}
          </div>
        ) : (
          <div data-testid="bundles-list">
            {bundles.map((b) => <BundleCard key={b.id} bundle={b} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default BundlesPage;
