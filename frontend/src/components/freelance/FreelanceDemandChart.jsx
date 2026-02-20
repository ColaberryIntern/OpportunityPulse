import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const SKILL_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4'];

function FreelanceDemandChart({ trending, loading }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (!trending || trending.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Demand Trends</h3>
        <p className="text-xs text-gray-500">No trend data available yet. Data will appear after the first trend snapshot runs.</p>
      </div>
    );
  }

  // Build chart data from top 5 trending skills
  const top5 = trending.slice(0, 5);

  // For a simple bar-like view, use the trending data directly
  const chartData = top5.map((item) => ({
    skill: item.skill,
    demand: item.demandCount,
    avgBudget: parseFloat(item.avgBudget) || 0,
    growth: item.growthRate,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Top Skills by Demand</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
          <XAxis
            dataKey="skill"
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '12px',
              color: '#F3F4F6',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Line
            type="monotone"
            dataKey="demand"
            name="Demand Count"
            stroke={SKILL_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: SKILL_COLORS[0] }}
          />
          <Line
            type="monotone"
            dataKey="growth"
            name="Growth %"
            stroke={SKILL_COLORS[1]}
            strokeWidth={2}
            dot={{ r: 3, fill: SKILL_COLORS[1] }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default FreelanceDemandChart;
