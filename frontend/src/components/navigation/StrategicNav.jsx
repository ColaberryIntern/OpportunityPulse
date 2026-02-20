import React from 'react';
import { NavLink } from 'react-router-dom';
import { STRATEGIC_VIEWS } from '../../config/strategicNavConfig';

function StrategicNav() {
  return (
    <nav
      className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide"
      aria-label="Strategic views"
    >
      {STRATEGIC_VIEWS.map((view) => (
        <NavLink
          key={view.key}
          to={view.path}
          end={view.path === '/opportunities'}
          className={({ isActive }) =>
            `px-3 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`
          }
        >
          {view.isAlpha && (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={view.icon} />
            </svg>
          )}
          {view.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default StrategicNav;
