import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import aiToolService from '../../services/aiToolService';

const STAGE_COLORS = {
  explosive: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  dominant: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  accelerating: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  emerging: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  declining: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
};

function ToolMomentumBoard() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    aiToolService.getMomentum({ limit: 5 })
      .then((res) => {
        setTools(res.data?.data?.tools || []);
      })
      .catch(() => {
        setError('Failed to load momentum data');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-5 w-48" />
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
              <div className="h-6 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tool Momentum</h2>
          <Link to="/ai-tools" className="text-sm text-accent hover:underline">View All</Link>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {error || 'No momentum data available yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tool Momentum</h2>
        <Link to="/ai-tools" className="text-sm text-accent hover:underline">View All</Link>
      </div>
      <div className="space-y-3">
        {tools.map((tool, index) => {
          const score = Math.round(parseFloat(tool.compositeMomentumScore) || 0);
          const stage = tool.momentumStage || 'emerging';
          return (
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{tool.category}</span>
                    {tool.capability && (
                      <span className="text-xs text-gray-400">{tool.capability.name}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {parseFloat(tool.fundingScore) > 0 && (
                  <span className="text-xs text-green-600" title="Funding detected">$</span>
                )}
                {parseFloat(tool.enterpriseSignalScore) > 0 && (
                  <svg className="w-3 h-3 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" title="Enterprise adoption">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
                  </svg>
                )}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STAGE_COLORS[stage]}`}>
                  {stage}
                </span>
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100 w-8 text-right">
                  {score}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default ToolMomentumBoard;
