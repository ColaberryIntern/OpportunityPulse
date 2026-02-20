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
import RecommendationsList from '../components/recommendations/RecommendationsList';
import ForYouSection from '../components/dashboard/ForYouSection';
import OnboardingFlow from '../components/onboarding/OnboardingFlow';
import { useRealtimeDashboard } from '../hooks/useRealtimeDashboard';
import { ConnectionStatus } from '../components/dashboard/RealTimeDashboard';
import SEOHead from '../components/common/SEOHead';
import AiToolTrendingWidget from '../components/aiTools/AiToolTrendingWidget';
import ToolMomentumBoard from '../components/dashboard/ToolMomentumBoard';
import RssIntelligenceWidget from '../components/dashboard/RssIntelligenceWidget';
import { fetchAnalytics } from '../store/slices/actionEngineSlice';

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
  const actionAnalytics = useSelector((state) => state.actionEngine.analytics);

  useRealtimeDashboard();

  useEffect(() => {
    dispatch(fetchStats());
    dispatch(fetchActivity({ page: 1, limit: 20 }));
    dispatch(fetchOpportunityDashboardStats());
    dispatch(fetchChartData({ period: '30d' }));
    dispatch(fetchTrendSummary());
    dispatch(fetchAnalytics());
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
      <SEOHead title="Dashboard" path="/dashboard" />
      <OnboardingFlow />
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary dark:text-white">Dashboard</h1>
          <ConnectionStatus />
        </div>

        <UpgradePrompt />

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
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

        {/* Strategic Intelligence */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Strategic Intelligence
            </h2>
            <a href="/executive-brief" className="text-sm text-accent hover:underline">
              View Full Brief
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricsCard
              title="Signals Classified"
              value={actionAnalytics?.signalsProcessed}
              description="With action types"
            />
            <MetricsCard
              title="Actions Tracked"
              value={actionAnalytics?.signalsActedOn}
              description="Opportunities in pipeline"
            />
            <MetricsCard
              title="Revenue Influenced"
              value={actionAnalytics?.totalRevenue ? `$${Math.round(actionAnalytics.totalRevenue).toLocaleString()}` : '$0'}
              description="From executed actions"
            />
          </div>
        </section>

        {/* RSS Intelligence */}
        <section className="mb-8">
          <RssIntelligenceWidget />
        </section>

        {/* Opportunity Overview */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Opportunity Overview
          </h2>
          <OpportunityStatsCard stats={opportunityStats} />
        </section>

        {/* AI Personal Matches */}
        <section className="mb-8">
          <ForYouSection />
        </section>

        {/* AI Recommendations */}
        <section className="mb-8">
          <RecommendationsList />
        </section>

        {/* AI Tools + Tool Momentum */}
        <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AiToolTrendingWidget />
          <ToolMomentumBoard />
        </section>

        {/* Opportunity Chart (Premium) */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Market Trends
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <TrendCard type="gov_contract" trendData={trends?.gov_contract} />
            <TrendCard type="ai_job" trendData={trends?.ai_job} />
            <TrendCard type="investment" trendData={trends?.investment} />
            <TrendCard type="grant" trendData={trends?.grant} />
            <TrendCard type="ai_news" trendData={trends?.ai_news} />
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Recent Activity</h2>
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
