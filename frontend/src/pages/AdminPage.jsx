import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

const ROLE_OPTIONS = [
  { id: 1, name: 'admin' },
  { id: 2, name: 'consultant' },
  { id: 3, name: 'auditor' },
  { id: 4, name: 'devops' },
];

function AdminPage() {
  // Stats state
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  // Users state
  const [users, setUsers] = useState([]);
  const [usersPagination, setUsersPagination] = useState({ total: 0, page: 1, limit: 10, pages: 1 });
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Audit log state
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [auditPagination, setAuditPagination] = useState({ total: 0, page: 1, limit: 10, pages: 1 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);

  // Action feedback
  const [actionMsg, setActionMsg] = useState(null);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data.data);
    } catch (err) {
      setStatsError(err.response?.data?.message || 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async (page = 1) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = { page, limit: usersPagination.limit };
      if (search) params.search = search;
      const res = await api.get('/admin/users', { params });
      setUsers(res.data.data.users);
      setUsersPagination(res.data.data.pagination);
    } catch (err) {
      setUsersError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [search, usersPagination.limit]);

  // Fetch audit log
  const fetchAuditLog = useCallback(async (page = 1) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await api.get('/admin/audit-log', { params: { page, limit: auditPagination.limit } });
      setAuditLog(res.data.data.activities);
      setAuditPagination(res.data.data.pagination);
    } catch (err) {
      setAuditError(err.response?.data?.message || 'Failed to load audit log');
    } finally {
      setAuditLoading(false);
    }
  }, [auditPagination.limit]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  useEffect(() => {
    if (auditExpanded) {
      fetchAuditLog(1);
    }
  }, [auditExpanded, fetchAuditLog]);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  // Handle role change
  const handleRoleChange = async (userId, roleId) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { roleId: parseInt(roleId, 10) });
      setActionMsg({ type: 'success', text: 'Role updated successfully.' });
      fetchUsers(usersPagination.page);
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Failed to update role' });
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  // Handle subscription toggle
  const handleSubscriptionToggle = async (userId, currentPlan) => {
    const newPlan = currentPlan === 'premium' ? 'free' : 'premium';
    try {
      await api.patch(`/admin/users/${userId}/subscription`, { planType: newPlan });
      setActionMsg({ type: 'success', text: `Subscription changed to ${newPlan}.` });
      fetchUsers(usersPagination.page);
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Failed to update subscription' });
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  // Determine user's current subscription plan
  const getUserPlan = (user) => {
    if (user.subscriptions && user.subscriptions.length > 0) {
      return user.subscriptions[0].planType;
    }
    return 'free';
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary dark:text-gray-100">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage users, view system stats, and review audit logs.
          </p>
        </div>

        {/* Action feedback */}
        {actionMsg && (
          <div className={`mb-4 p-3 rounded text-sm border ${
            actionMsg.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}>
            {actionMsg.text}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Users</div>
            <div className="mt-1 text-3xl font-bold text-primary dark:text-gray-100">
              {statsLoading ? '...' : statsError ? '--' : stats?.totalUsers ?? 0}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Opportunities</div>
            <div className="mt-1 text-3xl font-bold text-primary dark:text-gray-100">
              {statsLoading ? '...' : statsError ? '--' : stats?.activeOpportunities ?? 0}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">System Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-lg font-semibold text-green-600 dark:text-green-400">Operational</span>
            </div>
            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {statsLoading ? '' : statsError ? '' : `${stats?.totalContent ?? 0} content items`}
            </div>
          </div>
        </div>

        {statsError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
            {statsError}
          </div>
        )}

        {/* User Management */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-primary dark:text-gray-100">User Management</h2>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by email or name..."
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Search
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchInput(''); }}
                  className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {usersError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
              {usersError}
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subscription</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No users found.</td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const plan = getUserPlan(user);
                      return (
                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{user.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{user.name || '--'}</td>
                          <td className="px-4 py-3 text-sm">
                            <select
                              value={user.role?.id || user.roleId}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              plan === 'premium'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                            }`}>
                              {plan}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <button
                              onClick={() => handleSubscriptionToggle(user.id, plan)}
                              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                                plan === 'premium'
                                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                  : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {plan === 'premium' ? 'Downgrade' : 'Upgrade'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Users Pagination */}
            {usersPagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Page {usersPagination.page} of {usersPagination.pages} ({usersPagination.total} total)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchUsers(usersPagination.page - 1)}
                    disabled={usersPagination.page <= 1}
                    className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchUsers(usersPagination.page + 1)}
                    disabled={usersPagination.page >= usersPagination.pages}
                    className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Audit Log (Collapsible) */}
        <div className="mb-8">
          <button
            onClick={() => setAuditExpanded(!auditExpanded)}
            className="flex items-center gap-2 text-lg font-semibold text-primary dark:text-gray-100 mb-4 hover:opacity-80 transition-opacity"
          >
            <svg
              className={`w-5 h-5 transform transition-transform ${auditExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Audit Log
          </button>

          {auditExpanded && (
            <>
              {auditError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
                  {auditError}
                </div>
              )}

              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Metadata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {auditLoading ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</td>
                        </tr>
                      ) : auditLog.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No audit log entries.</td>
                        </tr>
                      ) : (
                        auditLog.map((entry) => (
                          <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              {entry.user?.email || `User #${entry.userId}`}
                              {entry.user?.name && (
                                <span className="ml-1 text-gray-400 dark:text-gray-500">({entry.user.name})</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                                {entry.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {new Date(entry.created_at || entry.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                              {entry.metadata && Object.keys(entry.metadata).length > 0
                                ? JSON.stringify(entry.metadata)
                                : '--'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Audit Pagination */}
                {auditPagination.pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Page {auditPagination.page} of {auditPagination.pages} ({auditPagination.total} total)
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchAuditLog(auditPagination.page - 1)}
                        disabled={auditPagination.page <= 1}
                        className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => fetchAuditLog(auditPagination.page + 1)}
                        disabled={auditPagination.page >= auditPagination.pages}
                        className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
