import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOpportunities } from '../store/slices/opportunitySlice';
import { fetchTrendSummary } from '../store/slices/dashboardSlice';
import { getViewByPath } from '../config/strategicNavConfig';
import StrategicNav from '../components/navigation/StrategicNav';
import OpportunityFilters from '../components/opportunities/OpportunityFilters';
import OpportunityList from '../components/opportunities/OpportunityList';
import ActiveFilterChips from '../components/opportunities/ActiveFilterChips';
import UpgradePrompt from '../components/common/UpgradePrompt';
import TrendCard from '../components/dashboard/TrendCard';

const VIEW_TREND_TYPES = {
  all: ['gov_contract', 'ai_job', 'investment', 'grant', 'ai_news', 'freelance'],
  government: ['gov_contract', 'grant'],
  'private-sector': ['ai_news'],
  talent: ['ai_job'],
  capital: ['investment'],
  alpha: ['gov_contract', 'ai_job', 'investment', 'grant', 'ai_news', 'freelance'],
};

function StrategicViewPage() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { items, pagination, loading, error } = useSelector(
    (state) => state.opportunities
  );
  const trends = useSelector((state) => state.dashboard.trends);
  const currentFilters = useRef({});

  const viewConfig = useMemo(
    () => getViewByPath(location.pathname) || getViewByPath('/opportunities'),
    [location.pathname]
  );

  const buildParams = useCallback(
    (userFilters = {}) => ({
      ...viewConfig.filterPreset,
      ...userFilters,
      page: userFilters.page || 1,
      limit: 20,
    }),
    [viewConfig]
  );

  // Fetch on view change (new tab selected)
  useEffect(() => {
    currentFilters.current = {};
    dispatch(fetchOpportunities(buildParams()));
  }, [dispatch, viewConfig.key, buildParams]);

  // Fetch trend data once
  useEffect(() => {
    if (!trends) dispatch(fetchTrendSummary());
  }, [dispatch, trends]);

  const handleFilterChange = useCallback(
    (filters) => {
      currentFilters.current = filters;
      dispatch(fetchOpportunities(buildParams(filters)));
    },
    [dispatch, buildParams]
  );

  const handlePageChange = (newPage) => {
    dispatch(
      fetchOpportunities(buildParams({ ...currentFilters.current, page: newPage }))
    );
  };

  const handleRemoveFilter = (filterKey) => {
    const updated = { ...currentFilters.current };
    delete updated[filterKey];
    currentFilters.current = updated;
    dispatch(fetchOpportunities(buildParams(updated)));
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-primary dark:text-gray-100 mb-1">
          {viewConfig.key === 'all' ? 'Opportunities' : viewConfig.label}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {viewConfig.description}
        </p>

        <StrategicNav />

        {/* Market Trends */}
        {trends && VIEW_TREND_TYPES[viewConfig.key] && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 border border-blue-100 dark:border-gray-700 rounded-lg p-4 mb-4">
            <div className={`grid gap-3 ${VIEW_TREND_TYPES[viewConfig.key].length > 2 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : VIEW_TREND_TYPES[viewConfig.key].length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-xl'}`}>
              {VIEW_TREND_TYPES[viewConfig.key].map((type) => (
                <TrendCard key={type} type={type} trendData={trends[type]} variant="compact" />
              ))}
            </div>
          </div>
        )}

        <UpgradePrompt />

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <OpportunityFilters
            onFilterChange={handleFilterChange}
            filters={currentFilters.current}
            lockedFilters={viewConfig.filterPreset}
            prominentFilters={viewConfig.subFilters || []}
          />

          <ActiveFilterChips
            filters={currentFilters.current}
            presetFilters={viewConfig.filterPreset}
            onRemove={handleRemoveFilter}
          />

          <OpportunityList
            items={items}
            pagination={pagination}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

export default StrategicViewPage;
