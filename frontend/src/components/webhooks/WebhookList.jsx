import React from 'react';

const EVENT_TYPE_COLORS = {
  'opportunity.created': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'alert.created': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'ingestion.completed': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'content.published': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

function WebhookList({ webhooks, loading, onEdit, onDelete, onTest, onViewLog, onToggleActive }) {
  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400" aria-label="Loading webhooks">
        <svg className="animate-spin h-8 w-8 mx-auto mb-2 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading webhooks...
      </div>
    );
  }

  if (!webhooks || webhooks.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <p className="text-sm">No webhooks configured yet.</p>
        <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">Create one to start receiving event notifications.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" aria-label="Webhooks table">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">URL</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event Types</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {webhooks.map((webhook) => (
            <tr key={webhook.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <td className="px-4 py-3">
                <span className="text-sm text-gray-900 dark:text-gray-100 font-mono truncate block max-w-xs" title={webhook.url}>
                  {webhook.url.length > 50 ? `${webhook.url.substring(0, 50)}...` : webhook.url}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {webhook.eventTypes && webhook.eventTypes.map((et) => (
                    <span
                      key={et}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${EVENT_TYPE_COLORS[et] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}
                    >
                      {et}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onToggleActive(webhook)}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    webhook.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }`}
                  aria-label={`Toggle webhook ${webhook.isActive ? 'inactive' : 'active'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${webhook.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                  {webhook.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-600 dark:text-gray-400 truncate block max-w-xs">
                  {webhook.description || '--'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onEdit(webhook)}
                    className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    aria-label={`Edit webhook ${webhook.url}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onTest(webhook.id)}
                    className="text-xs px-2 py-1 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
                    aria-label={`Test webhook ${webhook.url}`}
                  >
                    Test
                  </button>
                  <button
                    onClick={() => onViewLog(webhook.id)}
                    className="text-xs px-2 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    aria-label={`View delivery log for ${webhook.url}`}
                  >
                    Log
                  </button>
                  <button
                    onClick={() => onDelete(webhook.id)}
                    className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    aria-label={`Delete webhook ${webhook.url}`}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default WebhookList;
