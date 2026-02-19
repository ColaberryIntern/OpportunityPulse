import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { logout } from '../../store/slices/authSlice';
import { toggleDarkMode } from '../../store/slices/uiSlice';
import AlertBell from '../alerts/AlertBell';
import NotificationBell from './NotificationBell';

function Header({ onToggleSidebar }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const darkMode = useSelector((state) => state.ui.darkMode);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <header className="bg-primary text-white shadow-md sticky top-0 z-30" role="banner">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1 rounded hover:bg-secondary transition"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-lg font-bold tracking-wide">Opportunity Pulse</span>
        </div>

        {/* Right: dark mode + alerts + user info + logout */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => dispatch(toggleDarkMode())}
            className="p-1.5 rounded hover:bg-secondary transition"
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <AlertBell />
          <NotificationBell />
          {user && (
            <Link
              to="/profile"
              className="hidden sm:inline text-sm text-gray-300 hover:text-white transition"
            >
              {user.name || user.email}
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1.5 rounded bg-highlight hover:bg-red-600 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
