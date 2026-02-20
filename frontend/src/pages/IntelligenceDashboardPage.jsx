import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMetaSignals, fetchHeatmap, fetchClusters } from '../store/slices/intelligenceSlice';
import StrategicNav from '../components/navigation/StrategicNav';

function TrendArrow({ direction }) {
  if (direction === 'up') {
    return <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>;
  }
  if (direction === 'down') {
    return <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>;
  }
  return <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>;
}

function SignalBar({ value, max = 100 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  let color = 'bg-green-500';
  if (pct > 70) color = 'bg-red-500';
  else if (pct > 40) color = 'bg-amber-500';
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MetaSignalsPanel({ signals, loading }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-primary dark:text-gray-100 mb-4">AI Meta Signals</h2>
        <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-accent border-t-transparent rounded-full" /></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-primary dark:text-gray-100 mb-1">AI Meta Signals</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Trend-level indicators aggregated from all opportunities (last 30 days)</p>
      {signals.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No signals computed yet.</p>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => (
            <div key={signal.id} className="flex items-center gap-3">
              <TrendArrow direction={signal.trendDirection} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{signal.name}</span>
                  <span className="text-sm font-bold text-primary dark:text-gray-100 ml-2">
                    {signal.currentValue != null ? Number(signal.currentValue).toFixed(1) : '--'}
                  </span>
                </div>
                <SignalBar value={signal.currentValue || 0} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getHeatColor(value, max) {
  if (!max || !value) return 'bg-gray-100 dark:bg-gray-800';
  const ratio = value / max;
  if (ratio > 0.75) return 'bg-red-500 text-white';
  if (ratio > 0.5) return 'bg-orange-400 text-white';
  if (ratio > 0.25) return 'bg-amber-300 dark:text-gray-900';
  if (ratio > 0) return 'bg-green-200 dark:text-gray-900';
  return 'bg-gray-100 dark:bg-gray-800 text-gray-400';
}

function DomainHeatmap({ heatmap, loading }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-primary dark:text-gray-100 mb-4">Domain Activity Heatmap</h2>
        <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-accent border-t-transparent rounded-full" /></div>
      </div>
    );
  }

  if (!heatmap || heatmap.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-primary dark:text-gray-100 mb-4">Domain Activity Heatmap</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No classification data available yet.</p>
      </div>
    );
  }

  const maxCount = Math.max(...heatmap.map((r) => Number(r.opportunity_count) || 0));
  const maxDemand = Math.max(...heatmap.map((r) => Number(r.avg_demand) || 0));
  const maxComp = Math.max(...heatmap.map((r) => Number(r.avg_competition) || 0));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-primary dark:text-gray-100 mb-1">Domain Activity Heatmap</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">AI domain verticals with opportunity count, demand, and competition scores</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400">Domain</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Opportunities</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Avg Demand</th>
              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">Avg Competition</th>
            </tr>
          </thead>
          <tbody>
            {heatmap.map((row) => (
              <tr key={row.domain_slug} className="border-b border-gray-100 dark:border-gray-700/50">
                <td className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.domain_name}</td>
                <td className="py-2 px-2">
                  <div className={`rounded px-2 py-1 text-center text-xs font-semibold ${getHeatColor(Number(row.opportunity_count), maxCount)}`}>
                    {row.opportunity_count}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <div className={`rounded px-2 py-1 text-center text-xs font-semibold ${getHeatColor(Number(row.avg_demand), maxDemand)}`}>
                    {row.avg_demand != null ? Number(row.avg_demand).toFixed(1) : '--'}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <div className={`rounded px-2 py-1 text-center text-xs font-semibold ${getHeatColor(Number(row.avg_competition), maxComp)}`}>
                    {row.avg_competition != null ? Number(row.avg_competition).toFixed(1) : '--'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
        <span>Intensity:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> Low</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-300 inline-block" /> Medium</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" /> High</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Very High</span>
      </div>
    </div>
  );
}

function ClusterSummary({ clusters, loading }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-primary dark:text-gray-100 mb-4">Top Clusters</h2>
        <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-accent border-t-transparent rounded-full" /></div>
      </div>
    );
  }

  const topClusters = [...clusters]
    .sort((a, b) => (b.opportunityCount || 0) - (a.opportunityCount || 0))
    .slice(0, 5);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-primary dark:text-gray-100 mb-1">Top Clusters</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Highest-volume auto-detected opportunity clusters</p>
      {topClusters.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No clusters detected yet.</p>
      ) : (
        <div className="space-y-3">
          {topClusters.map((cluster) => (
            <div key={cluster.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{cluster.name}</p>
                <div className="flex gap-2 mt-0.5">
                  {cluster.domain?.name && <span className="text-xs text-blue-600 dark:text-blue-400">{cluster.domain.name}</span>}
                  {cluster.capability?.name && <span className="text-xs text-purple-600 dark:text-purple-400">{cluster.capability.name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 ml-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-primary dark:text-gray-100">{cluster.opportunityCount || 0}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">opps</p>
                </div>
                {cluster.growthRate != null && (
                  <span className={`text-xs font-medium ${Number(cluster.growthRate) > 0 ? 'text-green-600' : Number(cluster.growthRate) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {Number(cluster.growthRate) > 0 ? '+' : ''}{Number(cluster.growthRate).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntelligenceDashboardPage() {
  const dispatch = useDispatch();
  const { metaSignals, heatmap, clusters, signalsLoading, heatmapLoading, clustersLoading, error } = useSelector((state) => state.intelligence);

  useEffect(() => {
    dispatch(fetchMetaSignals());
    dispatch(fetchHeatmap());
    dispatch(fetchClusters());
  }, [dispatch]);

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary dark:text-gray-100">Intelligence Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Multi-dimensional AI market intelligence across domains, signals, and strategic clusters
          </p>
        </div>

        <StrategicNav />

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MetaSignalsPanel signals={metaSignals} loading={signalsLoading} />
          <ClusterSummary clusters={clusters} loading={clustersLoading} />
        </div>

        <div className="mt-6">
          <DomainHeatmap heatmap={heatmap} loading={heatmapLoading} />
        </div>
      </div>
    </div>
  );
}

export default IntelligenceDashboardPage;
