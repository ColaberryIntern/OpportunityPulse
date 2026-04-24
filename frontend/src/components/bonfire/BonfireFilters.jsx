import React from 'react';
import { BONFIRE_CATEGORIES } from '../../services/bonfireService';

function BonfireFilters({ value, onChange }) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Search</label>
        <input
          type="text"
          value={v.q || ''}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Title, agency, description"
          className="w-56 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Agency</label>
        <input
          type="text"
          value={v.agency || ''}
          onChange={(e) => set({ agency: e.target.value })}
          placeholder="e.g. City of Austin"
          className="w-48 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
        <select
          value={v.category || ''}
          onChange={(e) => set({ category: e.target.value })}
          className="w-44 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        >
          <option value="">All</option>
          {BONFIRE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Min Priority</label>
        <input
          type="number"
          min={0}
          max={100}
          value={v.minScore ?? ''}
          onChange={(e) => set({ minScore: e.target.value })}
          className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Close by</label>
        <input
          type="date"
          value={v.closeBefore || ''}
          onChange={(e) => set({ closeBefore: e.target.value })}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
      </div>
      <label className="flex items-center gap-2 text-sm mb-1">
        <input
          type="checkbox"
          checked={String(v.highAiFit) === 'true'}
          onChange={(e) => set({ highAiFit: e.target.checked ? 'true' : '' })}
        />
        High AI Fit only
      </label>
      <button
        type="button"
        onClick={() => onChange({})}
        className="text-xs text-gray-600 dark:text-gray-400 underline hover:text-gray-900 dark:hover:text-gray-200 mb-1"
      >
        Clear
      </button>
    </div>
  );
}

export default BonfireFilters;
