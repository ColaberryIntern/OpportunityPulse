import React from 'react';

const PLATFORM_COLORS = {
  upwork: 'bg-green-600',
  freelancer: 'bg-blue-600',
  linkedin: 'bg-sky-700',
  default: 'bg-gray-600',
};

function formatBudget(value) {
  if (!value || value === 0) return 'Not specified';
  const num = parseFloat(value);
  if (num >= 1000) return `$${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}K`;
  return `$${num.toLocaleString()}`;
}

function scoreColor(score) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-gray-400';
}

function competitionColor(count) {
  if (count < 10) return 'text-green-600';
  if (count <= 30) return 'text-yellow-600';
  return 'text-red-600';
}

function FreelanceCard({ opportunity, onAction }) {
  const sourceData = opportunity.sourceData || {};
  const aiAnalysis = opportunity.aiAnalysis || {};
  const platform = sourceData.platform || opportunity.source || 'unknown';
  const score = parseFloat(opportunity.aiScore) || 0;
  const proposals = sourceData.proposals || sourceData.bid_count || 0;
  const skills = aiAnalysis.skills || opportunity.tags || [];
  const complexity = aiAnalysis.complexity || null;

  const platformColor = PLATFORM_COLORS[platform] || PLATFORM_COLORS.default;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 flex-1">
          {opportunity.title}
        </h3>
        <span className={`text-[10px] font-medium text-white px-1.5 py-0.5 rounded ${platformColor} shrink-0`}>
          {platform}
        </span>
      </div>

      {/* Budget + Score Row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-green-600 dark:text-green-400">
          {formatBudget(opportunity.value || sourceData.budget)}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${scoreColor(score)}`}
              style={{ width: `${Math.min(100, score)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{score}</span>
        </div>
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skills.slice(0, 5).map((skill) => (
            <span key={skill} className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
              {skill}
            </span>
          ))}
          {skills.length > 5 && (
            <span className="text-[10px] text-gray-400">+{skills.length - 5}</span>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        {proposals > 0 && (
          <span className={competitionColor(proposals)}>
            {proposals} {proposals === 1 ? 'proposal' : 'proposals'}
          </span>
        )}
        {complexity && (
          <span className="capitalize">{complexity}</span>
        )}
        {aiAnalysis.projectType && (
          <span className="capitalize">{aiAnalysis.projectType.replace('-', ' ')}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
        {['PROPOSAL', 'ARCHITECTURE', 'SOW', 'SAAS_IDEA', 'OUTREACH'].map((action) => (
          <button
            key={action}
            onClick={() => onAction(opportunity.id, action)}
            className="text-[10px] font-medium px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition"
          >
            {action === 'SAAS_IDEA' ? 'SaaS Idea' : action.charAt(0) + action.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export default FreelanceCard;
