import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

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

function NotificationBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.data.count);
    } catch {
      // Silently fail for polling
    }
  }, []);

  // Fetch recent notifications for dropdown
  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications', { params: { page: 1, limit: 5 } });
      setNotifications(res.data.data.notifications);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount();

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchUnreadCount();
      }
    }, 30000);

    const handleVisibility = () => {
      if (!document.hidden) {
        fetchUnreadCount();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When dropdown opens, fetch recent
  useEffect(() => {
    if (dropdownOpen) {
      fetchRecent();
    }
  }, [dropdownOpen, fetchRecent]);

  // Toggle dropdown
  const handleToggle = () => {
    setDropdownOpen((prev) => !prev);
  };

  // Mark single notification as read
  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  };

  // Navigate to full notifications page
  const handleViewAll = () => {
    setDropdownOpen(false);
    navigate('/notifications');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative p-1 rounded hover:bg-secondary transition"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-highlight text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No notifications yet.
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => !notification.read && handleMarkRead(notification.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                    !notification.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {!notification.read && (
                        <span className="inline-block w-2 h-2 rounded-full bg-accent"></span>
                      )}
                      {notification.read && (
                        <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${
                        !notification.read
                          ? 'font-semibold text-gray-900 dark:text-gray-100'
                          : 'font-normal text-gray-700 dark:text-gray-300'
                      }`}>
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {timeAgo(notification.created_at || notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleViewAll}
              className="w-full text-center text-sm text-accent hover:text-accent/80 font-medium py-1 transition-colors"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
