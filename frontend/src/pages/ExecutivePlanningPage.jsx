import React, { useCallback, useEffect, useState } from 'react';
import {
  getPlanningWorkspace, runAdaptiveRefresh,
  acknowledgeIntervention, dismissIntervention,
  acknowledgeStrategicRecommendation, dismissStrategicRecommendation,
  acknowledgeDriftItem, dismissDriftItem,
  recordDependencyAction,
} from '../services/deepResearchService';
import {
  HealthBadge, HealthBucketStrip, AccuracyBar,
  RecommendationRow, RefreshRunRow, VentureHealthRow,
  DependencyReviewRow, RefreshStatusBadge,
} from '../components/deepResearch/PlanningVisuals';

// Deep Research Phase 6 — Executive Planning Workspace.
// Adaptive Strategic Operations: refresh runs, interventions, strategic
// recommendations, venture health, forecast accuracy, operational drift,
// dependency review workflow.

function Section({ title, right, children, testId, subtitle }) {
  return (
    <section
      className="bg-white border border-gray-200 rounded-xl p-6 mb-5"
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function ExecutivePlanningPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await getPlanningWorkspace()); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load planning workspace'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, errLabel) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || errLabel); }
    finally { setBusy(false); }
  }

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500">Loading planning workspace…</div>;
  }

  const analytics = data?.analytics || {};
  const totals = analytics.totals || {};
  const interventions = data?.interventions?.pending || [];
  const strategic = data?.strategic_recommendations?.pending || [];
  const health = data?.venture_health || {};
  const healthBuckets = health.buckets || {};
  const healthRows = health.rows || [];
  const drift = data?.operational_drift?.pending || [];
  const accuracy = data?.forecast_accuracy || {};
  const refreshHistoryList = data?.refresh_history?.recent_runs || [];
  const openEdges = data?.dependency_review?.open_edges || [];
  const recentActions = data?.dependency_review?.recent_actions || [];
  const lastRun = refreshHistoryList[0];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              🛰 Executive Planning Workspace
              <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-800 font-medium">
                Adaptive Strategic Operations
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Recommendations only. No lifecycle moves, no scoring changes, no auto-execution.
              Every signal here is a prompt for a human decision.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastRun && (
              <div className="text-xs text-gray-500 mr-2">
                Last refresh:{' '}
                <RefreshStatusBadge status={lastRun.status} />
                <span className="ml-2">
                  {lastRun.startedAt ? new Date(lastRun.startedAt).toLocaleString() : ''}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => withBusy(() => runAdaptiveRefresh('full'), 'Refresh failed')}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40"
              data-testid="run-refresh-btn"
            >
              {busy ? 'Refreshing…' : 'Run Refresh'}
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Top-level KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-testid="planning-kpis">
          <StatCard
            label="Active Ventures"
            value={totals.active ?? '—'}
            sub={`${totals.total_ventures ?? 0} total`}
          />
          <StatCard
            label="Pending Interventions"
            value={interventions.length}
            sub={`${strategic.length} strategic recs`}
          />
          <StatCard
            label="Operational Drift"
            value={drift.length}
            sub="open alerts"
          />
          <StatCard
            label="Open Dependencies"
            value={openEdges.length}
            sub={`${recentActions.length} recent actions`}
          />
        </div>

        {/* Venture Health */}
        <Section
          title="Venture Health Intelligence"
          subtitle="Per-venture classification from the latest signals. Informational; never auto-acts."
          testId="section-venture-health"
          right={
            <span className="text-xs text-gray-400">{healthRows.length} ventures</span>
          }
        >
          <HealthBucketStrip buckets={healthBuckets} />
          {healthRows.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-left py-2 px-2">Venture</th>
                    <th className="text-left py-2 px-2">Class</th>
                    <th className="text-right py-2 px-2">Score</th>
                    <th className="text-left py-2 px-2">Rationale</th>
                    <th className="text-left py-2 px-2">Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {healthRows.map((row) => (
                    <VentureHealthRow key={row.id || row.ventureIdeaId} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {healthRows.length === 0 && (
            <div className="mt-3 text-xs text-gray-400 italic">
              No health rows yet — run a refresh to compute.
            </div>
          )}
        </Section>

        {/* Executive Interventions */}
        <Section
          title="Executive Intervention Engine"
          subtitle="Recommendations to act on. Acknowledge or dismiss — system never enforces."
          testId="section-interventions"
        >
          {interventions.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No pending interventions.</div>
          ) : (
            <div className="grid gap-2">
              {interventions.map((rec) => (
                <RecommendationRow
                  key={rec.id}
                  item={rec}
                  type="intervention"
                  typeLabel={rec.interventionType}
                  busy={busy}
                  onAck={() => withBusy(
                    () => acknowledgeIntervention(rec.id), 'Acknowledge failed',
                  )}
                  onDismiss={() => withBusy(
                    () => dismissIntervention(rec.id), 'Dismiss failed',
                  )}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Strategic Recommendations */}
        <Section
          title="Strategic Recommendation Engine"
          subtitle="Portfolio-level moves that span ventures. Always a recommendation, never a directive."
          testId="section-strategic-recs"
        >
          {strategic.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No pending strategic recommendations.</div>
          ) : (
            <div className="grid gap-2">
              {strategic.map((rec) => (
                <RecommendationRow
                  key={rec.id}
                  item={rec}
                  type="strategic"
                  typeLabel={rec.recommendationType}
                  busy={busy}
                  onAck={() => withBusy(
                    () => acknowledgeStrategicRecommendation(rec.id), 'Acknowledge failed',
                  )}
                  onDismiss={() => withBusy(
                    () => dismissStrategicRecommendation(rec.id), 'Dismiss failed',
                  )}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Forecast Accuracy */}
        <Section
          title="Forecast-vs-Reality Analytics"
          subtitle="Measure-only. No automatic model tuning — humans review and adjust."
          testId="section-forecast-accuracy"
        >
          <AccuracyBar summary={accuracy} />
        </Section>

        {/* Operational Drift */}
        <Section
          title="Operational Drift Monitoring"
          subtitle="Queue accumulation, transition slowdowns, role imbalances, bottlenecks."
          testId="section-operational-drift"
        >
          {drift.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No operational drift detected.</div>
          ) : (
            <div className="grid gap-2">
              {drift.map((item) => (
                <RecommendationRow
                  key={item.id}
                  item={item}
                  type="drift"
                  typeLabel={item.driftType}
                  busy={busy}
                  onAck={() => withBusy(
                    () => acknowledgeDriftItem(item.id), 'Acknowledge failed',
                  )}
                  onDismiss={() => withBusy(
                    () => dismissDriftItem(item.id), 'Dismiss failed',
                  )}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Dependency Review */}
        <Section
          title="Dependency Review Workflow"
          subtitle="Approve, reject, annotate, assign, or resolve directional dependency edges."
          testId="section-dependency-review"
        >
          {openEdges.length === 0 ? (
            <div className="text-xs text-gray-400 italic">
              No proposed dependency edges awaiting review.
            </div>
          ) : (
            <div className="grid gap-2">
              {openEdges.map((edge) => (
                <DependencyReviewRow
                  key={edge.id}
                  edge={edge}
                  busy={busy}
                  onAction={(id, action, payload) => withBusy(
                    () => recordDependencyAction(id, { action, ...payload }),
                    'Action failed',
                  )}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Refresh history */}
        <Section
          title="Continuous Observatory Refresh"
          subtitle="Recent automated + manual refresh runs. Step-by-step audit."
          testId="section-refresh-history"
        >
          {refreshHistoryList.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No refresh runs yet.</div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {refreshHistoryList.map((run) => (
                <RefreshRunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

export default ExecutivePlanningPage;
