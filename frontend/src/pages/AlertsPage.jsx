import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchAlerts,
  fetchUnreadCount,
  markAlertAsRead,
  markAllAlertsAsRead,
  deleteAlert,
} from '../store/slices/alertSlice';
import AlertList from '../components/alerts/AlertList';
import AlertPreferencesForm from '../components/alerts/AlertPreferencesForm';

function AlertsPage() {
  const dispatch = useDispatch();
  const { items, pagination, loading, error } = useSelector(
    (state) => state.alerts
  );
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const loadAlerts = useCallback(
    (page = 1) => {
      dispatch(
        fetchAlerts({
          type: typeFilter || undefined,
          severity: severityFilter || undefined,
          page,
          limit: 20,
        })
      );
    },
    [dispatch, typeFilter, severityFilter]
  );

  useEffect(() => {
    loadAlerts(1);
  }, [loadAlerts]);

  const handlePageChange = (newPage) => {
    loadAlerts(newPage);
  };

  const handleMarkRead = async (id) => {
    await dispatch(markAlertAsRead(id));
    dispatch(fetchUnreadCount());
  };

  const handleMarkAllRead = async () => {
    await dispatch(markAllAlertsAsRead());
    dispatch(fetchUnreadCount());
  };

  const handleDelete = async (id) => {
    await dispatch(deleteAlert(id));
    dispatch(fetchUnreadCount());
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-6">Alerts</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alert List */}
          <div className="lg:col-span-2">
            {/* Filters */}
            <div className="flex gap-3 mb-4">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">All Types</option>
                <option value="new_opportunity">New Opportunity</option>
                <option value="score_change">Score Change</option>
                <option value="trend_alert">Trend Alert</option>
                <option value="system">System</option>
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="important">Important</option>
              </select>
            </div>

            <AlertList
              alerts={items}
              pagination={pagination}
              onPageChange={handlePageChange}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
              onDelete={handleDelete}
              loading={loading}
            />
          </div>

          {/* Preferences */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Alert Preferences
            </h2>
            <AlertPreferencesForm />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AlertsPage;
