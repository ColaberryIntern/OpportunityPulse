import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';

const SKILL_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4'];

function FreelanceDemandChart({ trending, loading, selectedSkill, skillTrend, skillTrendLoading, onClearSkill }) {
  if (loading || skillTrendLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  // Selected skill time-series view
  if (selectedSkill && skillTrend) {
    const trendData = skillTrend.trend || [];

    if (trendData.length === 0) {
      return (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">
              {selectedSkill} — Trend Over Time
            </h3>
            <button
              onClick={onClearSkill}
              className="text-xs text-accent hover:underline"
            >
              Back to overview
            </button>
          </div>
          <p className="text-xs text-gray-500">No trend history for this skill yet. Data will accumulate over time.</p>
        </div>
      );
    }

    const chartData = trendData.map((d) => ({
      date: d.date.slice(5), // "MM-DD" format
      fullDate: d.date,
      demand: d.demandCount,
      avgBudget: d.avgBudget ? Math.round(d.avgBudget) : 0,
    }));

    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">
            {selectedSkill} — Trend Over Time
          </h3>
          <button
            onClick={onClearSkill}
            className="text-xs text-accent hover:underline"
          >
            Back to overview
          </button>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="demandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SKILL_COLORS[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SKILL_COLORS[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
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
              labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="demand"
              name="Demand Count"
              stroke={SKILL_COLORS[0]}
              fill="url(#demandGradient)"
              strokeWidth={2}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="avgBudget"
              name="Avg Budget ($)"
              stroke={SKILL_COLORS[2]}
              strokeWidth={2}
              dot={{ r: 3, fill: SKILL_COLORS[2] }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: Top Skills overview
  if (!trending || trending.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Demand Trends</h3>
        <p className="text-xs text-gray-500">No trend data available yet. Data will appear after the first trend snapshot runs.</p>
      </div>
    );
  }

  const top5 = trending.slice(0, 5);
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
