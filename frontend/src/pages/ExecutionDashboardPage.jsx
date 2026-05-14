import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getExecutionQueue, getOpportunityPipeline } from '../services/deepResearchService';
import {
  LifecycleBadge, DecisionBadge, LIFECYCLE_META,
} from '../components/deepResearch/ExecutionVisuals';
import { RecommendationBadge } from '../components/deepResearch/IntelVisuals';

// Deep Research Phase 3 — Execution Intelligence Dashboard.
//
// /admin/deep-research/execution — the venture operations center. Two
// surfaces: the opportunity pipeline (ventures grouped by lifecycle stage,
// the visual flow) and the priority-sorted execution queue.

function PriorityBar({ score }) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  const color = v >= 65 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-gray-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600">{Math.round(v)}</span>
    </div>
  );
}

// The pipeline flow — every lifecycle stage as a column with its ventures.
function PipelineFlow({ stages }) {
  // Hide empty terminal noise: always show the core flow, plus any stage
  // that actually has ventures.
  const coreFlow = ['discovered', 'researching', 'evaluating', 'approved',
    'generating_requirements', 'planning_mvp', 'building', 'validating', 'launching', 'monitoring'];
  const visible = (stages || []).filter(
    (s) => coreFlow.includes(s.state) || s.ventures.length > 0,
  );
  return (
    <div className="overflow-x-auto pb-2" data-testid="pipeline-flow">
      <div className="flex gap-2 min-w-max">
        {visible.map((s) => (
          <div key={s.state} className="w-44 shrink-0 bg-gray-50 border border-gray-200 rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                (LIFECYCLE_META[s.state] || {}).cls || 'bg-gray-100 text-gray-500'}`}>
                {(LIFECYCLE_META[s.state] || {}).label || s.state}
              </span>
              <span className="text-[10px] text-gray-400">{s.ventures.length}</span>
            </div>
            <div className="space-y-1.5">
              {s.ventures.length === 0 && (
                <p className="text-[11px] text-gray-300 italic">empty</p>
              )}
              {s.ventures.slice(0, 6).map((v) => (
                <Link
                  key={v.venture_idea_id}
                  to={`/admin/deep-research/${v.report_id}`}
                  className="block bg-white border border-gray-200 rounded p-1.5 hover:border-indigo-300"
                >
                  <div className="text-[11px] font-medium text-gray-800 line-clamp-2 leading-snug">
                    {v.title}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {v.composite_score != null && (
                      <span className="text-[10px] text-gray-500">{Math.round(v.composite_score)}</span>
                    )}
                    {v.recommendation_level && <RecommendationBadge level={v.recommendation_level} />}
                  </div>
                </Link>
              ))}
              {s.ventures.length > 6 && (
                <p className="text-[10px] text-gray-400">+{s.ventures.length - 6} more</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutionDashboardPage() {
  const [queue, setQueue] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [q, p] = await Promise.all([getExecutionQueue(), getOpportunityPipeline()]);
      setQueue(q.items || []);
      setPipeline(p.stages || []);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load execution dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalVentures = pipeline.reduce((s, x) => s + x.ventures.length, 0);
  const buildNow = queue.filter((i) => i.decision === 'BUILD_NOW').length;
  const inProgress = queue.filter(
    (i) => ['building', 'validating', 'launching', 'planning_mvp', 'generating_requirements'].includes(i.lifecycleState),
  ).length;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🚀 Execution Intelligence
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-medium">
              Venture Operations Center
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Which ventures are ready to build, which are in progress, and what's blocking them.
            Assess + plan from each venture's report page.
          </p>
        </header>

        {err && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{err}</div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Ventures in pipeline', value: totalVentures },
            { label: 'Build Now', value: buildNow },
            { label: 'In progress', value: inProgress },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Opportunity pipeline flow */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Opportunity Pipeline — Research → Intelligence → Scoring → Execution → Launch
          </h2>
          {loading ? <p className="text-sm text-gray-400">Loading…</p>
            : <PipelineFlow stages={pipeline} />}
        </div>

        {/* Execution queue */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
            Execution queue — {queue.length} venture{queue.length === 1 ? '' : 's'}, priority-sorted
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2">Venture</th>
                <th className="px-3 py-2">Lifecycle</th>
                <th className="px-3 py-2">Decision</th>
                <th className="px-3 py-2 text-right">Composite</th>
                <th className="px-3 py-2 text-right">Exec. Readiness</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Blockers</th>
                <th className="px-3 py-2">Owner</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No ventures in the execution queue yet — assess a venture from its report page.
                </td></tr>
              )}
              {queue.map((i) => (
                <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50" data-testid={`queue-row-${i.id}`}>
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/deep-research/${i.report_id}`} className="font-medium text-gray-900 hover:text-blue-700">
                      {i.venture_title || `Venture #${i.venture_idea_id}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5"><LifecycleBadge state={i.lifecycleState} /></td>
                  <td className="px-3 py-2.5"><DecisionBadge decision={i.decision} /></td>
                  <td className="px-3 py-2.5 text-right text-gray-600">
                    {i.composite_score != null ? Math.round(i.composite_score) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600">
                    {i.execution_readiness_score != null ? Math.round(i.execution_readiness_score) : '—'}
                  </td>
                  <td className="px-3 py-2.5"><PriorityBar score={i.priorityScore} /></td>
                  <td className="px-3 py-2.5">
                    {Array.isArray(i.blockers) && i.blockers.length
                      ? <span className="text-xs text-amber-700" title={i.blockers.join(' · ')}>
                        {i.blockers.length} blocker{i.blockers.length === 1 ? '' : 's'}
                      </span>
                      : <span className="text-xs text-emerald-600">clear</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{i.owner || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ExecutionDashboardPage;
