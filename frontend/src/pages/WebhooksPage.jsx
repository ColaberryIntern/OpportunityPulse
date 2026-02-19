import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  fetchDeliveryLog,
  clearNewSecret,
  clearTestResult,
  clearDeliveries,
} from '../store/slices/webhookSlice';
import WebhookList from '../components/webhooks/WebhookList';
import WebhookForm from '../components/webhooks/WebhookForm';
import WebhookDeliveryLog from '../components/webhooks/WebhookDeliveryLog';

function WebhooksPage() {
  const dispatch = useDispatch();
  const {
    items,
    loading,
    error,
    newSecret,
    testResult,
    deliveries,
    deliveryPagination,
    deliveryLoading,
  } = useSelector((state) => state.webhooks);

  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [activeLogWebhookId, setActiveLogWebhookId] = useState(null);

  useEffect(() => {
    dispatch(fetchWebhooks());
  }, [dispatch]);

  // Show test result notification
  useEffect(() => {
    if (testResult) {
      const timer = setTimeout(() => dispatch(clearTestResult()), 5000);
      return () => clearTimeout(timer);
    }
  }, [testResult, dispatch]);

  const handleCreate = useCallback(
    async (data) => {
      await dispatch(createWebhook(data)).unwrap();
    },
    [dispatch]
  );

  const handleUpdate = useCallback(
    async (data) => {
      await dispatch(updateWebhook(data)).unwrap();
    },
    [dispatch]
  );

  const handleSubmit = useCallback(
    async (data) => {
      if (editingWebhook) {
        await handleUpdate(data);
      } else {
        await handleCreate(data);
      }
    },
    [editingWebhook, handleCreate, handleUpdate]
  );

  const handleDelete = useCallback(
    async (id) => {
      if (window.confirm('Are you sure you want to delete this webhook? This action cannot be undone.')) {
        await dispatch(deleteWebhook(id));
      }
    },
    [dispatch]
  );

  const handleTest = useCallback(
    async (id) => {
      await dispatch(testWebhook(id));
    },
    [dispatch]
  );

  const handleEdit = useCallback((webhook) => {
    setEditingWebhook(webhook);
    setFormOpen(true);
  }, []);

  const handleOpenCreate = useCallback(() => {
    setEditingWebhook(null);
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingWebhook(null);
  }, []);

  const handleClearSecret = useCallback(() => {
    dispatch(clearNewSecret());
  }, [dispatch]);

  const handleToggleActive = useCallback(
    async (webhook) => {
      await dispatch(updateWebhook({
        id: webhook.id,
        isActive: !webhook.isActive,
      }));
    },
    [dispatch]
  );

  const handleViewLog = useCallback(
    (webhookId) => {
      setActiveLogWebhookId(webhookId);
      setLogOpen(true);
      dispatch(fetchDeliveryLog({ webhookId, page: 1, limit: 20 }));
    },
    [dispatch]
  );

  const handleCloseLog = useCallback(() => {
    setLogOpen(false);
    setActiveLogWebhookId(null);
    dispatch(clearDeliveries());
  }, [dispatch]);

  const handleLogPageChange = useCallback(
    (page) => {
      if (activeLogWebhookId) {
        dispatch(fetchDeliveryLog({ webhookId: activeLogWebhookId, page, limit: 20 }));
      }
    },
    [dispatch, activeLogWebhookId]
  );

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary dark:text-gray-100">
              Webhooks
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage webhooks for real-time event notifications.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
            aria-label="Create new webhook"
          >
            + New Webhook
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Test Result Notification */}
        {testResult && (
          <div
            className={`mb-4 p-3 rounded text-sm border ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}
          >
            {testResult.success
              ? `Test delivery successful (HTTP ${testResult.statusCode})`
              : `Test delivery failed: ${testResult.error || `HTTP ${testResult.statusCode}`}`}
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <WebhookList
            webhooks={items}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTest={handleTest}
            onViewLog={handleViewLog}
            onToggleActive={handleToggleActive}
          />
        </div>

        {/* Create/Edit Form Modal */}
        <WebhookForm
          open={formOpen}
          onClose={handleCloseForm}
          onSubmit={handleSubmit}
          editingWebhook={editingWebhook}
          newSecret={newSecret}
          onClearSecret={handleClearSecret}
        />

        {/* Delivery Log Modal */}
        <WebhookDeliveryLog
          open={logOpen}
          onClose={handleCloseLog}
          deliveries={deliveries}
          pagination={deliveryPagination}
          loading={deliveryLoading}
          onPageChange={handleLogPageChange}
        />
      </div>
    </div>
  );
}

export default WebhooksPage;
