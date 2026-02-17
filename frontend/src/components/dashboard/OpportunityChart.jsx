import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'gov_contract', label: 'Gov Contracts' },
  { value: 'ai_job', label: 'AI Jobs' },
  { value: 'investment', label: 'Investments' },
];

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

function OpportunityChart({ chartData, loading, onTypeChange, onPeriodChange }) {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <h3 className="text-lg font-semibold text-gray-900">Opportunity Trends</h3>
        <div className="flex gap-2">
          <select
            value={chartData?.type === 'all' ? '' : (chartData?.type || '')}
            onChange={(e) => onTypeChange(e.target.value || undefined)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={chartData?.period || '30d'}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-400">
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
              formatter={(value) => [value, 'Opportunities']}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#0f3460"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-400">
          {chartData === null
            ? 'Chart data requires Premium subscription.'
            : 'No data available for the selected period.'}
        </div>
      )}
    </div>
  );
}

export default OpportunityChart;
