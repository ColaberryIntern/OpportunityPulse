import React, { useState, useEffect, useRef } from 'react';

function OpportunityFilters({ onFilterChange, filters = {}, isPublic = false }) {
  const [q, setQ] = useState(filters.q || '');
  const [category, setCategory] = useState(filters.category || '');
  const [status, setStatus] = useState(filters.status || '');
  const [sort, setSort] = useState(filters.sort || 'newest');
  const [minScore, setMinScore] = useState(filters.minScore || '');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = { sort };
      if (q) params.q = q;
      if (category) params.category = category;
      if (status) params.status = status;
      if (minScore) params.minScore = minScore;
      onFilterChange(params);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, category, status, sort, minScore]); // onFilterChange is stable via useCallback

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search opportunities..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {!isPublic && (
          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        )}
        <div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            {!isPublic && <option value="score">Highest Score</option>}
            <option value="value">Highest Value</option>
          </select>
        </div>
        {!isPublic && (
          <div>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="Min Score"
              min="0"
              max="100"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default OpportunityFilters;
