import React from 'react';

// Read-only renderer for the pipeline velocity payload from
// /api/v1/oied/velocity (also embedded in the revenue dashboard).
// Shows three stat cards (avg + median + p90 + sample size) for
// time_to_submit, time_to_response, time_to_win.

function VelocityCard({ label, hint, summary, testId }) {
  const has = summary && summary.count > 0;
  return (
    <div
      className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
      data-testid={testId}
    >
      <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">
        {label}
      </div>
      {has ? (
        <>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {summary.avg_days}d
            <span className="text-sm font-normal text-gray-500 ml-2">avg</span>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            median {summary.median_days}d · p90 {summary.p90_days}d
          </div>
          <div className="text-xs text-gray-500 mt-1">n={summary.count} · {hint}</div>
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-gray-400">—</div>
          <div className="text-xs text-gray-500 mt-1">no data yet</div>
          {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
        </>
      )}
    </div>
  );
}

function VelocityPanel({ velocity }) {
  if (!velocity) return null;
  return (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      data-testid="velocity-panel"
    >
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        ⚡ Pipeline Velocity
        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">
          OIED v6
        </span>
        <span className="text-xs text-gray-500">
          last {velocity.period?.window_days || 90} days
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <VelocityCard
          label="Time to submit"
          hint="generated → submitted"
          summary={velocity.time_to_submit}
          testId="velocity-time-to-submit"
        />
        <VelocityCard
          label="Time to response"
          hint="submitted → response"
          summary={velocity.time_to_response}
          testId="velocity-time-to-response"
        />
        <VelocityCard
          label="Time to win"
          hint="submitted → won"
          summary={velocity.time_to_win}
          testId="velocity-time-to-win"
        />
      </div>
    </div>
  );
}

export default VelocityPanel;
