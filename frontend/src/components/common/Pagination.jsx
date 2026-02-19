import React from 'react';

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.pages <= 1) return null;

  return (
    <div className="mt-4 flex justify-between items-center text-sm">
      <span className="text-gray-500 dark:text-gray-400">
        Page {pagination.page} of {pagination.pages}
        {pagination.total != null && ` (${pagination.total} total)`}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={pagination.page <= 1}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={pagination.page >= pagination.pages}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Pagination;
