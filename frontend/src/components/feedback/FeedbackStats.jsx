import React from 'react';

function FeedbackStats({ stats }) {
  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No stats available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Total Feedback */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total Feedback</h4>
        <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{stats.totalCount}</p>
      </div>

      {/* Average Rating */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Average Rating</h4>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            {stats.averageScore != null ? Number(stats.averageScore).toFixed(1) : '--'}
          </p>
          <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
      </div>

      {/* Feedback by Type */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Feedback by Type</h4>
        {stats.byType && stats.byType.length > 0 ? (
          <ul className="space-y-1">
            {stats.byType.map((entry) => (
              <li key={entry.type || entry._id} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400 capitalize">{entry.type || entry._id}</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">{entry.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
        )}
      </div>
    </div>
  );
}

export default FeedbackStats;
