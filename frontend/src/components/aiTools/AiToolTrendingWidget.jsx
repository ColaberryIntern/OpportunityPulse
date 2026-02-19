import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import aiToolService from '../../services/aiToolService';
import TrendBadge from './TrendBadge';

function AiToolTrendingWidget() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    aiToolService.getTrending({ limit: 5 })
      .then((res) => {
        setTools(res.data?.data?.tools || []);
      })
      .catch(() => {
        setError('Failed to load trending tools');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-5 w-40" />
          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-16" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700" />
                <div>
                  <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                  <div className="h-2 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
              <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || tools.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Trending AI Tools</h2>
          <Link to="/ai-tools" className="text-sm text-accent hover:underline">View All</Link>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {error || 'No trending tools data available yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Trending AI Tools</h2>
        <Link to="/ai-tools" className="text-sm text-accent hover:underline">View All</Link>
      </div>
      <div className="space-y-3">
        {tools.map((tool, index) => (
          <Link
            key={tool.id || index}
            to={`/ai-tools/${tool.slug}`}
            className="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 rounded-lg p-2 -mx-2 transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-accent to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {tool.name?.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {tool.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {tool.vendor} &middot; {tool.category}
                </p>
              </div>
            </div>
            <TrendBadge score={Math.round(tool.trendingScore || 0)} direction={tool.trendDirection} />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default AiToolTrendingWidget;
