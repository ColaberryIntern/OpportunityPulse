import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { performSearch } from '../store/slices/searchSlice';
import SearchBar from '../components/search/SearchBar';
import SearchResults from '../components/search/SearchResults';

function SearchPage() {
  const dispatch = useDispatch();
  const { results, pagination, filters, loading, error } = useSelector(
    (state) => state.search
  );
  const currentFilters = useRef({});

  const handleSearch = useCallback((params) => {
    currentFilters.current = params;
    dispatch(performSearch({ ...params, page: 1, limit: 20 }));
  }, [dispatch]);

  const handlePageChange = (newPage) => {
    dispatch(performSearch({ ...currentFilters.current, page: newPage, limit: 20 }));
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-6">Search</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <SearchBar onSearch={handleSearch} initialFilters={filters} />
          <SearchResults
            results={results}
            pagination={pagination}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
