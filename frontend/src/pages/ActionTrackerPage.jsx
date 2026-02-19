import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchActions, fetchAnalytics, updateAction, deleteActionThunk } from '../store/slices/actionEngineSlice';
import SEOHead from '../components/common/SEOHead';

const ACTION_TYPE_COLORS = {
  BUILD: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
  BID: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  APPLY: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
  PARTNER: 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300',
  INVEST: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  TEACH: 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
};

const STATUS_COLORS = {
  planned: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  in_progress: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  executed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  abandoned: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In Progress',
  executed: 'Executed',
  abandoned: 'Abandoned',
};

function ActionTrackerPage() {
  const dispatch = useDispatch();
  const { actions, actionsPagination, actionsLoading, analytics, analyticsLoading, error } = useSelector((state) => state.actionEngine);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchActions({ status: statusFilter || undefined, page }));
    dispatch(fetchAnalytics());
  }, [dispatch, statusFilter, page]);

  const handleStatusChange = (actionId, newStatus) => {
    dispatch(updateAction({ id: actionId, status: newStatus }));
  };

  const handleRevenueChange = (actionId, revenue) => {
    if (revenue !== '') {
      dispatch(updateAction({ id: actionId, revenueGenerated: revenue }));
    }
  };

  const handleDelete = (actionId) => {
    if (window.confirm('Remove this tracked action?')) {
      dispatch(deleteActionThunk(actionId));
    }
  };

  return (
    <div className="p-6">
      <SEOHead title="Action Tracker" path="/action-tracker" />
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-primary dark:text-white mb-6">Action Tracker</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Analytics Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <AnalyticsCard label="Signals Processed" value={analytics?.signalsProcessed} loading={analyticsLoading} />
          <AnalyticsCard label="Actions Tracked" value={analytics?.signalsActedOn} loading={analyticsLoading} />
          <AnalyticsCard label="Conversion Rate" value={analytics?.conversionRate ? `${analytics.conversionRate}%` : '0%'} loading={analyticsLoading} />
          <AnalyticsCard
            label="Revenue Influenced"
            value={analytics?.totalRevenue ? `$${Math.round(analytics.totalRevenue).toLocaleString()}` : '$0'}
            loading={analyticsLoading}
          />
        </div>

        {/* Funnel Visualization */}
        {analytics?.byStatus && analytics.byStatus.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Action Funnel</h3>
            <div className="flex items-end gap-2 h-24">
              {['planned', 'in_progress', 'executed', 'abandoned'].map((status) => {
                const item = analytics.byStatus.find((s) => s.status === status);
                const count = item ? item.count : 0;
                const maxCount = Math.max(...analytics.byStatus.map((s) => s.count), 1);
                const heightPct = Math.max(10, (count / maxCount) * 100);
                return (
                  <div key={status} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{count}</span>
                    <div
                      className={`w-full rounded-t ${STATUS_COLORS[status].split(' ')[0]}`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABELS[status]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-600 dark:text-gray-400">Filter:</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All Statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="executed">Executed</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>

        {/* Actions List */}
        {actionsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No tracked actions yet.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Track opportunities from the <Link to="/opportunities" className="text-accent hover:underline">Opportunities</Link> page.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action) => (
              <div key={action.id} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_TYPE_COLORS[action.actionType] || 'bg-gray-100 text-gray-600'}`}>
                        {action.actionType}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[action.status]}`}>
                        {STATUS_LABELS[action.status]}
                      </span>
                    </div>
                    <Link
                      to={`/opportunities/${action.opportunity?.id || action.opportunityId}`}
                      className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-accent"
                    >
                      {action.opportunity?.title || `Opportunity #${action.opportunityId}`}
                    </Link>
                    {action.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{action.notes}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Tracked {new Date(action.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="ml-4 shrink-0 flex items-center gap-2">
                    {/* Status dropdown */}
                    <select
                      value={action.status}
                      onChange={(e) => handleStatusChange(action.id, e.target.value)}
                      className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="planned">Planned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="executed">Executed</option>
                      <option value="abandoned">Abandoned</option>
                    </select>

                    {/* Revenue input for executed */}
                    {action.status === 'executed' && (
                      <input
                        type="number"
                        placeholder="Revenue $"
                        defaultValue={action.revenueGenerated || ''}
                        onBlur={(e) => handleRevenueChange(action.id, e.target.value)}
                        className="w-24 text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-100"
                      />
                    )}

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(action.id)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1"
                      title="Remove"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {actionsPagination && actionsPagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
              Page {actionsPagination.page} of {actionsPagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(actionsPagination.totalPages, p + 1))}
              disabled={page === actionsPagination.totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsCard({ label, value, loading }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
      {loading ? (
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto w-16" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value ?? '-'}</p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

export default ActionTrackerPage;
