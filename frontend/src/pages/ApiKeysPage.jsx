import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchApiKeys,
  createApiKey,
  revokeApiKey,
  clearNewKey,
} from '../store/slices/apiKeySlice';
import ApiKeyList from '../components/apiKeys/ApiKeyList';
import CreateApiKeyModal from '../components/apiKeys/CreateApiKeyModal';

function ApiKeysPage() {
  const dispatch = useDispatch();
  const { items, loading, error, newKey } = useSelector(
    (state) => state.apiKeys
  );
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchApiKeys());
  }, [dispatch]);

  const handleCreate = useCallback(
    async ({ name, scopes }) => {
      await dispatch(createApiKey({ name, scopes })).unwrap();
    },
    [dispatch]
  );

  const handleRevoke = useCallback(
    async (id) => {
      if (window.confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
        await dispatch(revokeApiKey(id));
      }
    },
    [dispatch]
  );

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleClearNewKey = useCallback(() => {
    dispatch(clearNewKey());
  }, [dispatch]);

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary dark:text-gray-100">
              API Keys
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage API keys for programmatic access to Opportunity Pulse.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
            aria-label="Create new API key"
          >
            + New API Key
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <ApiKeyList
            apiKeys={items}
            onRevoke={handleRevoke}
            loading={loading}
          />
        </div>

        {/* Create Modal */}
        <CreateApiKeyModal
          open={modalOpen}
          onClose={handleCloseModal}
          onCreate={handleCreate}
          newKey={newKey}
          onClearNewKey={handleClearNewKey}
        />
      </div>
    </div>
  );
}

export default ApiKeysPage;
