import React from 'react';

function FreelanceTrendBar({ trending, loading }) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2 pb-2 mb-4 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded-full" />
        ))}
      </div>
    );
  }

  if (!trending || trending.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pb-2 mb-4">
      {trending.map((item) => {
        const isGrowing = item.growthRate > 0;
        const bgColor = isGrowing
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
        const textColor = isGrowing
          ? 'text-green-700 dark:text-green-400'
          : 'text-red-700 dark:text-red-400';
        const arrow = isGrowing ? '\u2191' : '\u2193';

        return (
          <div
            key={item.skill}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${bgColor}`}
          >
            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 capitalize">
              {item.skill}
            </span>
            <span className={`text-xs font-bold ${textColor}`}>
              {arrow}{Math.abs(item.growthRate)}%
            </span>
            <span className="text-[10px] text-gray-400">({item.demandCount})</span>
          </div>
        );
      })}
    </div>
  );
}

export default FreelanceTrendBar;
