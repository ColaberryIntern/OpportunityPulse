import React, { useState, useEffect } from 'react';
import api from '../../services/api';

function RssIntelligenceWidget() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/opportunities', { params: { limit: 1 } })
      .then(() => {
        // Fetch enriched signal counts from the dashboard stats
        return api.get('/dashboard/stats');
      })
      .then((res) => {
        setStats(res.data?.data?.stats || res.data?.data || null);
      })
      .catch(() => {
        // Graceful — widget is non-critical
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-5 w-44 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Use RSS signal counts if available from dashboard stats
  const signalCounts = stats?.rssSignals || { budget: 0, actor: 0, enterprise: 0, compliance: 0 };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        RSS Intelligence
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{signalCounts.budget || 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Budget Signals</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{signalCounts.actor || 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Actors Identified</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{signalCounts.enterprise || 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Enterprise Signals</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">{signalCounts.compliance || 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Compliance Alerts</div>
        </div>
      </div>
    </div>
  );
}

export default RssIntelligenceWidget;
