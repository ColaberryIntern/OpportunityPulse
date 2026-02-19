import React, { useState, useEffect, useRef } from 'react';

function OpportunityFilters({ onFilterChange, filters = {}, isPublic = false }) {
  const [q, setQ] = useState(filters.q || '');
  const [category, setCategory] = useState(filters.category || '');
  const [status, setStatus] = useState(filters.status || '');
  const [sort, setSort] = useState(filters.sort || 'newest');
  const [minScore, setMinScore] = useState(filters.minScore || '');
  const [actionType, setActionType] = useState(filters.actionType || '');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = { sort };
      if (q) params.q = q;
      if (category) params.category = category;
      if (status) params.status = status;
      if (minScore) params.minScore = minScore;
      if (actionType) params.actionType = actionType;
      onFilterChange(params);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, category, status, sort, minScore, actionType]); // onFilterChange is stable via useCallback

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="opp-filter-search" className="sr-only">Search opportunities</label>
          <input
            id="opp-filter-search"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search opportunities..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label htmlFor="opp-filter-category" className="sr-only">Category</label>
          <input
            id="opp-filter-category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        {!isPublic && (
          <div>
            <label htmlFor="opp-filter-status" className="sr-only">Status</label>
            <select
              id="opp-filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        )}
        {!isPublic && (
          <div>
            <label htmlFor="opp-filter-action-type" className="sr-only">Action Type</label>
            <select
              id="opp-filter-action-type"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All Actions</option>
              <option value="BUILD">Build</option>
              <option value="BID">Bid</option>
              <option value="APPLY">Apply</option>
              <option value="PARTNER">Partner</option>
              <option value="INVEST">Invest</option>
              <option value="TEACH">Teach</option>
              <option value="IGNORE">Ignore</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="opp-filter-sort" className="sr-only">Sort order</label>
          <select
            id="opp-filter-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            {!isPublic && <option value="score">Highest Score</option>}
            <option value="value">Highest Value</option>
          </select>
        </div>
        {!isPublic && (
          <div>
            <label htmlFor="opp-filter-min-score" className="sr-only">Minimum score</label>
            <input
              id="opp-filter-min-score"
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="Min Score"
              min="0"
              max="100"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default OpportunityFilters;
