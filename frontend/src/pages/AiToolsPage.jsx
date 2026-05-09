import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAiTools } from '../store/slices/aiToolSlice';
import AiToolCard from '../components/aiTools/AiToolCard';
import IndustryFilter from '../components/aiTools/IndustryFilter';
import CategoryFilter from '../components/aiTools/CategoryFilter';
import SEOHead from '../components/common/SEOHead';

const SORT_OPTIONS = [
  { value: 'trending', label: 'Most Trending' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Alphabetical' },
];

function AiToolsPage() {
  const dispatch = useDispatch();
  const { tools, pagination, loading, error } = useSelector((state) => state.aiTools);
  const [industry, setIndustry] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('trending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = { page, limit: 18, sort };
    if (industry) params.industry = industry;
    if (category) params.category = category;
    if (search) params.q = search;
    dispatch(fetchAiTools(params));
  }, [dispatch, page, industry, category, sort, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="p-6">
      <SEOHead title="AI Tools" path="/ai-tools" />
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-primary dark:text-white">AI Tools Trending</h1>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search tools..."
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent w-48"
              aria-label="Search AI tools"
            />
          </form>
        </div>

        {/* Industry filter */}
        <div className="mb-4">
          <IndustryFilter selected={industry} onChange={(val) => { setIndustry(val); setPage(1); }} />
        </div>

        {/* Category + Sort controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <CategoryFilter selected={category} onChange={(val) => { setCategory(val); setPage(1); }} />
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Sort tools"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Initial-load skeletons — only when we have nothing to show yet.
            On refetch (filter/sort change, background poll, etc.) we keep the
            existing cards mounted with reduced opacity so a mid-click refetch
            doesn't unmount the card you're clicking on (caused stuck clicks
            that needed 3–4 retries). */}
        {loading && (!tools || tools.length === 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white dark:bg-gray-800 shadow rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
                <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
                <div className="flex gap-1">
                  <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tools grid — mounted whenever we have data, even mid-refetch. */}
        {tools && tools.length > 0 && (
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {tools.map((tool, idx) => (
              <AiToolCard key={tool.id || tool.slug || idx} tool={tool} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && (!tools || tools.length === 0) && !error && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No tools found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Try adjusting your filters or search terms.
            </p>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1.5 rounded text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AiToolsPage;
