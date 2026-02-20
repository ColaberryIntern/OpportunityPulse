import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchFreelanceOpportunities,
  fetchFreelanceTrends,
  generateFreelanceAction,
  clearGeneratedAction,
  setFreelanceFilters,
} from '../store/slices/freelanceSlice';
import FreelanceCard from '../components/freelance/FreelanceCard';
import FreelanceTrendBar from '../components/freelance/FreelanceTrendBar';
import FreelanceDemandChart from '../components/freelance/FreelanceDemandChart';
import FreelanceActionModal from '../components/freelance/FreelanceActionModal';
import SEOHead from '../components/common/SEOHead';

const SORT_OPTIONS = [
  { value: 'score', label: 'AI Score' },
  { value: 'budget', label: 'Budget' },
  { value: 'newest', label: 'Newest' },
  { value: 'competition', label: 'Low Competition' },
];

const PLATFORM_OPTIONS = [
  { value: '', label: 'All Platforms' },
  { value: 'upwork', label: 'Upwork' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'linkedin', label: 'LinkedIn' },
];

function FreelancePage() {
  const dispatch = useDispatch();
  const {
    opportunities,
    pagination,
    loading,
    error,
    trends,
    trendsLoading,
    generatedAction,
    actionLoading,
    filters,
  } = useSelector((state) => state.freelance);

  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    dispatch(fetchFreelanceOpportunities(filters));
    dispatch(fetchFreelanceTrends());
  }, [dispatch, filters]);

  const handleFilterChange = (key, value) => {
    dispatch(setFreelanceFilters({ [key]: value }));
  };

  const handlePageChange = (newPage) => {
    dispatch(fetchFreelanceOpportunities({ ...filters, page: newPage }));
  };

  const handleAction = (opportunityId, actionType) => {
    setShowModal(true);
    dispatch(generateFreelanceAction({ id: opportunityId, actionType }));
  };

  const handleCloseModal = () => {
    setShowModal(false);
    dispatch(clearGeneratedAction());
  };

  const trending = trends?.trending || [];

  return (
    <div className="p-6">
      <SEOHead title="AI Freelance" path="/freelance" />
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary dark:text-white">AI Freelance</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              AI freelance projects, demand trends, and actionable opportunities
            </p>
          </div>
          {pagination && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {pagination.total} opportunities
            </span>
          )}
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-white dark:bg-gray-800 shadow rounded-lg p-3">
          <select
            value={filters.sort}
            onChange={(e) => handleFilterChange('sort', e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={filters.platform}
            onChange={(e) => handleFilterChange('platform', e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Filter by skills (comma-separated)"
            value={filters.skills}
            onChange={(e) => handleFilterChange('skills', e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex-1 min-w-[180px]"
          />

          <input
            type="number"
            placeholder="Min budget"
            value={filters.minBudget}
            onChange={(e) => handleFilterChange('minBudget', e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 w-24"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Trending Skills Bar */}
        <FreelanceTrendBar trending={trending} loading={trendsLoading} />

        {/* Opportunity Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 animate-pulse">
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
                <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
                  ))}
                </div>
                <div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        ) : opportunities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {opportunities.map((opp) => (
              <FreelanceCard key={opp.id} opportunity={opp} onAction={handleAction} />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center mb-6">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No freelance opportunities found. Adjust your filters or wait for the next ingestion cycle.
            </p>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex justify-center gap-2 mb-6">
            {Array.from({ length: Math.min(pagination.pages, 10) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => handlePageChange(p)}
                className={`text-xs px-3 py-1.5 rounded ${
                  p === pagination.page
                    ? 'bg-accent text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Demand Trends Chart */}
        <FreelanceDemandChart trending={trending} loading={trendsLoading} />

        {/* Action Modal */}
        {showModal && (
          <FreelanceActionModal
            action={generatedAction}
            loading={actionLoading}
            onClose={handleCloseModal}
          />
        )}
      </div>
    </div>
  );
}

export default FreelancePage;
