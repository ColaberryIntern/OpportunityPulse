import React from 'react';
import StatCard from '../common/StatCard';

function formatCurrency(value) {
  if (!value || value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function IntelligenceKPIs({ marketStats, revenuePotentialEstimate }) {
  if (!marketStats) {
    return (
      <div className="mb-6 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded mb-2 mx-auto w-16" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mx-auto w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalActive = marketStats.totalActive || 0;

  return (
    <div className="mb-6">
      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
        <StatCard label="Active Opportunities" value={marketStats.totalActive} />
        <StatCard label="Classified" value={marketStats.classified} />
        <StatCard label="Avg AI Score" value={marketStats.averageScore} suffix="/100" />
        <StatCard label="Revenue Potential" value={formatCurrency(revenuePotentialEstimate)} />
        <StatCard label="Expiring This Week" value={marketStats.expiringSoon || 0} />
      </div>

      {/* Type & Domain Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Type */}
        {marketStats.typeCounts && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">By Type</h3>
            <div className="space-y-2">
              {Object.entries(marketStats.typeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                      {type.replace(/_/g, ' ')}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: `${Math.min(100, (count / Math.max(totalActive, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-900 dark:text-gray-100 w-8 text-right">
                        {count}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Top AI Domains */}
        {marketStats.domainBreakdown?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Top AI Domains</h3>
            <div className="space-y-2">
              {marketStats.domainBreakdown.slice(0, 8).map((d) => (
                <div key={d.domain} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400">{d.domain}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{
                          width: `${Math.min(100, (d.count / (marketStats.domainBreakdown[0]?.count || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 w-8 text-right">
                      {d.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IntelligenceKPIs;
