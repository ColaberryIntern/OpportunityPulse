import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

const TYPE_ICONS = {
  alert: (
    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
  forum_reply: (
    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  opportunity_match: (
    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  subscription: (
    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  system: (
    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const fetchNotifications = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: pagination.limit };
      if (unreadOnly) params.unreadOnly = 'true';
      const res = await api.get('/notifications', { params });
      setNotifications(res.data.data.notifications);
      setPagination(res.data.data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, pagination.limit]);

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setActionMsg({ type: 'success', text: 'Notification marked as read.' });
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Failed to mark as read' });
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setActionMsg({ type: 'success', text: 'All notifications marked as read.' });
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Failed to mark all as read' });
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary dark:text-gray-100">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Stay up to date with alerts, replies, and system updates.
            </p>
          </div>
          {hasUnread && (
            <button
              onClick={handleMarkAllRead}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Mark all as read
            </button>
          )}
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

        {/* Filter Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setUnreadOnly(false)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              !unreadOnly
                ? 'bg-accent text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setUnreadOnly(true)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              unreadOnly
                ? 'bg-accent text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Unread only
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Notification List */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              {unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 px-4 py-4 transition-colors ${
                    !notification.read
                      ? 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {/* Type Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {TYPE_ICONS[notification.type] || TYPE_ICONS.system}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${
                        !notification.read
                          ? 'font-semibold text-gray-900 dark:text-gray-100'
                          : 'font-normal text-gray-700 dark:text-gray-300'
                      }`}>
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="inline-block w-2 h-2 rounded-full bg-accent flex-shrink-0"></span>
                      )}
                    </div>
                    {notification.message && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {notification.message}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {timeAgo(notification.created_at || notification.createdAt)}
                      </span>
                      <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {notification.type.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Read action */}
                  <div className="flex-shrink-0">
                    {!notification.read ? (
                      <button
                        onClick={() => handleMarkRead(notification.id)}
                        className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
                        title="Mark as read"
                      >
                        Mark read
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Read</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Page {pagination.page} of {pagination.pages} ({pagination.total} total)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchNotifications(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchNotifications(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationsPage;
