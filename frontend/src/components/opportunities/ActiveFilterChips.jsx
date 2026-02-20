import React from 'react';

const FILTER_LABELS = {
  q: 'Search',
  category: 'Category',
  status: 'Status',
  sort: 'Sort',
  minScore: 'Min Score',
  actionType: 'Action',
  domain: 'Domain',
  capability: 'Capability',
  intent: 'Intent',
  monetization: 'Monetization',
  maturity: 'Maturity',
  geo: 'Geography',
  quadrant: 'Quadrant',
  cluster: 'Cluster',
  type: 'Type',
};

function ActiveFilterChips({ filters, presetFilters = {}, onRemove }) {
  const userFilters = Object.entries(filters).filter(
    ([key, value]) => value && !presetFilters[key] && key !== 'page' && key !== 'limit'
  );

  if (userFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Active filters">
      {userFilters.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full"
        >
          {FILTER_LABELS[key] || key}: {value}
          <button
            onClick={() => onRemove(key)}
            className="ml-0.5 hover:text-red-500 transition"
            aria-label={`Remove ${FILTER_LABELS[key] || key} filter`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}

export default ActiveFilterChips;
