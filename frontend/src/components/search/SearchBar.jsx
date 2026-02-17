import React, { useState, useEffect, useRef } from 'react';

function SearchBar({ onSearch, initialFilters = {} }) {
  const [q, setQ] = useState(initialFilters.q || '');
  const [category, setCategory] = useState(initialFilters.category || '');
  const [status, setStatus] = useState(initialFilters.status || '');
  const [sort, setSort] = useState(initialFilters.sort || 'newest');
  const debounceRef = useRef(null);

  // Debounced keyword search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onSearch({ q: q || undefined, category: category || undefined, status: status || undefined, sort });
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [q, category, status, sort]); // onSearch is stable via useCallback in parent

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search content by keyword..."
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
        <div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default SearchBar;
