import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getPortfolioDashboard, refreshPortfolio,
  acknowledgeRecommendation, dismissRecommendation,
} from '../services/deepResearchService';
import {
  SequencingBadge, PressureGauge, StatTile, RoiScenarios, BottleneckList,
  DependencyEdgeList, QuarterPlanGrid, RecommendationRow,
} from '../components/deepResearch/PortfolioVisuals';

// Deep Research Phase 4 — AI Venture Portfolio Command Center.

function Section({ title, right, children, testId }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 mb-5" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function PortfolioDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setData(await getPortfolioDashboard()); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load portfolio dashboard'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setBusy(true);
    setErr(null);
    try { await refreshPortfolio(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Refresh failed'); }
    finally { setBusy(false); }
  }
  async function handleAck(id) {
    setBusy(true);
    try { await acknowledgeRecommendation(id); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  async function handleDismiss(id) {
    setBusy(true);
    try { await dismissRecommendation(id); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }

  if (loading && !data) return <div className="p-6 text-center text-gray-500">Loading portfolio intelligence…</div>;

  const capacity = data && data.capacity;
  const ranking = data && data.ranking && data.ranking.ranking;
  const forecasts = data && data.forecasts;
  const overlaps = (data && data.overlaps) || [];
  const dependencies = (data && data.dependencies) || { nodes: [], edges: [] };
  const plan = data && data.plan;
  const templates = (data && data.templates) || [];
  const recommendations = (data && data.recommendations) || [];
  const ops = data && data.operational_metrics;

  const decisionCounts = (ranking || []).reduce((acc, r) => {
    const f = r.factors || {};
    const d = (f.decision_weight === 100 ? 'BUILD_NOW' : f.decision_weight === 75 ? 'BUILD_SOON' : 'OTHER');
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              📊 Portfolio Intelligence
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-medium">
                Venture Portfolio Command Center
              </span>
            </h1>
            <p className="text-sm text-gray-500">
              Organizational capacity, portfolio ROI, dependencies, and reassessment recommendations
              across every venture. Read-only — no autonomous changes.
            </p>
          </div>
          <button
            type="button" onClick={handleRefresh} disabled={busy}
            className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
            data-testid="refresh-portfolio"
          >
            {busy ? 'Refreshing…' : '↻ Refresh Portfolio'}
          </button>
        </header>

        {err && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{err}</div>}

        {/* Portfolio health stats — capacity uses Sequelize toJSON camelCase keys. */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <StatTile label="Active ventures" value={capacity ? capacity.activeVentures : '—'} />
          <StatTile label="BUILD_NOW" value={capacity ? capacity.buildNowVentures : '—'} />
          <StatTile label="Concurrency limit" value={capacity ? capacity.concurrencyLimit : '—'} hint="parallel ventures" />
          <StatTile label="Reassessments" value={recommendations.length} hint="pending review" />
          <StatTile label="Templates detected" value={templates.length} />
        </div>

        {/* Capacity pressure */}
        <Section title="Capacity Pressure" testId="section-capacity"
          right={capacity && <span className="text-xs text-gray-500">{capacity.rationale}</span>}>
          {capacity ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <PressureGauge label="Staffing pressure" value={capacity.staffingPressure} />
              <PressureGauge label="Infrastructure pressure" value={capacity.infraPressure} />
            </div>
          ) : <p className="text-gray-400">Capacity not yet computed. Click <strong>Refresh</strong>.</p>}
          {capacity && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Bottlenecks</div>
              <BottleneckList bottlenecks={capacity.bottlenecks} />
            </div>
          )}
        </Section>

        {/* Portfolio ROI */}
        <Section title="Portfolio ROI Forecast" testId="section-roi">
          {forecasts && forecasts.portfolio ? <RoiScenarios portfolio={forecasts.portfolio} />
            : <p className="text-gray-400">Forecasts not yet computed.</p>}
        </Section>

        {/* Portfolio ranking */}
        <Section title={`Portfolio Ranking (${(ranking || []).length})`} testId="section-ranking">
          {(ranking || []).length === 0
            ? <p className="text-gray-400">Ranking not yet computed.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="py-2">#</th>
                    <th className="py-2">Venture</th>
                    <th className="py-2 text-right">Score</th>
                    <th className="py-2">Sequencing</th>
                    <th className="py-2 text-right">Composite</th>
                    <th className="py-2 text-right">Exec Rdns</th>
                    <th className="py-2 text-right">ROI factor</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.slice(0, 15).map((r) => (
                    <tr key={r.id || r.ventureIdeaId} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-500">{r.portfolioRank}</td>
                      <td className="py-1.5 font-medium text-gray-800">
                        {r.title || `Venture #${r.ventureIdeaId}`}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-gray-800">
                        {Math.round(Number(r.portfolioScore))}
                      </td>
                      <td className="py-1.5"><SequencingBadge rec={r.sequencingRecommendation} /></td>
                      <td className="py-1.5 text-right text-gray-600">
                        {Math.round(Number((r.factors || {}).composite_score) || 0)}
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {Math.round(Number((r.factors || {}).execution_readiness) || 0)}
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {Math.round(Number((r.factors || {}).roi_potential) || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Section>

        {/* Capacity plan / sequencing */}
        <Section title="Execution Capacity Plan" testId="section-plan"
          right={plan && <span className="text-xs text-gray-500">
            Concurrency {plan.concurrency_limit} · avg {plan.average_venture_weeks}wk · {plan.schedulable_in_horizon}/{plan.sequence ? plan.sequence.length : 0} schedulable
          </span>}>
          {plan ? <QuarterPlanGrid plan={plan} /> : <p className="text-gray-400">Plan not yet computed.</p>}
          {plan && plan.hiring_recommendations && plan.hiring_recommendations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Hiring recommendations
              </div>
              <ul className="text-xs text-gray-700 space-y-1">
                {plan.hiring_recommendations.map((h) => (
                  <li key={h.role}>
                    <strong className="capitalize">{h.role}</strong>: hire {h.hires_recommended} —{' '}
                    <span className="text-gray-500">{h.rationale}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* Dependency graph */}
        <Section title={`Cross-Venture Dependencies (${dependencies.edges.length})`} testId="section-dependencies">
          <DependencyEdgeList edges={dependencies.edges} nodes={dependencies.nodes} />
        </Section>

        {/* Infrastructure overlap */}
        <Section title={`Shared Infrastructure (${overlaps.length} pairs)`} testId="section-overlaps">
          {overlaps.length === 0 ? <p className="text-gray-400">No significant overlap detected yet.</p>
            : (
              <ul className="text-xs space-y-1">
                {overlaps.slice(0, 10).map((o) => {
                  const titleA = (dependencies.nodes.find((n) => n.venture_idea_id === o.ventureAId) || {}).title || `#${o.ventureAId}`;
                  const titleB = (dependencies.nodes.find((n) => n.venture_idea_id === o.ventureBId) || {}).title || `#${o.ventureBId}`;
                  return (
                    <li key={o.id}>
                      <span className="font-medium text-gray-800">
                        {Math.round(Number(o.overlapScore) * 100)}% overlap
                      </span>
                      <span className="text-gray-600"> — {titleA} ↔ {titleB}</span>
                      <span className="text-gray-400"> ({(o.sharedComponents || []).slice(0, 3).join(', ')})</span>
                    </li>
                  );
                })}
              </ul>
            )}
        </Section>

        {/* Templates */}
        <Section title={`Venture Templates (${templates.length})`} testId="section-templates">
          {templates.length === 0 ? <p className="text-gray-400">No reusable patterns detected yet.</p>
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((t) => (
                  <div key={t.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                      <span className="text-[11px] text-gray-500">{(t.applicableTo || []).length} ventures</span>
                    </div>
                    <p className="text-xs text-gray-600">{t.description}</p>
                    {t.mvpScaffold && t.mvpScaffold.typical_timeline_weeks && (
                      <p className="text-[11px] text-gray-500 mt-1.5">
                        Typical: ~{t.mvpScaffold.typical_timeline_weeks}wk MVP
                        {t.mvpScaffold.typical_staffing && t.mvpScaffold.typical_staffing.typical_headcount
                          && ` · ${t.mvpScaffold.typical_staffing.typical_headcount} people`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
        </Section>

        {/* Reassessment recommendations — human-in-the-loop */}
        <Section
          title={`Reassessment Recommendations (${recommendations.length})`}
          testId="section-recommendations"
          right={<span className="text-[11px] text-gray-400">recommendations only — never auto-applied</span>}
        >
          {recommendations.length === 0
            ? <p className="text-gray-400 text-sm">No pending recommendations — portfolio confidence is fresh.</p>
            : (
              <div className="space-y-2">
                {recommendations.slice(0, 10).map((r) => (
                  <RecommendationRow
                    key={r.id} rec={r} busy={busy}
                    onAck={() => handleAck(r.id)}
                    onDismiss={() => handleDismiss(r.id)}
                  />
                ))}
              </div>
            )}
        </Section>

        {/* Operational metrics */}
        <Section title="Operational Visibility" testId="section-operations">
          {!ops ? <p className="text-gray-400">No operational data yet.</p>
            : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Venture velocity</div>
                  <p className="text-sm text-gray-700">
                    {ops.venture_velocity.transitions_per_7d} lifecycle transitions in the last 7 days;{' '}
                    {ops.venture_velocity.transitions_per_30d} in the last 30 days.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Queue pressure</div>
                  <p className="text-sm text-gray-700">
                    {ops.queue_pressure.active_queue} active queue items ·{' '}
                    <strong>{ops.queue_pressure.build_now}</strong> BUILD_NOW ·{' '}
                    {ops.queue_pressure.pending_recommendations} pending recommendations.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Decision quality</div>
                  <p className="text-sm text-gray-700">
                    {ops.decision_quality.build_now_progressed}/{ops.decision_quality.build_now_count}{' '}
                    BUILD_NOW ventures have progressed past approval
                    {ops.decision_quality.progression_rate != null
                      && ` (${Math.round(ops.decision_quality.progression_rate * 100)}%)`}.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Readiness aging</div>
                  <p className="text-sm text-gray-700">
                    Median assessment age: <strong>{ops.readiness_aging.median_age_days || 0} days</strong>{' '}
                    · {ops.readiness_aging.stale_count} stale (over {ops.readiness_aging.grace_days}d grace).
                  </p>
                </div>
                {Object.keys(ops.cycle_time_by_stage || {}).length > 0 && (
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Cycle time by stage</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(ops.cycle_time_by_stage).map(([stage, info]) => (
                        <span key={stage} className="text-[11px] bg-gray-100 text-gray-700 rounded px-2 py-0.5">
                          {stage}: median <strong>{info.median_days != null ? `${info.median_days}d` : '—'}</strong>
                          {' '}<span className="text-gray-400">({info.samples})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
        </Section>

        <p className="text-xs text-gray-400 text-center mt-2">
          <Link to="/admin/deep-research/execution" className="text-blue-600 hover:underline">← Execution dashboard</Link>
          {' · '}<Link to="/admin/deep-research" className="text-blue-600 hover:underline">Deep Research index</Link>
        </p>
      </div>
    </div>
  );
}

export default PortfolioDashboardPage;
