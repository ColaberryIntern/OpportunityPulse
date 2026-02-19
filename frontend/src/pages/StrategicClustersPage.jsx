import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchClusters } from '../store/slices/intelligenceSlice';

const SORT_OPTIONS = [
  { value: 'opportunity_count', label: 'Most Opportunities' },
  { value: 'growth_rate', label: 'Fastest Growing' },
  { value: 'avg_score', label: 'Highest AI Score' },
  { value: 'trend_velocity', label: 'Strongest Momentum' },
];

function TrendBadge({ direction, velocity }) {
  if (!direction && !velocity) return null;
  const isUp = direction === 'up' || velocity > 0;
  const isDown = direction === 'down' || velocity < 0;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isUp
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : isDown
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
      }`}
    >
      {isUp ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
      ) : isDown ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>
      )}
      {velocity != null ? `${velocity > 0 ? '+' : ''}${Number(velocity).toFixed(1)}%` : direction}
    </span>
  );
}

function ClusterCard({ cluster, onClick }) {
  const domainName = cluster.domain?.name || 'Unknown';
  const capabilityName = cluster.capability?.name || '';
  const intentName = cluster.intent?.name || '';

  return (
    <button
      onClick={onClick}
      className="text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md hover:border-accent/50 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary dark:text-gray-100 group-hover:text-accent transition-colors line-clamp-2">
          {cluster.name}
        </h3>
        <TrendBadge velocity={cluster.growthRate} />
      </div>

      {cluster.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{cluster.description}</p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {domainName && (
          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs rounded-full">{domainName}</span>
        )}
        {capabilityName && (
          <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs rounded-full">{capabilityName}</span>
        )}
        {intentName && (
          <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs rounded-full">{intentName}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center border-t border-gray-100 dark:border-gray-700 pt-3">
        <div>
          <p className="text-lg font-bold text-primary dark:text-gray-100">{cluster.opportunityCount || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Opportunities</p>
        </div>
        <div>
          <p className="text-lg font-bold text-primary dark:text-gray-100">{cluster.avgAiScore != null ? Number(cluster.avgAiScore).toFixed(0) : '--'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Score</p>
        </div>
        <div>
          <p className="text-lg font-bold text-primary dark:text-gray-100">
            {cluster.trendVelocity != null ? `${Number(cluster.trendVelocity).toFixed(1)}` : '--'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Momentum</p>
        </div>
      </div>
    </button>
  );
}

function StrategicClustersPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { clusters, clustersLoading, error } = useSelector((state) => state.intelligence);
  const [sortBy, setSortBy] = useState('opportunity_count');

  useEffect(() => {
    dispatch(fetchClusters());
  }, [dispatch]);

  const sortedClusters = [...clusters].sort((a, b) => {
    switch (sortBy) {
      case 'growth_rate':
        return (b.growthRate || 0) - (a.growthRate || 0);
      case 'avg_score':
        return (b.avgAiScore || 0) - (a.avgAiScore || 0);
      case 'trend_velocity':
        return (b.trendVelocity || 0) - (a.trendVelocity || 0);
      default:
        return (b.opportunityCount || 0) - (a.opportunityCount || 0);
    }
  });

  const handleClusterClick = (cluster) => {
    navigate(`/opportunities?cluster=${cluster.id}`);
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary dark:text-gray-100">Strategic Clusters</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Auto-detected opportunity clusters across AI domains, capabilities, and strategic intents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="cluster-sort" className="text-sm text-gray-500 dark:text-gray-400">Sort by:</label>
            <select
              id="cluster-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {clustersLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" />
          </div>
        ) : sortedClusters.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <p className="font-medium">No clusters detected yet</p>
            <p className="text-sm mt-1">Clusters are auto-detected when enough opportunities share similar domains, capabilities, and intents.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedClusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} onClick={() => handleClusterClick(cluster)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StrategicClustersPage;
