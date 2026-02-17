import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchUnreadCount } from '../../store/slices/alertSlice';

function AlertBell() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { unreadCount } = useSelector((state) => state.alerts);

  useEffect(() => {
    dispatch(fetchUnreadCount());

    const interval = setInterval(() => {
      if (!document.hidden) {
        dispatch(fetchUnreadCount());
      }
    }, 60000);

    const handleVisibility = () => {
      if (!document.hidden) {
        dispatch(fetchUnreadCount());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [dispatch]);

  return (
    <button
      onClick={() => navigate('/alerts')}
      className="relative p-1 rounded hover:bg-secondary transition"
      aria-label="Alerts"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-highlight text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default AlertBell;
