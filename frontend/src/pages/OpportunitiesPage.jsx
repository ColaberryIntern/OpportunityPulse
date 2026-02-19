import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOpportunities } from '../store/slices/opportunitySlice';
import OpportunityFilters from '../components/opportunities/OpportunityFilters';
import OpportunityList from '../components/opportunities/OpportunityList';
import UpgradePrompt from '../components/common/UpgradePrompt';

const TYPE_TABS = [
  { value: '', label: 'All' },
  { value: 'gov_contract', label: 'Gov Contracts' },
  { value: 'ai_job', label: 'AI Jobs' },
  { value: 'investment', label: 'Investments' },
  { value: 'grant', label: 'Grants' },
  { value: 'ai_news', label: 'AI News' },
];

function OpportunitiesPage() {
  const dispatch = useDispatch();
  const { items, pagination, loading, error } = useSelector(
    (state) => state.opportunities
  );
  const [activeTab, setActiveTab] = useState('');
  const currentFilters = useRef({});

  useEffect(() => {
    dispatch(fetchOpportunities({ type: activeTab || undefined, page: 1, limit: 20 }));
  }, [dispatch, activeTab]);

  const handleFilterChange = useCallback((filters) => {
    currentFilters.current = filters;
    dispatch(
      fetchOpportunities({
        ...filters,
        type: activeTab || undefined,
        page: 1,
        limit: 20,
      })
    );
  }, [dispatch, activeTab]);

  const handlePageChange = (newPage) => {
    dispatch(
      fetchOpportunities({
        ...currentFilters.current,
        type: activeTab || undefined,
        page: newPage,
        limit: 20,
      })
    );
  };

  const handleTabChange = (type) => {
    setActiveTab(type);
    currentFilters.current = {};
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-6">Opportunities</h1>

        <UpgradePrompt />

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Type Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                activeTab === tab.value
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          <OpportunityFilters onFilterChange={handleFilterChange} filters={{}} />
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

export default OpportunitiesPage;
