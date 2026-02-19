import React from 'react';

function ApiKeyList({ apiKeys, onRevoke, loading }) {
  if (loading) {
    return (
      <div className="text-center py-10 text-gray-500 dark:text-gray-400">
        Loading API keys...
      </div>
    );
  }

  if (!apiKeys || apiKeys.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 dark:text-gray-400">
        No API keys yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" aria-label="API keys table">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Name
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Key Prefix
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Scopes
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Created
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Last Used
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {apiKeys.map((key) => (
            <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                {key.name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 font-mono">
                {key.keyPrefix}...
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                <div className="flex gap-1">
                  {(key.scopes || []).map((scope) => (
                    <span
                      key={scope}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        scope === 'write'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {key.createdAt
                  ? new Date(key.createdAt).toLocaleDateString()
                  : '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {key.lastUsedAt
                  ? new Date(key.lastUsedAt).toLocaleDateString()
                  : 'Never'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                {key.isActive ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    Revoked
                  </span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                {key.isActive && (
                  <button
                    onClick={() => onRevoke(key.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-sm transition-colors"
                    aria-label={`Revoke API key ${key.name}`}
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ApiKeyList;
