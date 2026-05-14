import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

const TYPE_LINES = [
  { dataKey: 'gov_contract', name: 'Gov Contracts', color: '#3B82F6' },
  { dataKey: 'ai_job', name: 'AI Jobs', color: '#8B5CF6' },
  { dataKey: 'investment', name: 'Investments', color: '#10B981' },
  { dataKey: 'grant', name: 'Grants', color: '#F59E0B' },
  { dataKey: 'ai_news', name: 'AI News', color: '#06B6D4' },
  { dataKey: 'freelance', name: 'Freelance', color: '#22C55E' },
  // v9.4 unified-channels: Bonfire + Strategic Patterns join the chart.
  { dataKey: 'bonfire', name: 'Bonfire', color: '#EA580C' },
  { dataKey: 'bonfire_strategic', name: 'Strategic Patterns', color: '#A855F7' },
  // Research Intelligence Phase 1 — AI papers / benchmarks trend line.
  { dataKey: 'research', name: 'Research', color: '#6366F1' },
];

function OpportunityChart({ chartData, loading, onPeriodChange }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Opportunity Trends</h3>
        <select
          value={chartData?.period || '30d'}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500">
          Loading chart data...
        </div>
      ) : chartData?.dataPoints?.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData.dataPoints}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value, name) => [value, name]}
            />
            <Legend />
            {TYPE_LINES.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {chartData === null
            ? 'Chart data requires Premium subscription.'
            : 'No data available for the selected period.'}
        </div>
      )}
    </div>
  );
}

export default OpportunityChart;
