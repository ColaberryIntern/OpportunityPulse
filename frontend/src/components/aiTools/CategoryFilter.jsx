import React from 'react';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'LLM', label: 'LLM' },
  { value: 'Image Generation', label: 'Image Generation' },
  { value: 'Code Assistant', label: 'Code Assistant' },
  { value: 'Audio/Speech', label: 'Audio/Speech' },
  { value: 'Video', label: 'Video' },
  { value: 'Analytics', label: 'Analytics' },
  { value: 'Automation', label: 'Automation' },
  { value: 'Search', label: 'Search' },
  { value: 'Writing', label: 'Writing' },
  { value: 'Design', label: 'Design' },
  { value: 'Data Science', label: 'Data Science' },
  { value: 'Other', label: 'Other' },
];

function CategoryFilter({ selected, onChange }) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      aria-label="Filter by category"
    >
      {CATEGORIES.map((cat) => (
        <option key={cat.value} value={cat.value}>{cat.label}</option>
      ))}
    </select>
  );
}

export default CategoryFilter;
