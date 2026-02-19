import React, { useState } from 'react';

const STATUS_STYLES = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

function WebhookDeliveryLog({ open, onClose, deliveries, pagination, loading, onPageChange }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!open) return null;

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose} aria-label="Delivery log modal">
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Webhook delivery log"
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delivery Log</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close delivery log"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400" aria-label="Loading deliveries">
              <svg className="animate-spin h-8 w-8 mx-auto mb-2 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading deliveries...
            </div>
          ) : !deliveries || deliveries.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">No deliveries yet.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" aria-label="Delivery log table">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {deliveries.map((d) => (
                  <React.Fragment key={d.id}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{d.eventType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[d.status] || STATUS_STYLES.pending}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {d.responseCode || '--'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(d.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleExpand(d.id)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          aria-label={expandedId === d.id ? 'Collapse response body' : 'Expand response body'}
                        >
                          {expandedId === d.id ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === d.id && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                          <div className="text-xs">
                            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Response Body:</p>
                            <pre className="p-2 bg-gray-100 dark:bg-gray-900 rounded text-gray-800 dark:text-gray-200 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                              {d.responseBody || '(empty)'}
                            </pre>
                            <p className="font-medium text-gray-700 dark:text-gray-300 mt-2 mb-1">Attempts: {d.attempts}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Page {pagination.page} of {pagination.pages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                Prev
              </button>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WebhookDeliveryLog;
