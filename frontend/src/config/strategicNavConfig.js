/**
 * Strategic navigation configuration.
 * Single source of truth for all 9 strategic views.
 */

export const STRATEGIC_VIEWS = [
  {
    key: 'all',
    label: 'All',
    path: '/opportunities',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    filterPreset: {},
    isOpportunityList: true,
    description: 'All opportunities across every sector and type',
    subFilters: ['category', 'status', 'actionType', 'sort', 'minScore'],
  },
  {
    key: 'government',
    label: 'Government',
    path: '/government',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    filterPreset: { type: 'gov_contract,grant' },
    isOpportunityList: true,
    description: 'Federal contracts, grants, and government procurement',
    subFilters: ['category', 'status', 'actionType', 'sort', 'minScore', 'geo'],
  },
  {
    key: 'private-sector',
    label: 'Private Sector',
    path: '/private-sector',
    icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    filterPreset: { type: 'ai_news' },
    isOpportunityList: true,
    description: 'Corporate AI activity, vendor news, and partnership signals',
    subFilters: ['category', 'sort', 'domain', 'capability', 'intent'],
  },
  {
    key: 'talent',
    label: 'Talent',
    path: '/talent',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    filterPreset: { type: 'ai_job' },
    isOpportunityList: true,
    description: 'AI job openings, talent demand signals, and workforce trends',
    subFilters: ['category', 'sort', 'minScore', 'geo', 'capability'],
  },
  {
    key: 'freelance',
    label: 'Freelance',
    path: '/freelance',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    filterPreset: { type: 'freelance' },
    isOpportunityList: false,
    description: 'AI freelance projects, demand trends, and actionable opportunities',
    subFilters: ['category', 'sort', 'minScore', 'capability'],
  },
  {
    key: 'capital',
    label: 'Capital',
    path: '/capital',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    filterPreset: { type: 'investment' },
    isOpportunityList: true,
    description: 'Investment opportunities, funding rounds, and capital allocation signals',
    subFilters: ['category', 'sort', 'minScore', 'monetization', 'maturity'],
  },
  {
    key: 'strategic-clusters',
    label: 'Clusters',
    path: '/strategic-clusters',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    filterPreset: {},
    isOpportunityList: false,
    description: 'Auto-detected opportunity clusters across AI domains',
  },
  {
    key: 'alpha',
    label: 'Alpha',
    path: '/alpha',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    filterPreset: { quadrant: 'HD_LC', minScore: 70, sort: 'score' },
    isOpportunityList: true,
    description: 'High-leverage opportunities: high demand, low competition, strong AI score',
    subFilters: ['category', 'actionType', 'domain', 'capability'],
    isAlpha: true,
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    path: '/intelligence',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    filterPreset: {},
    isOpportunityList: false,
    description: 'Multi-dimensional AI market intelligence',
  },
];

export function getViewByPath(path) {
  return STRATEGIC_VIEWS.find(v => v.path === path);
}

export function getViewByKey(key) {
  return STRATEGIC_VIEWS.find(v => v.key === key);
}

export const LEGACY_REDIRECTS = {
  '/gov-contracts': '/government',
  '/jobs': '/talent',
  '/investments': '/capital',
  '/grants': '/government',
  '/ai-news': '/private-sector',
};
