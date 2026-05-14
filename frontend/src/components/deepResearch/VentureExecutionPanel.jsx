import React, { useCallback, useEffect, useState } from 'react';
import {
  getVentureExecution, assessVenture, planVentureMvp, transitionVentureLifecycle,
} from '../../services/deepResearchService';
import {
  LifecycleBadge, DecisionBadge, DeploymentLevelBadge, ReadinessGauge,
  LifecycleTracker, ReadinessSubScores, TimelineChip, StaffingChip, LIFECYCLE_META,
} from './ExecutionVisuals';

// Deep Research Phase 3 — the execution intelligence panel for one venture.
//
// Lazy: renders collapsed on the report page; expanding it fetches the full
// execution picture (lifecycle, readiness, decision, MVP plan, launch
// strategy, deployment readiness). Hosts the human-in-the-loop actions:
// assess, plan MVP, and lifecycle transitions. Nothing here auto-executes.

function Field({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-700">{children}</dd>
    </div>
  );
}

function List({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
      {items.map((x) => <li key={x}>{x}</li>)}
    </ul>
  );
}

function VentureExecutionPanel({ ventureIdea }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'assess' | 'mvp' | 'transition'
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await getVentureExecution(ventureIdea.id));
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load execution intelligence');
    } finally {
      setLoading(false);
    }
  }, [ventureIdea.id]);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  async function handleAssess() {
    setBusy('assess');
    setErr(null);
    try { await assessVenture(ventureIdea.id); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Assessment failed'); }
    finally { setBusy(null); }
  }
  async function handlePlanMvp() {
    setBusy('mvp');
    setErr(null);
    try { await planVentureMvp(ventureIdea.id); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'MVP planning failed'); }
    finally { setBusy(null); }
  }
  async function handleTransition(toState) {
    setBusy('transition');
    setErr(null);
    try { await transitionVentureLifecycle(ventureIdea.id, toState); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Transition failed'); }
    finally { setBusy(null); }
  }

  const lifecycleState = (data && data.lifecycle && data.lifecycle.current_state)
    || ventureIdea.lifecycleState || 'discovered';

  return (
    <div className="mt-3 border-t border-gray-100 pt-3" data-testid={`venture-execution-${ventureIdea.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
      >
        <span>{open ? '▾' : '▸'}</span>
        Execution Intelligence
        <LifecycleBadge state={lifecycleState} />
      </button>

      {open && (
        <div className="mt-3">
          {err && <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
          {loading && <p className="text-sm text-gray-400">Loading…</p>}

          {data && (
            <div className="space-y-4">
              {/* Lifecycle */}
              <div>
                <LifecycleTracker currentState={lifecycleState} />
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-gray-400">Move to:</span>
                  {(data.lifecycle.allowed_transitions || []).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleTransition(s)}
                      disabled={busy != null}
                      className="text-[11px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      {(LIFECYCLE_META[s] || {}).label || s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button" onClick={handleAssess} disabled={busy != null}
                  className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                  data-testid={`assess-${ventureIdea.id}`}
                >
                  {busy === 'assess' ? 'Assessing…' : 'Assess Execution'}
                </button>
                <button
                  type="button" onClick={handlePlanMvp} disabled={busy != null}
                  className="px-3 py-1.5 rounded bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
                  data-testid={`plan-mvp-${ventureIdea.id}`}
                >
                  {busy === 'mvp' ? 'Planning…' : 'Plan MVP'}
                </button>
              </div>

              {/* Execution readiness + decision */}
              {data.execution_readiness && (
                <div className="bg-gray-50 rounded-lg p-3 flex items-start gap-4">
                  <ReadinessGauge value={data.execution_readiness.executionReadinessScore} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      {data.decision && <DecisionBadge decision={data.decision.decision} />}
                      <TimelineChip weeks={data.execution_readiness.mvpTimelineWeeks} />
                      <StaffingChip staffing={data.execution_readiness.staffing} />
                    </div>
                    {data.decision && <p className="text-xs text-gray-600 mb-2">{data.decision.rationale}</p>}
                    <ReadinessSubScores scores={{
                      technical_complexity: data.execution_readiness.technicalComplexity,
                      ai_dependency_risk: data.execution_readiness.aiDependencyRisk,
                      market_readiness: data.execution_readiness.marketReadiness,
                      operational_readiness: data.execution_readiness.operationalReadiness,
                    }}
                    />
                  </div>
                </div>
              )}

              {/* MVP plan */}
              {data.mvp_plan && (
                <div className="border border-gray-200 rounded-lg p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    MVP Plan {data.mvp_plan.estimatedTimelineWeeks ? `· ~${data.mvp_plan.estimatedTimelineWeeks} weeks` : ''}
                  </h4>
                  <dl className="space-y-2">
                    <Field label="MVP Scope">{data.mvp_plan.mvpScope}</Field>
                    <Field label="Phase 1 Features"><List items={data.mvp_plan.phase1Features} /></Field>
                    <Field label="Fast-Launch Subset"><List items={data.mvp_plan.fastLaunchFeatures} /></Field>
                    <Field label="Suggested Stack">
                      {(data.mvp_plan.suggestedStack || []).join(' · ')}
                    </Field>
                    <Field label="Recommended AI Components">
                      {(data.mvp_plan.recommendedAiComponents || []).join(' · ')}
                    </Field>
                    <Field label="Future Roadmap"><List items={data.mvp_plan.futureRoadmap} /></Field>
                  </dl>
                </div>
              )}

              {/* Launch strategy */}
              {data.launch_strategy && (
                <div className="border border-gray-200 rounded-lg p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Launch Strategy</h4>
                  <dl className="space-y-2">
                    <Field label="ICP">{data.launch_strategy.icp}</Field>
                    <Field label="Go-to-Market">{data.launch_strategy.gtm}</Field>
                    <Field label="Channels">{(data.launch_strategy.channels || []).join(' · ')}</Field>
                    <Field label="Pricing Strategy">{data.launch_strategy.pricingStrategy}</Field>
                    <Field label="Pilot Strategy">{data.launch_strategy.pilotStrategy}</Field>
                    <Field label="Enterprise">{data.launch_strategy.enterpriseStrategy}</Field>
                    <Field label="Government">{data.launch_strategy.govStrategy}</Field>
                  </dl>
                </div>
              )}

              {/* Deployment readiness */}
              {data.deployment_readiness && (
                <div className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Deployment Readiness
                    </h4>
                    <DeploymentLevelBadge level={data.deployment_readiness.readinessLevel} />
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{data.deployment_readiness.rationale}</p>
                  <ReadinessSubScores scores={{
                    requirements_completeness: data.deployment_readiness.requirementsCompleteness,
                    architecture_quality: data.deployment_readiness.architectureQuality,
                    ai_dependency_safety: data.deployment_readiness.aiDependencyRisk,
                    infrastructure_readiness: data.deployment_readiness.infrastructureReadiness,
                    compliance_exposure: data.deployment_readiness.complianceExposure,
                  }}
                  />
                </div>
              )}

              {!data.execution_readiness && !loading && (
                <p className="text-xs text-gray-400">
                  Not assessed yet — click <strong>Assess Execution</strong> to run the deterministic
                  readiness + decision engines.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VentureExecutionPanel;
