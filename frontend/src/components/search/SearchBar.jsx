import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

function SearchBar({ onSearch, onNLResults, initialFilters = {} }) {
  const [q, setQ] = useState(initialFilters.q || '');
  const [category, setCategory] = useState(initialFilters.category || '');
  const [status, setStatus] = useState(initialFilters.status || '');
  const [sort, setSort] = useState(initialFilters.sort || 'newest');
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const debounceRef = useRef(null);

  // Debounced keyword search (only in standard mode)
  useEffect(() => {
    if (aiMode) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onSearch({ q: q || undefined, category: category || undefined, status: status || undefined, sort });
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [q, category, status, sort, aiMode]); // onSearch is stable via useCallback in parent

  const handleAISearch = async () => {
    if (!q.trim() || q.trim().length < 3) return;
    setAiLoading(true);
    try {
      const response = await api.post('/search/natural', { query: q.trim() });
      if (onNLResults) {
        onNLResults(response.data.data);
      }
    } catch {
      // Fallback to regular search on AI failure
      onSearch({ q: q || undefined, category: category || undefined, status: status || undefined, sort });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setAiMode(false)}
          className={`px-3 py-1 text-xs rounded-full font-medium transition ${!aiMode ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          Standard
        </button>
        <button
          type="button"
          onClick={() => setAiMode(true)}
          className={`px-3 py-1 text-xs rounded-full font-medium transition ${aiMode ? 'bg-highlight text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          AI Search
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="search-query" className="sr-only">Search</label>
          <input
            id="search-query"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => aiMode && e.key === 'Enter' && handleAISearch()}
            placeholder={aiMode ? 'Try: "AI contracts in Virginia over $1M"' : 'Search content by keyword...'}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        {aiMode && (
          <button
            type="button"
            onClick={handleAISearch}
            disabled={aiLoading || !q.trim() || q.trim().length < 3}
            className="px-4 py-2 bg-highlight text-white rounded-md text-sm font-medium hover:bg-highlight/90 disabled:opacity-50 transition"
          >
            {aiLoading ? 'Searching...' : 'AI Search'}
          </button>
        )}
        <div>
          <label htmlFor="search-category" className="sr-only">Category</label>
          <input
            id="search-category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label htmlFor="search-status" className="sr-only">Status</label>
          <select
            id="search-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label htmlFor="search-sort" className="sr-only">Sort order</label>
          <select
            id="search-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
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
