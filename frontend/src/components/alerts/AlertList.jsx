import React from 'react';
import Pagination from '../common/Pagination';

const TYPE_LABELS = {
  new_opportunity: 'New Opportunity',
  score_change: 'Score Change',
  trend_alert: 'Trend Alert',
  system: 'System',
};

const SEVERITY_STYLES = {
  info: { border: 'border-l-blue-500', icon: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  warning: { border: 'border-l-yellow-500', icon: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  important: { border: 'border-l-red-500', icon: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
};

function AlertList({ alerts, pagination, onPageChange, onMarkRead, onMarkAllRead, onDelete, loading }) {
  if (loading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading alerts...</p>;
  }

  if (!alerts || !alerts.length) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
        No alerts yet.
      </div>
    );
  }

  const hasUnread = alerts.some((a) => !a.read);

  return (
    <div>
      {hasUnread && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onMarkAllRead}
            className="text-sm text-accent hover:underline font-medium"
          >
            Mark all as read
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
        {alerts.map((alert) => {
          const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;

          return (
            <div
              key={alert.id}
              className={`p-4 flex items-start gap-3 ${!alert.read ? `border-l-4 ${severity.border}` : ''}`}
            >
              <div className={`shrink-0 mt-0.5 ${severity.icon}`}>
                {alert.severity === 'important' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : alert.severity === 'warning' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm ${!alert.read ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-normal text-gray-700 dark:text-gray-300'}`}>
                    {alert.title}
                  </h4>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {TYPE_LABELS[alert.type] || alert.type}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{alert.message}</p>
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block">
                  {new Date(alert.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!alert.read && (
                  <button
                    onClick={() => onMarkRead(alert.id)}
                    className="text-xs text-accent hover:underline"
                  >
                    Mark read
                  </button>
                )}
                <button
                  onClick={() => onDelete(alert.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination pagination={pagination} onPageChange={onPageChange} />
    </div>
  );
}

export default AlertList;
