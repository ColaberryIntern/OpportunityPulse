import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchFreelanceOpportunities,
  fetchFreelanceTrends,
  generateFreelanceAction,
  clearGeneratedAction,
} from '../store/slices/freelanceSlice';
import FreelanceCard from '../components/freelance/FreelanceCard';
import FreelanceTrendBar from '../components/freelance/FreelanceTrendBar';
import FreelanceDemandChart from '../components/freelance/FreelanceDemandChart';
import FreelanceActionModal from '../components/freelance/FreelanceActionModal';
import StrategicNav from '../components/navigation/StrategicNav';
import OpportunityFilters from '../components/opportunities/OpportunityFilters';
import ActiveFilterChips from '../components/opportunities/ActiveFilterChips';
import UpgradePrompt from '../components/common/UpgradePrompt';
import SectionBrief from '../components/common/SectionBrief';
import SEOHead from '../components/common/SEOHead';

const VIEW_PRESET = { type: 'freelance' };
const PROMINENT_FILTERS = ['category', 'status', 'actionType', 'sort', 'minScore', 'capability'];

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
  } = useSelector((state) => state.freelance);

  const [showModal, setShowModal] = useState(false);
  const currentFilters = useRef({});

  useEffect(() => {
    dispatch(fetchFreelanceOpportunities({ ...VIEW_PRESET, page: 1, limit: 20 }));
    dispatch(fetchFreelanceTrends());
  }, [dispatch]);

  const handleFilterChange = useCallback((filters) => {
    currentFilters.current = filters;
    dispatch(fetchFreelanceOpportunities({ ...VIEW_PRESET, ...filters, page: 1, limit: 20 }));
  }, [dispatch]);

  const handleRemoveFilter = (filterKey) => {
    const updated = { ...currentFilters.current };
    delete updated[filterKey];
    currentFilters.current = updated;
    dispatch(fetchFreelanceOpportunities({ ...VIEW_PRESET, ...updated, page: 1, limit: 20 }));
  };

  const handlePageChange = (newPage) => {
    dispatch(fetchFreelanceOpportunities({ ...VIEW_PRESET, ...currentFilters.current, page: newPage, limit: 20 }));
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
        <h1 className="text-2xl font-bold text-primary dark:text-gray-100 mb-1">Freelance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          AI freelance projects, demand trends, and actionable opportunities
        </p>

        <StrategicNav />

        <SectionBrief section="freelance" />

        <UpgradePrompt />

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <OpportunityFilters
            onFilterChange={handleFilterChange}
            filters={currentFilters.current}
            lockedFilters={VIEW_PRESET}
            prominentFilters={PROMINENT_FILTERS}
          />

          <ActiveFilterChips
            filters={currentFilters.current}
            presetFilters={VIEW_PRESET}
            onRemove={handleRemoveFilter}
          />
        </div>

        {/* Trending Skills Bar */}
        <div className="mt-4">
          <FreelanceTrendBar trending={trending} loading={trendsLoading} />
        </div>

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
