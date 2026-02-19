import React, { useEffect, useState } from 'react';
import { fetchRecommendations } from '../../services/recommendationService';
import { useAdaptiveTracking } from '../../hooks/useAdaptiveTracking';

function RecommendationsList() {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { trackRecommendationClick } = useAdaptiveTracking();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchRecommendations(10);
        if (!cancelled) {
          setRecommendations(data.data?.recommendations || []);
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load recommendations.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">AI Recommendations</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">AI Recommendations</h3>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">AI Recommendations</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">No recommendations available yet. Opportunities will appear here once data is ingested.</p>
      </div>
    );
  }

  const typeColors = {
    gov_contract: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800',
    ai_job: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800',
    investment: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  };

  const typeLabels = {
    gov_contract: 'Contract',
    ai_job: 'AI Job',
    investment: 'Investment',
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Recommendations</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">Top matches for you</span>
      </div>
      <div className="space-y-3">
        {recommendations.map((opp) => (
          <div
            key={opp.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-primary/30 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[opp.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                  {typeLabels[opp.type] || opp.type}
                </span>
                {opp.aiScore && (
                  <span className="text-xs text-highlight font-semibold">
                    Score: {parseFloat(opp.aiScore).toFixed(0)}
                  </span>
                )}
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{opp.title}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                {opp.description?.substring(0, 120)}{opp.description?.length > 120 ? '...' : ''}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500">
                {opp.location && <span>{opp.location}</span>}
                {opp.value && <span>${Number(opp.value).toLocaleString()}</span>}
              </div>
            </div>
            {opp.sourceUrl && (
              <a
                href={opp.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline whitespace-nowrap"
                onClick={() => trackRecommendationClick(opp.id, opp.type)}
              >
                View
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecommendationsList;
