import React from 'react';

const SCORE_COLORS = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const DIRECTION_ICONS = {
  rising: '\u2191',
  stable: '\u2192',
  declining: '\u2193',
};

function TrendBadge({ score, direction = 'stable' }) {
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${SCORE_COLORS[level]}`}>
      <span>{DIRECTION_ICONS[direction] || '\u2192'}</span>
      <span>{score}</span>
    </span>
  );
}

export default TrendBadge;
