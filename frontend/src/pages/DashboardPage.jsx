import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchStats,
  fetchActivity,
  fetchOpportunityDashboardStats,
  fetchChartData,
  fetchTrendSummary,
} from '../store/slices/dashboardSlice';
import MetricsCard from '../components/dashboard/MetricsCard';
import RecentActivity from '../components/dashboard/RecentActivity';
import OpportunityStatsCard from '../components/dashboard/OpportunityStatsCard';
import OpportunityChart from '../components/dashboard/OpportunityChart';
import TrendCard from '../components/dashboard/TrendCard';
import UpgradePrompt from '../components/common/UpgradePrompt';

function DashboardPage() {
  const dispatch = useDispatch();
  const {
    stats,
    activities,
    pagination,
    loading,
    error,
    opportunityStats,
    chartData,
    trends,
    chartLoading,
  } = useSelector((state) => state.dashboard);
  const [activityPage, setActivityPage] = useState(1);
  const [chartType, setChartType] = useState('');
  const [chartPeriod, setChartPeriod] = useState('30d');

  useEffect(() => {
    dispatch(fetchStats());
    dispatch(fetchActivity({ page: 1, limit: 20 }));
    dispatch(fetchOpportunityDashboardStats());
    dispatch(fetchChartData({ period: '30d' }));
    dispatch(fetchTrendSummary());
  }, [dispatch]);

  const handlePageChange = (newPage) => {
    setActivityPage(newPage);
    dispatch(fetchActivity({ page: newPage, limit: 20 }));
  };

  const handleChartTypeChange = (type) => {
    setChartType(type);
    dispatch(fetchChartData({ type: type || undefined, period: chartPeriod }));
  };

  const handleChartPeriodChange = (period) => {
    setChartPeriod(period);
    dispatch(fetchChartData({ type: chartType || undefined, period }));
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-6">Dashboard</h1>

        <UpgradePrompt />

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Platform Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricsCard
            title="Total Users"
            value={stats?.totalUsers}
            description="Platform-wide"
          />
          <MetricsCard
            title="Total Content"
            value={stats?.totalContent}
            description="All published items"
          />
          <MetricsCard
            title="My Content"
            value={stats?.myContentCount}
            description="Items you created"
          />
          <MetricsCard
            title="My Activity"
            value={stats?.recentActivityCount}
            description="Total actions"
          />
        </div>

        {/* Opportunity Overview */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Opportunity Overview
          </h2>
          <OpportunityStatsCard stats={opportunityStats} />
        </section>

        {/* Opportunity Chart (Premium) */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Opportunity Trends
          </h2>
          <OpportunityChart
            chartData={chartData}
            loading={chartLoading}
            onTypeChange={handleChartTypeChange}
            onPeriodChange={handleChartPeriodChange}
          />
        </section>

        {/* Market Trends */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Market Trends
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TrendCard type="gov_contract" trendData={trends?.gov_contract} />
            <TrendCard type="ai_job" trendData={trends?.ai_job} />
            <TrendCard type="investment" trendData={trends?.investment} />
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Activity</h2>
          <RecentActivity
            activities={activities}
            pagination={pagination}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;
