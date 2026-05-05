import React from 'react';

// Read-only renderer for an execution plan (tasks + timeline + agents).
// v6: tasks are grouped by parallel_group (waves) and a parallel_efficiency
// badge appears on the timeline header.
function ExecutionPlanView({ plan }) {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) return null;
  const inProgress = plan.status === 'in_progress';
  const status = (plan.status || 'draft').toUpperCase();

  // v6: bucket tasks by parallel_group (fall back to a single wave for
  // legacy plans created before v6).
  const waves = new Map();
  for (const t of plan.tasks) {
    const g = t.parallel_group != null ? t.parallel_group : 0;
    if (!waves.has(g)) waves.set(g, []);
    waves.get(g).push(t);
  }
  const sortedWaveIds = [...waves.keys()].sort((a, b) => a - b);

  return (
    <div
      className="mt-2 p-3 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
      data-testid="bundle-execution-plan"
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          🚀 Execution Plan
          <span className={`ml-2 text-xs px-2 py-0.5 rounded font-mono ${
            inProgress
              ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-700/40 dark:text-emerald-100'
              : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
          }`}>{status}</span>
          {plan.timeline?.parallel_efficiency > 1 && (
            <span
              className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-200 text-blue-900 dark:bg-blue-800/40 dark:text-blue-200 font-mono"
              data-testid="parallel-efficiency-badge"
            >
              {plan.timeline.parallel_efficiency}× parallel
            </span>
          )}
        </h4>
        <span className="text-xs text-emerald-700 dark:text-emerald-300">
          {plan.timeline?.total_weeks
            ? `${plan.timeline.total_days || plan.timeline.total_weeks * 7}d (${plan.timeline.start_date} → ${plan.timeline.end_date})`
            : ''}
        </span>
      </div>

      {Array.isArray(plan.assignedAgents || plan.assigned_agents) && (
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          <span className="font-medium">Team: </span>
          {(plan.assignedAgents || plan.assigned_agents).join(', ')}
        </p>
      )}

      <div className="mt-2 space-y-3" data-testid="execution-plan-waves">
        {sortedWaveIds.map((wid) => {
          const inWave = waves.get(wid);
          const startOffset = inWave[0]?.start_offset_days || 0;
          const longest = Math.max(...inWave.map((t) => t.estimated_days || 0));
          return (
            <div key={wid} data-testid={`execution-plan-wave-${wid}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">
                  Wave {wid + 1}
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  d{startOffset} → d{startOffset + longest}
                  {inWave.length > 1 && ` · ${inWave.length} parallel`}
                </span>
              </div>
              <ol className="text-sm space-y-1" data-testid="execution-plan-tasks">
                {inWave.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-baseline gap-2 text-gray-800 dark:text-gray-200 pl-3 border-l-2 border-emerald-200 dark:border-emerald-800"
                    data-testid="execution-plan-task"
                  >
                    <span className="font-mono text-xs text-emerald-700 dark:text-emerald-300 shrink-0 w-12">
                      d{t.start_offset_days}
                    </span>
                    <span className="flex-1">
                      {t.title}
                      <span className="text-xs text-gray-500 ml-2">
                        · {t.assigned_agent} · {t.estimated_days}d
                        {t.complexity != null && ` · w=${t.complexity}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ExecutionPlanView;
