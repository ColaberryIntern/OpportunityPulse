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

function ToolSpotlight() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aiToolService
      .getMomentum({ limit: 10 })
      .then((res) => {
        setTools(res.data?.data?.tools || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 shadow rounded-lg p-6 mb-6 animate-pulse">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (tools.length === 0) return null;

  // Deterministic daily rotation
  const dayIndex = Math.floor(Date.now() / 86400000) % tools.length;
  const tool = tools[dayIndex];
  const score = Math.round(parseFloat(tool.compositeMomentumScore) || 0);
  const stage = tool.momentumStage || 'emerging';

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Tool Spotlight</h2>
      <Link
        to={`/ai-tools/${tool.slug}`}
        className="block bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-750 shadow rounded-lg p-5 hover:shadow-md transition"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-accent to-blue-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {tool.name?.charAt(0) || '?'}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{tool.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">{tool.category}</span>
                {tool.capability?.name && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <span className="text-xs text-gray-400">{tool.capability.name}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {parseFloat(tool.fundingScore) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Funding detected
                  </span>
                )}
                {parseFloat(tool.enterpriseSignalScore) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
                    </svg>
                    Enterprise adoption
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{score}</span>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Momentum</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold ${STAGE_COLORS[stage]}`}>
              {stage}
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}

export default ToolSpotlight;
