import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logout } from '../../store/slices/authSlice';
import AlertBell from '../alerts/AlertBell';

function Header({ onToggleSidebar }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <header className="bg-primary text-white shadow-md sticky top-0 z-30">
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

        {/* Right: alerts + user info + logout */}
        <div className="flex items-center gap-4">
          <AlertBell />
          {user && (
            <span className="hidden sm:inline text-sm text-gray-300">
              {user.name || user.email}
            </span>
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
