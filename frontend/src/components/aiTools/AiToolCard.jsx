import React from 'react';
import { Link } from 'react-router-dom';
import TrendBadge from './TrendBadge';

const CATEGORY_COLORS = {
  'LLM': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Image Generation': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Code Assistant': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'Audio/Speech': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  'Video': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Analytics': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  'Automation': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'Search': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  'Writing': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Design': 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  'Data Science': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

function AiToolCard({ tool }) {
  const catColor = CATEGORY_COLORS[tool.category] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  const description = tool.description ? (tool.description.length > 120 ? tool.description.substring(0, 120) + '...' : tool.description) : '';

  return (
    <Link
      to={`/ai-tools/${tool.slug}`}
      className="block bg-white dark:bg-gray-800 shadow rounded-lg p-5 hover:shadow-md transition"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {tool.logoUrl ? (
            <img src={tool.logoUrl} alt="" className="w-8 h-8 rounded" />
          ) : (
            <div className="w-8 h-8 rounded bg-gradient-to-br from-accent to-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {tool.name?.charAt(0) || '?'}
            </div>
          )}
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {tool.name}
          </h3>
        </div>
        <TrendBadge score={Math.round(tool.trendingScore || 0)} direction={tool.trendDirection} />
      </div>

      {/* Meta line */}
      <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
        {tool.vendor && <span>{tool.vendor}</span>}
        {tool.vendor && tool.category && <span>&middot;</span>}
        {tool.category && (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${catColor}`}>
            {tool.category}
          </span>
        )}
        {tool.pricingTier && (
          <>
            <span>&middot;</span>
            <span className="capitalize">{tool.pricingTier}</span>
          </>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {description}
        </p>
      )}

      {/* Industry tags */}
      {tool.industries && tool.industries.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tool.industries.slice(0, 4).map((ind) => (
            <span
              key={ind}
              className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs"
            >
              {ind}
            </span>
          ))}
          {tool.industries.length > 4 && (
            <span className="px-1.5 py-0.5 text-gray-500 text-xs">+{tool.industries.length - 4}</span>
          )}
        </div>
      )}

      {/* Update info */}
      {tool.lastMajorUpdateSummary && (
        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 truncate">
          Latest: {tool.lastMajorUpdateSummary}
        </div>
      )}

      {/* AI Analysis insight */}
      {tool.aiAnalysis?.whyTrending && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic truncate">
          {tool.aiAnalysis.whyTrending}
        </div>
      )}
    </Link>
  );
}

export default AiToolCard;
