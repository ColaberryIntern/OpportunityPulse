import React from 'react';
import MetricsCard from './MetricsCard';

function formatCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function OpportunityStatsCard({ stats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricsCard
        title="Total Opportunities"
        value={stats?.totalOpportunities}
        description="All tracked"
      />
      <MetricsCard
        title="Active"
        value={stats?.activeOpportunities}
        description="Currently open"
      />
      <MetricsCard
        title="Avg AI Score"
        value={stats?.averageAiScore}
        description="Across scored items"
      />
      <MetricsCard
        title="Total Value"
        value={stats?.totalValue != null ? formatCurrency(stats.totalValue) : null}
        description="Combined opportunity value"
      />
    </div>
  );
}

export default OpportunityStatsCard;
