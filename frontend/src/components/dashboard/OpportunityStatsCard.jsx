import React from 'react';
import MetricsCard from './MetricsCard';

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
        value={stats?.totalValue != null ? `$${parseFloat(stats.totalValue).toLocaleString()}` : null}
        description="Combined opportunity value"
      />
    </div>
  );
}

export default OpportunityStatsCard;
