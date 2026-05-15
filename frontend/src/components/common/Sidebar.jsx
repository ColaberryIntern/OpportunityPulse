import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { STRATEGIC_VIEWS } from '../../config/strategicNavConfig';
import { fetchBonfireFlag } from '../../services/bonfireService';

// Standalone "Dashboard" link — only shown to non-admins. For admins,
// /dashboard redirects to /admin/oied (Mission Control), and Mission
// Control is rendered inside OIED_SECTIONS below — so showing both would
// be a visible duplicate of the same destination.
const DASHBOARD_NAV_ITEM = {
  label: null,
  items: [
    { to: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  ],
};

const NAV_SECTIONS = [
  {
    label: 'Strategic Views',
    items: STRATEGIC_VIEWS.map((view) => ({
      to: view.path,
      label: view.key === 'all' ? 'All Opportunities' : view.label,
      icon: view.icon,
    })),
  },
  {
    label: 'Tools & Actions',
    items: [
      { to: '/action-tracker', label: 'Action Tracker', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { to: '/ai-tools', label: 'AI Tools', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
      { to: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/content', label: 'Content', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { to: '/forums', label: 'Forums', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
      { to: '/feedback', label: 'Feedback', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { to: '/alerts', label: 'Alerts', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
      { to: '/notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
      { to: '/subscription', label: 'Subscription', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
      { to: '/api-keys', label: 'API Keys', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
      { to: '/webhooks', label: 'Webhooks', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/roles', label: 'Roles', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', adminOnly: true },
      { to: '/admin', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', adminOnly: true },
    ],
  },
];

function Sidebar({ open, onClose }) {
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === 'admin';

  // Bonfire nav link is probed from the backend flag, not hard-coded.
  // Keeps the rest of the app oblivious to whether the prototype is on.
  const [bonfireEnabled, setBonfireEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchBonfireFlag().then((on) => { if (!cancelled) setBonfireEnabled(on); });
    return () => { cancelled = true; };
  }, []);

  // OIED unified-tool sidebar (admin only). v9.3 collapses the nine
  // legacy strategic-view items into a single "Channels" group so all
  // sources feel like one tool, not many. Each channel link points to
  // /admin/opportunities/my?channel=<key> — the channel filter on My
  // Opportunities. Legacy /government, /talent, /freelance, etc. routes
  // still work for direct URLs but no longer appear in the sidebar.
  const ICON = {
    star:    'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    pin:     'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    list:    'M4 6h16M4 10h16M4 14h16M4 18h16',
  };
  const OIED_SECTIONS = isAdmin ? [
    {
      label: 'OIED',
      items: [
        { to: '/admin/oied', label: '🧭 Mission Control', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      ],
    },
    {
      label: 'Intelligence',
      items: [
        { to: '/admin/deep-research', label: '🧠 Deep Research', icon: ICON.star },
        { to: '/admin/deep-research/execution', label: '🚀 Execution Intelligence', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { to: '/admin/deep-research/portfolio', label: '📊 Portfolio Intelligence', icon: 'M3 13a4 4 0 014-4h10a4 4 0 014 4v6H3v-6z' },
        { to: '/admin/deep-research/observatory', label: '🔭 Ecosystem Observatory', icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9v18m9-9H3' },
        { to: '/admin/deep-research/planning', label: '🛰 Executive Planning', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
        { to: '/admin/deep-research/briefings', label: '📬 Briefing Center', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
      ],
    },
    {
      label: 'Channels',
      items: [
        { to: '/admin/opportunities/my',                        label: '📌 All Opportunities',  icon: ICON.list },
        { to: '/admin/opportunities/my?channel=strategic',      label: '🎯 Strategic Patterns',  icon: ICON.star },
        { to: '/admin/opportunities/my?channel=bonfire',        label: '🔥 Bonfire',             icon: ICON.list },
        { to: '/admin/opportunities/my?channel=government',     label: '🏛 Government',          icon: ICON.list },
        { to: '/admin/opportunities/my?channel=talent',         label: '👥 Talent',              icon: ICON.list },
        { to: '/admin/opportunities/my?channel=private-sector', label: '🧠 News',                icon: ICON.list },
        { to: '/admin/opportunities/my?channel=freelance',      label: '💼 Freelance',           icon: ICON.list },
        { to: '/admin/opportunities/my?channel=capital',        label: '💰 Capital',             icon: ICON.list },
        { to: '/admin/opportunities/my?channel=research',       label: '🔬 Research',            icon: ICON.list },
      ],
    },
    {
      label: 'Pursue',
      items: [
        { to: '/admin/opportunities/recommendations', label: '🎯 Top Actions', icon: ICON.star },
        { to: '/admin/opportunities/review', label: '📋 Review Queue', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
        { to: '/admin/opportunities/execution', label: '🚀 Execution Queue', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { to: '/admin/briefing', label: '📨 Daily Briefing', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
      ],
    },
    {
      label: 'Operate',
      items: [
        // 🩺 Source Health is intentionally first in Operate — it's the
        // "is anything broken right now?" surface. Buried at the bottom
        // (where it was originally) made it easy to miss; ops pages need
        // to be visible without scrolling.
        { to: '/admin/data-sources', label: '🩺 Source Health', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { to: '/admin/documents', label: '📁 Document Vault', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { to: '/admin/revenue', label: '💰 Revenue Dashboard', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        { to: '/admin/opportunities/bundles', label: '🧩 Bundles', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
        { to: '/ai-tools',     label: '🛠 AI Tools',         icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
        { to: '/admin/triggers', label: '⚡ Trigger Logs', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { to: '/admin/profile', label: '🧬 Business Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
        { to: '/admin/billing', label: '💳 Billing', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
      ],
    },
  ] : [];

  // Bonfire deep-dive pages stay reachable for direct URLs. The sidebar
  // entry is kept (admin-only, behind the flag) for analysts who want the
  // dedicated portal-grouped view; the main Bonfire flow is via the
  // Channels group above.
  const BONFIRE_SECTION = (bonfireEnabled && isAdmin) ? [
    {
      label: 'Bonfire (deep dive)',
      items: [
        { to: '/bonfire', label: '🔥 Vendor Hub', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.24 17 7.341 18.75 11.166 16.657 10.657 17.657 18.657z' },
        { to: '/bonfire/strategic', label: '🎯 Strategist Panel', icon: ICON.star },
      ],
    },
  ] : [];

  // Strategic-view items at the top of NAV_SECTIONS no longer apply for
  // admins (collapsed into the Channels group above). For non-admin users
  // and public marketing surfaces, the legacy Strategic Views config
  // stays in place. The standalone "Dashboard" link is hidden for admins
  // because /dashboard redirects to /admin/oied — Mission Control is the
  // single canonical home.
  const filteredNav = isAdmin
    ? NAV_SECTIONS.filter((s) => s.label !== 'Strategic Views' && s.label !== 'Tools & Actions')
    : NAV_SECTIONS;
  const navSections = [
    ...(isAdmin ? [] : [DASHBOARD_NAV_ITEM]),
    ...OIED_SECTIONS,
    ...BONFIRE_SECTION,
    ...filteredNav,
  ];

  const linkClasses = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2 rounded-md text-sm font-medium transition ${
      isActive
        ? 'bg-accent text-white'
        : 'text-gray-300 hover:bg-secondary hover:text-white'
    }`;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-14 left-0 bottom-0 w-56 bg-primary z-40 transform transition-transform lg:translate-x-0 overflow-y-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <nav className="flex flex-col gap-0.5 p-3 mt-2" aria-label="Primary navigation">
          {navSections.map((section, sIdx) => {
            const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx}>
                {section.label && (
                  <div className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {section.label}
                  </div>
                )}
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/opportunities'}
                    className={linkClasses}
                    onClick={onClose}
                    aria-label={item.label}
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
