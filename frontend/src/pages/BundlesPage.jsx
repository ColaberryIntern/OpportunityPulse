import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { listBundles, runBundler, generateBundleStrategy, generateBundleBlueprint } from '../services/oiedService';

function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function BlueprintView({ blueprint }) {
  if (!blueprint || !blueprint.mvp_scope) return null;
  return (
    <div
      className="mt-2 p-3 rounded bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800"
      data-testid="bundle-blueprint"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
          📐 Blueprint
        </h4>
        <span className="text-xs text-indigo-700 dark:text-indigo-300">
          {blueprint.time_to_market_weeks ? `${blueprint.time_to_market_weeks}w to market` : ''}
        </span>
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">
        <span className="font-medium">MVP: </span>{blueprint.mvp_scope}
      </p>
      {Array.isArray(blueprint.features) && blueprint.features.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Features:</div>
          <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
            {blueprint.features.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(blueprint.required_agents) && blueprint.required_agents.length > 0 && (
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">
          <span className="font-medium">Required agents: </span>
          {blueprint.required_agents.join(', ')}
        </p>
      )}
      {blueprint.monetization_strategy && (
        <p className="text-xs text-gray-700 dark:text-gray-300">
          <span className="font-medium">Monetization: </span>
          {blueprint.monetization_strategy}
        </p>
      )}
    </div>
  );
}

function StrategyView({ strategy }) {
  if (!strategy || !strategy.what_to_build) return null;
  return (
    <div
      className="mt-3 p-3 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
      data-testid="bundle-strategy"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
          🧠 Strategy: {strategy.suggested_solution || strategy.what_to_build}
        </h4>
        <span className="text-xs text-purple-700 dark:text-purple-300">
          {fmtUSD(strategy.revenue_potential_usd)} potential ·
          {' '}{strategy.build_time_days || '?'}d build ·
          {' '}{strategy.opportunities_unlocked || 0} opps
        </span>
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200 mb-1">
        <span className="font-medium">What to build: </span>
        {strategy.what_to_build}
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        <span className="font-medium">Why it works: </span>
        {strategy.why_it_works}
      </p>
    </div>
  );
}

function BundleCard({ bundle, isAdmin, onStrategyUpdate }) {
  const [busy, setBusy] = useState(false);
  const [busyBlueprint, setBusyBlueprint] = useState(false);
  const [localStrategy, setLocalStrategy] = useState(bundle.strategy || {});
  const [localBlueprint, setLocalBlueprint] = useState(bundle.blueprint || {});
  const [err, setErr] = useState(null);

  async function handleGenerate(force = false) {
    if (!isAdmin) return;
    if (force && !window.confirm('Re-generate strategy? Existing copy will be replaced.')) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await generateBundleStrategy(bundle.id, force);
      setLocalStrategy(out.strategy || {});
      onStrategyUpdate && onStrategyUpdate(bundle.id, out);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleBlueprint(force = false) {
    if (!isAdmin) return;
    if (force && !window.confirm('Re-generate blueprint? Existing copy will be replaced.')) return;
    setBusyBlueprint(true);
    setErr(null);
    try {
      const out = await generateBundleBlueprint(bundle.id, force);
      setLocalBlueprint(out.blueprint || {});
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed');
    } finally {
      setBusyBlueprint(false);
    }
  }

  const hasStrategy = !!(localStrategy && localStrategy.what_to_build);
  const hasBlueprint = !!(localBlueprint && localBlueprint.mvp_scope);

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

      <StrategyView strategy={localStrategy} />
      <BlueprintView blueprint={localBlueprint} />

      {err && (
        <div className="mt-2 p-2 rounded bg-red-50 text-sm text-red-700">{err}</div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2 mt-3">
          {!hasStrategy ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleGenerate(false)}
              className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50"
              data-testid="generate-strategy-btn"
            >
              {busy ? 'Generating…' : '🧠 Generate Strategy'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleGenerate(true)}
              className="px-3 py-1.5 rounded border border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300 text-sm hover:bg-purple-50 dark:hover:bg-purple-900/30 disabled:opacity-50"
              data-testid="regenerate-strategy-btn"
            >
              {busy ? 'Re-generating…' : '🔄 Re-generate Strategy'}
            </button>
          )}
          {hasStrategy && !hasBlueprint && (
            <button
              type="button"
              disabled={busyBlueprint}
              onClick={() => handleBlueprint(false)}
              className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
              data-testid="generate-blueprint-btn"
            >
              {busyBlueprint ? 'Designing…' : '📐 Generate Blueprint'}
            </button>
          )}
          {hasBlueprint && (
            <button
              type="button"
              disabled={busyBlueprint}
              onClick={() => handleBlueprint(true)}
              className="px-3 py-1.5 rounded border border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50"
              data-testid="regenerate-blueprint-btn"
            >
              {busyBlueprint ? 'Re-designing…' : '🔄 Re-generate Blueprint'}
            </button>
          )}
        </div>
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
            {bundles.map((b) => (
              <BundleCard
                key={b.id}
                bundle={b}
                isAdmin={isAdmin}
                onStrategyUpdate={(id, out) => {
                  setBundles((prev) => prev.map((row) => (
                    row.id === id
                      ? {
                          ...row,
                          strategy: out.strategy,
                          suggestedSolution: out.suggestedSolution,
                          estimatedBuildTimeDays: out.estimatedBuildTimeDays,
                        }
                      : row
                  )));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BundlesPage;
