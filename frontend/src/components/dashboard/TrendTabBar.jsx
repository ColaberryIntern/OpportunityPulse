import React, { useState } from 'react';
import TrendCard from './TrendCard';

// Pill-style trend tabs. Each pill is a clickable chip; one expanded at a
// time. Used in StrategicViewPage at multiple positions through the list
// (top + mid + bottom) so insights are sparsely interspersed instead of
// piled into one block at the bottom.

const TYPE_META = {
  gov_contract: { emoji: '\u{1F3DB}️', label: 'Gov Contracts' },
  ai_job:       { emoji: '\u{1F4BC}',        label: 'AI Jobs' },
  investment:   { emoji: '\u{1F4B0}',        label: 'Investments' },
  grant:        { emoji: '\u{1F393}',        label: 'Grants' },
  ai_news:      { emoji: '\u{1F4F0}',        label: 'AI News' },
  freelance:    { emoji: '\u{1F680}',        label: 'Freelance' },
};

function trendDirection(trendData) {
  if (!trendData || !trendData.trends || !trendData.trends.length) return null;
  const first = trendData.trends[0];
  const dir = (first && first.direction) || null;
  if (dir === 'up' || dir === 'emerging') return { icon: '\u{1F4C8}', tone: 'rising' };
  if (dir === 'down' || dir === 'declining') return { icon: '\u{1F4C9}', tone: 'falling' };
  return { icon: '➡️', tone: 'steady' };
}

function TrendTabBar({ trendTypes, trends, scope = 'top' }) {
  const [activeType, setActiveType] = useState(null);
  if (!trendTypes || !trendTypes.length) return null;

  // Visual differentiation between top/mid/bottom placements so the same
  // bar interspersed three times doesn't read as a duplicate.
  const labelByScope = {
    top: { tag: 'Insights', tone: 'text-blue-600 dark:text-blue-300' },
    mid: { tag: 'Patterns mid-stream', tone: 'text-purple-600 dark:text-purple-300' },
    bottom: { tag: 'Trends recap', tone: 'text-emerald-600 dark:text-emerald-300' },
  };
  const { tag, tone } = labelByScope[scope] || labelByScope.top;

  return (
    <section className="my-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[11px] uppercase tracking-wider font-semibold ${tone}`}>
          {tag}
        </span>
        <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
      </div>

      <div className="flex flex-wrap gap-2">
        {trendTypes.map((type) => {
          const meta = TYPE_META[type] || { emoji: '\u{1F4CA}', label: type };
          const trendData = trends && trends[type];
          const dir = trendDirection(trendData);
          const isActive = activeType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(isActive ? null : type)}
              className={
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition '
                + (isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-gray-700')
              }
              aria-pressed={isActive}
            >
              <span aria-hidden="true">{meta.emoji}</span>
              <span>{meta.label}</span>
              {dir && (
                <span
                  className={`text-xs ${isActive ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'}`}
                  aria-label={`trend ${dir.tone}`}
                >
                  {dir.icon}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeType && (
        <div className="mt-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 border border-blue-100 dark:border-gray-700 rounded-lg p-4">
          <TrendCard type={activeType} trendData={trends && trends[activeType]} variant="compact" />
        </div>
      )}
    </section>
  );
}

export default TrendTabBar;
