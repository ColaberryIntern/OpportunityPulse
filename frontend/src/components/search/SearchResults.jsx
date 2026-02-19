import React from 'react';

const STATUS_COLORS = {
  draft: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800',
  published: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  archived: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
};

function SearchResults({ results, pagination, onPageChange, loading }) {
  if (loading) {
    return <p className="text-gray-500 dark:text-gray-400">Searching...</p>;
  }

  if (!results.length) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
        No results found. Try adjusting your search criteria.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {pagination?.total} result{pagination?.total !== 1 ? 's' : ''} found
      </p>

      <div className="space-y-3">
        {results.map((item) => (
          <div key={item.id} className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{item.body}</p>
            <div className="flex items-center gap-3 mt-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] || STATUS_COLORS.draft}`}>
                {item.status}
              </span>
              {item.category && (
                <span className="text-xs text-gray-400 dark:text-gray-500">Category: {item.category}</span>
              )}
              {item.tags?.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Tags: {item.tags.join(', ')}
                </span>
              )}
              {item.author && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  By: {item.author.name || item.author.email}
                </span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(item.created_at || item.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="mt-4 flex justify-between items-center text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Page {pagination.page} of {pagination.pages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 border rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="px-3 py-1 border rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchResults;
