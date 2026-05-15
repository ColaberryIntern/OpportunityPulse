import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getObservatoryDashboard, refreshObservatory,
  acknowledgeDriftAlert, dismissDriftAlert,
} from '../services/deepResearchService';
import {
  TrajectoryBadge, EcosystemBadge, MovementBadge, Sparkline, DriftAlertRow, EcosystemBars,
} from '../components/deepResearch/TemporalVisuals';

// Deep Research Phase 5 — AI Ecosystem Observatory.

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

function EcosystemObservatoryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await getObservatoryDashboard()); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load observatory'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setBusy(true); setErr(null);
    try { await refreshObservatory(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Refresh failed'); }
    finally { setBusy(false); }
  }
  async function handleAckDrift(id) {
    setBusy(true);
    try { await acknowledgeDriftAlert(id); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  async function handleDismissDrift(id) {
    setBusy(true);
    try { await dismissDriftAlert(id); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }

  if (loading && !data) return <div className="p-6 text-center text-gray-500">Loading ecosystem observatory…</div>;

  const ecosystems = (data && data.ecosystems) || [];
  const trajectories = (data && data.trajectories) || [];
  const accuracy = (data && data.decision_accuracy) || [];
  const predictive = data && data.predictive_capacity;
  const drift = (data && data.drift_alerts) || [];
  const directed = data && data.directed_graph;
  const historical = data && data.historical;
  const timelines = (data && data.signal_timelines) || {};
  const movements = (data && data.temporal_movements) || [];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              🔭 Ecosystem Observatory
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-medium">
                Temporal Venture Intelligence
              </span>
            </h1>
            <p className="text-sm text-gray-500">
              Movement, trajectory, ecosystem evolution, and predictive capacity — all read-only.
              Drift alerts are recommendations; no autonomous changes.
            </p>
          </div>
          <button type="button" onClick={handleRefresh} disabled={busy}
            className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
            data-testid="refresh-observatory">
            {busy ? 'Refreshing…' : '↻ Refresh Observatory'}
          </button>
        </header>

        {err && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{err}</div>}

        {/* Temporal movements */}
        <Section title="Temporal Movements (90-day window)" testId="section-movements">
          {movements.length === 0
            ? <p className="text-xs text-gray-400">No tracked metrics yet.</p>
            : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {movements.map((m) => (
                  <div key={m.metric_key} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500 capitalize">{m.metric_key.replace(/_/g, ' ')}</span>
                      <MovementBadge classification={m.classification} />
                    </div>
                    <div className="text-xs text-gray-700">
                      first {m.first != null ? Math.round(m.first) : '—'} → last {m.last != null ? Math.round(m.last) : '—'}
                      {m.delta_fraction != null && (
                        <span className="ml-1 text-gray-400">
                          ({m.delta_fraction >= 0 ? '+' : ''}{Math.round(m.delta_fraction * 100)}% over {m.period_days}d, {m.samples} samples)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </Section>

        {/* Ecosystems */}
        <Section title={`Ecosystem Evolution (${ecosystems.length})`} testId="section-ecosystems">
          {ecosystems.length === 0
            ? <p className="text-gray-400 text-sm">No ecosystems detected yet.</p>
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ecosystems.map((e) => (
                  <div key={e.id || e.ecosystemKey} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-900">{e.label || e.ecosystemKey}</span>
                      <EcosystemBadge classification={e.classification} />
                    </div>
                    <div className="text-[11px] text-gray-500 mb-2">{e.ventureCount} venture{e.ventureCount === 1 ? '' : 's'}</div>
                    <EcosystemBars
                      healthScore={e.healthScore}
                      maturityScore={e.maturityScore}
                      momentumScore={e.momentumScore}
                    />
                  </div>
                ))}
              </div>
            )}
        </Section>

        {/* Venture trajectories */}
        <Section title={`Venture Trajectories (${trajectories.length})`} testId="section-trajectories">
          {trajectories.length === 0
            ? <p className="text-gray-400 text-sm">No trajectories yet — needs at least one prior snapshot.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="py-2">Venture</th>
                    <th className="py-2">Trajectory</th>
                    <th className="py-2 text-right">Conf Δ</th>
                    <th className="py-2 text-right">Score Δ</th>
                    <th className="py-2 text-right">Velocity</th>
                    <th className="py-2">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {trajectories.map((t) => (
                    <tr key={t.id || t.ventureIdeaId} className="border-b border-gray-50">
                      <td className="py-1.5 font-medium text-gray-800">#{t.ventureIdeaId}</td>
                      <td className="py-1.5"><TrajectoryBadge classification={t.classification} /></td>
                      <td className="py-1.5 text-right text-gray-600">
                        {t.confidenceDelta == null ? '—' : Number(t.confidenceDelta).toFixed(2)}
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {t.scoreDelta == null ? '—' : Number(t.scoreDelta).toFixed(1)}
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {t.lifecycleVelocity == null ? '—' : Number(t.lifecycleVelocity).toFixed(2)}/d
                      </td>
                      <td className="py-1.5 text-[11px] text-gray-500">{t.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Section>

        {/* Decision accuracy */}
        <Section title={`Decision Accuracy (${accuracy.length} decision types)`} testId="section-accuracy"
          right={<span className="text-[11px] text-gray-400">measure-only — never modifies scoring</span>}>
          {accuracy.length === 0
            ? <p className="text-gray-400 text-sm">No accuracy data yet — needs decisions + lifecycle history.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="py-2">Decision</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Progressed</th>
                    <th className="py-2 text-right">Stalled</th>
                    <th className="py-2 text-right">Reversed</th>
                    <th className="py-2 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {accuracy.map((a) => (
                    <tr key={a.id || a.decisionType} className="border-b border-gray-50">
                      <td className="py-1.5 font-medium text-gray-800">{a.decisionType}</td>
                      <td className="py-1.5 text-right text-gray-600">{a.totalCount}</td>
                      <td className="py-1.5 text-right text-emerald-700">{a.progressedCount}</td>
                      <td className="py-1.5 text-right text-gray-600">{a.stalledCount}</td>
                      <td className="py-1.5 text-right text-red-600">{a.reversedCount}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-800">
                        {a.accuracy == null ? '—' : `${Math.round(Number(a.accuracy) * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Section>

        {/* Predictive capacity */}
        <Section title="Predictive Capacity Forecast" testId="section-predictive">
          {!predictive || Object.keys(predictive).length === 0
            ? <p className="text-gray-400 text-sm">No forecasts yet.</p>
            : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {['h30', 'h90', 'h180'].map((k) => {
                  const horizon = predictive[k];
                  if (!horizon) return null;
                  const days = k.slice(1);
                  return (
                    <div key={k} className="border border-gray-200 rounded-lg p-3">
                      <div className="text-xs font-semibold text-gray-700 mb-2">{days}-day horizon</div>
                      {['optimistic', 'realistic', 'conservative'].map((s) => {
                        const row = horizon[s];
                        if (!row) return null;
                        return (
                          <div key={s} className="text-[11px] text-gray-600 mb-1">
                            <span className="capitalize font-medium">{s}:</span>{' '}
                            staffing {Math.round(Number(row.projectedStaffingPressure || 0))}
                            {' · '}queue {Math.round(Number(row.projectedQueuePressure || 0))}
                            {' · '}demand {Math.round(Number(row.projectedConcurrencyDemand || 0))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
        </Section>

        {/* Directional dependencies */}
        <Section title="Directional Dependencies + Critical Path" testId="section-directed">
          {!directed || directed.edges.length === 0
            ? <p className="text-gray-400 text-sm">No directional dependencies yet — they auto-propose from overlap pairs.</p>
            : (
              <>
                <div className="text-xs text-gray-500 mb-2">
                  <strong>Critical path:</strong>{' '}
                  {directed.critical_path && directed.critical_path.length > 0
                    ? directed.critical_path.map((n) => n.title || `#${n.venture_idea_id}`).join(' → ')
                    : '—'}
                </div>
                <ul className="text-xs space-y-1">
                  {directed.edges.slice(0, 12).map((e) => (
                    <li key={e.id} className="text-gray-700">
                      <span className="text-[11px] text-gray-400">[{e.dependencyType} · risk {Math.round(Number(e.cascadeRisk))}]</span>{' '}
                      <strong>{e.blocker_title || `#${e.blockerVentureId}`}</strong>
                      {' → '}
                      {e.blocked_title || `#${e.blockedVentureId}`}
                      <div className="text-[11px] text-gray-500 ml-1">{e.prerequisite}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
        </Section>

        {/* Drift alerts */}
        <Section
          title={`Strategic Drift Alerts (${drift.length})`}
          testId="section-drift"
          right={<span className="text-[11px] text-gray-400">recommendations only</span>}
        >
          {drift.length === 0
            ? <p className="text-gray-400 text-sm">No drift detected — portfolio is balanced.</p>
            : (
              <div className="space-y-2">
                {drift.map((a) => (
                  <DriftAlertRow key={a.id} alert={a} busy={busy}
                    onAck={() => handleAckDrift(a.id)}
                    onDismiss={() => handleDismissDrift(a.id)}
                  />
                ))}
              </div>
            )}
        </Section>

        {/* Historical signal timelines (sparklines) */}
        <Section title="Historical Signal Timelines" testId="section-signals">
          {Object.keys(timelines).length === 0
            ? <p className="text-gray-400 text-sm">No history captured yet — refresh the observatory to start the time series.</p>
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(timelines).map(([key, points]) => (
                  <div key={key} className="border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 capitalize mb-1">{key.replace(/_/g, ' ')}</div>
                    <Sparkline values={(points || []).map((p) => p.value)} />
                    <div className="text-[11px] text-gray-400 mt-1">{(points || []).length} samples</div>
                  </div>
                ))}
              </div>
            )}
        </Section>

        {/* Historical analytics */}
        <Section title="Historical Portfolio Analytics" testId="section-history">
          {!historical
            ? <p className="text-gray-400 text-sm">No history yet.</p>
            : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Venture velocity</div>
                  <p className="text-sm text-gray-700">
                    {historical.venture_velocity.total_transitions} transitions in {historical.venture_velocity.daily_series.length} day(s);{' '}
                    {historical.venture_velocity.distinct_ventures} ventures moved.
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Readiness aging</div>
                  <p className="text-sm text-gray-700">
                    Median assessment age {historical.readiness_aging.median_age_days || '0'} days;{' '}
                    {historical.readiness_aging.stale_count} stale (over {historical.readiness_aging.grace_days}d).
                  </p>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Capacity pressure timeline</div>
                  <Sparkline values={(historical.capacity_timeline || []).map((p) => p.staffing_pressure)} width={400} height={60} color="#dc2626" />
                  <div className="text-[11px] text-gray-400 mt-1">
                    {historical.capacity_timeline.length} snapshot(s) over {historical.period_days} days
                  </div>
                </div>
              </div>
            )}
        </Section>

        <p className="text-xs text-gray-400 text-center mt-2 mb-8">
          <Link to="/admin/deep-research/portfolio" className="text-blue-600 hover:underline">← Portfolio Intelligence</Link>
          {' · '}<Link to="/admin/deep-research/execution" className="text-blue-600 hover:underline">Execution</Link>
          {' · '}<Link to="/admin/deep-research" className="text-blue-600 hover:underline">Deep Research index</Link>
        </p>
      </div>
    </div>
  );
}

export default EcosystemObservatoryPage;
