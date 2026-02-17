import React from 'react';

function ForumFilters({ onFilterChange, filters }) {
  const handleChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="inline-flex gap-4">
      {/* Category Filter */}
      <select
        value={filters.category || ''}
        onChange={(e) => handleChange('category', e.target.value)}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All Categories</option>
        <option value="general">General</option>
        <option value="gov_contracts">Government Contracts</option>
        <option value="ai_jobs">AI Jobs</option>
        <option value="investments">Investments</option>
        <option value="platform">Platform</option>
      </select>

      {/* Status Filter */}
      <select
        value={filters.status || ''}
        onChange={(e) => handleChange('status', e.target.value)}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All Statuses</option>
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="pinned">Pinned</option>
      </select>
    </div>
  );
}

export default ForumFilters;
