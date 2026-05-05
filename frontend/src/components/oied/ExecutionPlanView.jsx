import React from 'react';

// Read-only renderer for an execution plan (tasks + timeline + agents).
// Expects a plan shape like:
//   { tasks: [{title, assigned_agent, estimated_days, start_offset_days}],
//     timeline: { total_weeks, total_days, start_date, end_date },
//     assigned_agents: [...], status: 'draft'|'in_progress'|... }
function ExecutionPlanView({ plan }) {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) return null;
  const inProgress = plan.status === 'in_progress';
  const status = (plan.status || 'draft').toUpperCase();

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
        </h4>
        <span className="text-xs text-emerald-700 dark:text-emerald-300">
          {plan.timeline?.total_weeks
            ? `${plan.timeline.total_weeks}w (${plan.timeline.start_date} → ${plan.timeline.end_date})`
            : ''}
        </span>
      </div>

      {Array.isArray(plan.assignedAgents || plan.assigned_agents) && (
        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          <span className="font-medium">Team: </span>
          {(plan.assignedAgents || plan.assigned_agents).join(', ')}
        </p>
      )}

      <ol className="text-sm space-y-1 mt-2" data-testid="execution-plan-tasks">
        {plan.tasks.map((t, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2 text-gray-800 dark:text-gray-200"
            data-testid="execution-plan-task"
          >
            <span className="font-mono text-xs text-emerald-700 dark:text-emerald-300 shrink-0 w-12">
              d{t.start_offset_days}
            </span>
            <span className="flex-1">
              {t.title}
              <span className="text-xs text-gray-500 ml-2">
                · {t.assigned_agent} · {t.estimated_days}d
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default ExecutionPlanView;
