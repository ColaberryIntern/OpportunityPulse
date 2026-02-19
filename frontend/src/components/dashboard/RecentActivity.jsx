import React from 'react';

const ACTION_LABELS = {
  login: 'Logged in',
  content_view: 'Viewed content',
  content_create: 'Created content',
  content_update: 'Updated content',
  content_delete: 'Deleted content',
  search_query: 'Searched',
  profile_update: 'Updated profile',
};

function RecentActivity({ activities, pagination, onPageChange, loading }) {
  if (loading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading activity...</p>;
  }

  if (!activities.length) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
        No recent activity.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {activities.map((activity) => (
          <li key={activity.id} className="px-6 py-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {ACTION_LABELS[activity.action] || activity.action}
              </p>
              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {JSON.stringify(activity.metadata)}
                </p>
              )}
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(activity.created_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      {pagination && pagination.pages > 1 && (
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 flex justify-between items-center text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
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

export default RecentActivity;
