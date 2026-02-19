import React from 'react';
import Pagination from '../common/Pagination';

const TYPE_COLORS = {
  platform: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800',
  opportunity: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  content: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800',
};

const STATUS_COLORS = {
  pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800',
  reviewed: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  resolved: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
};

function FeedbackList({ items, pagination, onPageChange, onDelete, loading, currentUserId, isAdmin }) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No feedback yet.
      </div>
    );
  }

  const renderStars = (score) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${star <= score ? 'text-yellow-400' : 'text-gray-300'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {renderStars(item.score)}
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {item.user?.name || 'Anonymous'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[item.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                    {item.type}
                  </span>
                  {item.status && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                      {item.status}
                    </span>
                  )}
                </div>
                {item.comments && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{item.comments}</p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
              </div>
              {(currentUserId === item.user?.id || isAdmin) && (
                <button
                  onClick={() => onDelete(item.id)}
                  className="text-red-500 hover:text-red-700 text-sm ml-4"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Pagination pagination={pagination} onPageChange={onPageChange} />
    </div>
  );
}

export default FeedbackList;
