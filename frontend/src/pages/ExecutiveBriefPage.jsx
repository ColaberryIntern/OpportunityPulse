import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchExecutiveBrief } from '../store/slices/actionEngineSlice';
import actionEngineService from '../services/actionEngineService';
import SEOHead from '../components/common/SEOHead';

const ACTION_TYPE_COLORS = {
  BUILD: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
  BID: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  APPLY: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
  PARTNER: 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300',
  INVEST: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  TEACH: 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
};

const QUADRANT_SHORT = {
  'High Demand / Low Competition': { label: 'HD/LC', color: 'text-green-600 dark:text-green-400' },
  'High Demand / High Competition': { label: 'HD/HC', color: 'text-yellow-600 dark:text-yellow-400' },
  'Low Demand / Low Competition': { label: 'LD/LC', color: 'text-gray-500 dark:text-gray-400' },
  'Low Demand / High Competition': { label: 'LD/HC', color: 'text-red-500 dark:text-red-400' },
};

function formatCurrency(value) {
  if (!value || value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function ExecutiveBriefPage() {
  const dispatch = useDispatch();
  const { executiveBrief, briefLoading, error } = useSelector((state) => state.actionEngine);
  const [trackedIds, setTrackedIds] = useState(new Set());
  const [trackingId, setTrackingId] = useState(null);

  useEffect(() => {
    dispatch(fetchExecutiveBrief());
  }, [dispatch]);

  const handleTrack = async (opp) => {
    setTrackingId(opp.id);
    try {
      await actionEngineService.createAction({
        opportunityId: opp.id,
        actionType: opp.actionType,
      });
      setTrackedIds((prev) => new Set([...prev, opp.id]));
    } catch (err) {
      if (err.response?.status === 409) {
        // Already tracked
        setTrackedIds((prev) => new Set([...prev, opp.id]));
      }
    }
    setTrackingId(null);
  };

  if (briefLoading) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            {error}
          </div>
        </div>
      </div>
    );
  }

  const brief = executiveBrief;

  return (
    <div className="p-6">
      <SEOHead title="Executive Brief" path="/executive-brief" />
      <div className="max-w-4xl mx-auto">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 mb-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-80">
              {brief?.briefDate ? new Date(brief.briefDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Today'}
            </span>
            <span className="text-xs bg-white/20 px-2 py-1 rounded">AI-Generated</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">{brief?.headline || 'Executive Intelligence Brief'}</h1>
          <p className="text-sm opacity-90">{brief?.executiveSummary}</p>
        </div>

        {/* Market Stats Bar */}
        {brief?.marketStats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <StatCard label="Active Opportunities" value={brief.marketStats.totalActive} />
            <StatCard label="Classified" value={brief.marketStats.classified} />
            <StatCard label="Avg AI Score" value={brief.marketStats.averageScore} suffix="/100" />
            <StatCard
              label="Revenue Potential"
              value={formatCurrency(brief.revenuePotentialEstimate)}
            />
            <StatCard label="Expiring This Week" value={brief.marketStats.expiringSoon || 0} />
          </div>
        )}

        {/* By the Numbers — Type & Domain Breakdown */}
        {brief?.marketStats?.typeCounts && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">By Type</h3>
              <div className="space-y-2">
                {Object.entries(brief.marketStats.typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">{type.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, (count / brief.marketStats.totalActive) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-900 dark:text-gray-100 w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {brief.marketStats.domainBreakdown?.length > 0 && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Top AI Domains</h3>
                <div className="space-y-2">
                  {brief.marketStats.domainBreakdown.slice(0, 8).map((d) => (
                    <div key={d.domain} className="flex items-center justify-between">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{d.domain}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${Math.min(100, (d.count / (brief.marketStats.domainBreakdown[0]?.count || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100 w-8 text-right">{d.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sector Highlights */}
        {brief?.sectorHighlights?.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Sector Highlights</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {brief.sectorHighlights.map((sector, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sector.sector}</h3>
                    <span className="text-xs font-bold text-accent">{sector.count} opps</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{sector.summary}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top Opportunities */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Top Opportunities</h2>
          <div className="space-y-3">
            {(brief?.topOpportunities || []).map((opp, i) => (
              <div key={opp.id} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-400 dark:text-gray-500">#{i + 1}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_TYPE_COLORS[opp.actionType] || 'bg-gray-100 text-gray-600'}`}>
                        {opp.actionType}
                      </span>
                      {opp.quadrant && QUADRANT_SHORT[opp.quadrant] && (
                        <span className={`text-xs font-medium ${QUADRANT_SHORT[opp.quadrant].color}`}>
                          {QUADRANT_SHORT[opp.quadrant].label}
                        </span>
                      )}
                    </div>
                    <Link to={`/opportunities/${opp.id}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-accent">
                      {opp.title}
                    </Link>
                    {opp.recommendedAction && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{opp.recommendedAction}</p>
                    )}
                  </div>
                  <div className="ml-4 text-right shrink-0">
                    <span className="text-lg font-bold text-primary dark:text-accent">{opp.aiScore}</span>
                    <p className="text-xs text-gray-400 dark:text-gray-500">AI Score</p>
                    {opp.value && (
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mt-1">
                        ${parseFloat(opp.value).toLocaleString()}
                      </p>
                    )}
                    <button
                      onClick={() => handleTrack(opp)}
                      disabled={trackingId === opp.id || trackedIds.has(opp.id)}
                      className={`mt-2 px-3 py-1 text-xs font-medium rounded-md ${
                        trackedIds.has(opp.id)
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
                          : 'bg-accent text-white hover:bg-accent/90 disabled:opacity-50'
                      }`}
                    >
                      {trackedIds.has(opp.id) ? 'Tracked' : trackingId === opp.id ? '...' : 'Track'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {(!brief?.topOpportunities || brief.topOpportunities.length === 0) && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                No classified opportunities yet. Run the classification engine from the Admin panel.
              </div>
            )}
          </div>
        </section>

        {/* Recommended Actions */}
        {brief?.recommendedActions?.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Recommended Actions</h2>
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
              {brief.recommendedActions.map((action, i) => (
                <div key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
                      {action.priority || i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{action.action}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{action.reasoning}</p>
                      {action.deadline && (
                        <span className="text-xs text-red-500 dark:text-red-400 mt-1 inline-block">{action.deadline}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Market Pulse */}
          {brief?.marketPulse && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Market Pulse</h2>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">{brief.marketPulse}</p>
              </div>
            </section>
          )}

          {/* Risk Flags + Trend Signals */}
          <section>
            {brief?.riskFlags?.length > 0 && (
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Risk Flags</h2>
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
                  <ul className="space-y-1">
                    {brief.riskFlags.map((flag, i) => (
                      <li key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5">&#9888;</span>
                        {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {brief?.trendSignals?.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Trend Signals</h2>
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
                  <ul className="space-y-1">
                    {brief.trendSignals.map((signal, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                        <span className="shrink-0 text-accent mt-0.5">&#8599;</span>
                        {signal}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {value}{suffix}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

export default ExecutiveBriefPage;
