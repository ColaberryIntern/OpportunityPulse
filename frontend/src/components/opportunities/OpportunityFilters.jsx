import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAllDimensions } from '../../store/slices/intelligenceSlice';

const selectClass = 'w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100';

function OpportunityFilters({ onFilterChange, filters = {}, isPublic = false }) {
  const dispatch = useDispatch();
  const { domains, capabilities, intents, monetizationAngles, maturityPhases, geographicTags } = useSelector((state) => state.intelligence);

  const [q, setQ] = useState(filters.q || '');
  const [category, setCategory] = useState(filters.category || '');
  const [status, setStatus] = useState(filters.status || '');
  const [sort, setSort] = useState(filters.sort || 'newest');
  const [minScore, setMinScore] = useState(filters.minScore || '');
  const [actionType, setActionType] = useState(filters.actionType || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [domain, setDomain] = useState(filters.domain || '');
  const [capability, setCapability] = useState(filters.capability || '');
  const [intent, setIntent] = useState(filters.intent || '');
  const [monetization, setMonetization] = useState(filters.monetization || '');
  const [maturity, setMaturity] = useState(filters.maturity || '');
  const [geo, setGeo] = useState(filters.geo || '');
  const [quadrant, setQuadrant] = useState(filters.quadrant || '');
  const debounceRef = useRef(null);

  // Fetch dimension options on mount (non-public only)
  useEffect(() => {
    if (!isPublic && domains.length === 0) {
      dispatch(fetchAllDimensions());
    }
  }, [dispatch, isPublic, domains.length]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = { sort };
      if (q) params.q = q;
      if (category) params.category = category;
      if (status) params.status = status;
      if (minScore) params.minScore = minScore;
      if (actionType) params.actionType = actionType;
      if (domain) params.domain = domain;
      if (capability) params.capability = capability;
      if (intent) params.intent = intent;
      if (monetization) params.monetization = monetization;
      if (maturity) params.maturity = maturity;
      if (geo) params.geo = geo;
      if (quadrant) params.quadrant = quadrant;
      onFilterChange(params);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, category, status, sort, minScore, actionType, domain, capability, intent, monetization, maturity, geo, quadrant]);

  const hasAdvancedFilters = domain || capability || intent || monetization || maturity || geo || quadrant;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
      {/* Primary filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="opp-filter-search" className="sr-only">Search opportunities</label>
          <input
            id="opp-filter-search"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search opportunities..."
            className={selectClass}
          />
        </div>
        <div>
          <label htmlFor="opp-filter-category" className="sr-only">Category</label>
          <input
            id="opp-filter-category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className={selectClass}
          />
        </div>
        {!isPublic && (
          <div>
            <label htmlFor="opp-filter-status" className="sr-only">Status</label>
            <select id="opp-filter-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        )}
        {!isPublic && (
          <div>
            <label htmlFor="opp-filter-action-type" className="sr-only">Action Type</label>
            <select id="opp-filter-action-type" value={actionType} onChange={(e) => setActionType(e.target.value)} className={selectClass}>
              <option value="">All Actions</option>
              <option value="BUILD">Build</option>
              <option value="BID">Bid</option>
              <option value="APPLY">Apply</option>
              <option value="PARTNER">Partner</option>
              <option value="INVEST">Invest</option>
              <option value="TEACH">Teach</option>
              <option value="IGNORE">Ignore</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="opp-filter-sort" className="sr-only">Sort order</label>
          <select id="opp-filter-sort" value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            {!isPublic && <option value="score">Highest Score</option>}
            <option value="value">Highest Value</option>
          </select>
        </div>
        {!isPublic && (
          <div>
            <label htmlFor="opp-filter-min-score" className="sr-only">Minimum score</label>
            <input
              id="opp-filter-min-score"
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="Min Score"
              min="0"
              max="100"
              className={selectClass}
            />
          </div>
        )}
      </div>

      {/* Advanced Filters Toggle (authenticated only) */}
      {!isPublic && (
        <div className="mt-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-accent hover:text-accent/80 font-medium flex items-center gap-1"
          >
            <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced Filters {hasAdvancedFilters ? `(${[domain, capability, intent, monetization, maturity, geo, quadrant].filter(Boolean).length} active)` : ''}
          </button>

          {showAdvanced && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">AI Domain</label>
                <select value={domain} onChange={(e) => setDomain(e.target.value)} className={selectClass}>
                  <option value="">All Domains</option>
                  {domains.map((d) => (
                    <option key={d.slug} value={d.slug}>{d.name} ({d.dataValues?.opportunityCount || 0})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">AI Capability</label>
                <select value={capability} onChange={(e) => setCapability(e.target.value)} className={selectClass}>
                  <option value="">All Capabilities</option>
                  {capabilities.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Strategic Intent</label>
                <select value={intent} onChange={(e) => setIntent(e.target.value)} className={selectClass}>
                  <option value="">All Intents</option>
                  {intents.map((i) => (
                    <option key={i.slug} value={i.slug}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Monetization</label>
                <select value={monetization} onChange={(e) => setMonetization(e.target.value)} className={selectClass}>
                  <option value="">All Angles</option>
                  {monetizationAngles.map((m) => (
                    <option key={m.slug} value={m.slug}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Maturity Phase</label>
                <select value={maturity} onChange={(e) => setMaturity(e.target.value)} className={selectClass}>
                  <option value="">All Phases</option>
                  {maturityPhases.map((m) => (
                    <option key={m.slug} value={m.slug}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Geography</label>
                <select value={geo} onChange={(e) => setGeo(e.target.value)} className={selectClass}>
                  <option value="">All Regions</option>
                  {geographicTags.map((g) => (
                    <option key={g.slug} value={g.slug}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Quadrant</label>
                <select value={quadrant} onChange={(e) => setQuadrant(e.target.value)} className={selectClass}>
                  <option value="">All Quadrants</option>
                  <option value="HD_LC">High Demand / Low Competition</option>
                  <option value="HD_HC">High Demand / High Competition</option>
                  <option value="LD_LC">Low Demand / Low Competition</option>
                  <option value="LD_HC">Low Demand / High Competition</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setDomain(''); setCapability(''); setIntent('');
                    setMonetization(''); setMaturity(''); setGeo(''); setQuadrant('');
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Clear Advanced
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OpportunityFilters;
