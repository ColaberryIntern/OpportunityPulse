import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchActivity,
  fetchChartData,
  fetchTrendSummary,
} from '../store/slices/dashboardSlice';
import { fetchExecutiveBrief, fetchAnalytics } from '../store/slices/actionEngineSlice';
import RecentActivity from '../components/dashboard/RecentActivity';
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
import BriefHeroBanner from '../components/dashboard/BriefHeroBanner';
import IntelligenceKPIs from '../components/dashboard/IntelligenceKPIs';
import SectorHighlights from '../components/dashboard/SectorHighlights';
import ToolSpotlight from '../components/dashboard/ToolSpotlight';
import RssIntelligenceWidget from '../components/dashboard/RssIntelligenceWidget';

function DashboardPage() {
  const dispatch = useDispatch();
  const {
    activities,
    pagination,
    loading,
    error,
    chartData,
    trends,
    chartLoading,
  } = useSelector((state) => state.dashboard);
  const { executiveBrief, briefLoading } = useSelector((state) => state.actionEngine);
  const [chartType, setChartType] = useState('');
  const [chartPeriod, setChartPeriod] = useState('30d');

  useRealtimeDashboard();

  useEffect(() => {
    dispatch(fetchExecutiveBrief());
    dispatch(fetchAnalytics());
    dispatch(fetchChartData({ period: '30d' }));
    dispatch(fetchTrendSummary());
    dispatch(fetchActivity({ page: 1, limit: 20 }));
  }, [dispatch]);

  const handlePageChange = (newPage) => {
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

        {/* ===== SECTION 1: Intelligence Summary ===== */}
        <BriefHeroBanner brief={executiveBrief} loading={briefLoading} />

        <IntelligenceKPIs
          marketStats={executiveBrief?.marketStats}
          revenuePotentialEstimate={executiveBrief?.revenuePotentialEstimate}
        />

        <SectorHighlights highlights={executiveBrief?.sectorHighlights} />

        <RssIntelligenceWidget compact />

        {/* ===== SECTION 2: AI Tools & Momentum ===== */}
        <ToolSpotlight />

        <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AiToolTrendingWidget />
          <ToolMomentumBoard />
        </section>

        {/* ===== SECTION 3: Trends & Charts ===== */}
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

        {/* ===== SECTION 4: AI Matches & Recommendations ===== */}
        <section className="mb-8">
          <ForYouSection />
        </section>

        <section className="mb-8">
          <RecommendationsList />
        </section>

        {/* ===== Recent Activity ===== */}
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
