import React from 'react';

function FreelanceTrendBar({ trending, loading, onSkillClick, selectedSkill }) {
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
        const isSelected = selectedSkill === item.skill;
        const isRealTime = item.isRealTime;

        // Real-time data shows demand share %; snapshot data shows growth rate
        let bgColor, textColor, label;
        if (isSelected) {
          bgColor = 'bg-accent/20 dark:bg-accent/30 border-accent ring-1 ring-accent/50';
          textColor = 'text-accent dark:text-accent';
          label = isRealTime
            ? `${item.growthRate}% share`
            : `${item.growthRate > 0 ? '\u2191' : '\u2193'}${Math.abs(item.growthRate)}%`;
        } else if (isRealTime) {
          // Demand share: use blue tones to distinguish from growth arrows
          bgColor = 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
          textColor = 'text-blue-700 dark:text-blue-400';
          label = `${item.growthRate}% share`;
        } else {
          const isGrowing = item.growthRate > 0;
          bgColor = isGrowing
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
          textColor = isGrowing
            ? 'text-green-700 dark:text-green-400'
            : 'text-red-700 dark:text-red-400';
          label = `${isGrowing ? '\u2191' : '\u2193'}${Math.abs(item.growthRate)}%`;
        }

        return (
          <button
            key={item.skill}
            type="button"
            onClick={() => onSkillClick && onSkillClick(item.skill)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all
              ${bgColor} ${onSkillClick ? 'cursor-pointer hover:shadow-md hover:scale-105' : ''}`}
          >
            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 capitalize">
              {item.skill}
            </span>
            <span className={`text-xs font-bold ${textColor}`}>
              {label}
            </span>
            <span className="text-[10px] text-gray-400">({item.demandCount})</span>
          </button>
        );
      })}
    </div>
  );
}

export default FreelanceTrendBar;
