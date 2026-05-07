// 7-card channel grid for the OIED Mission Control dashboard.
// Renders active counts + the top-priority opp per channel + a click
// target that drills into /admin/opportunities/my?channel=<key>.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getChannelsSummary } from '../../services/oiedService';

const COLOR_BORDER = {
  purple: 'border-purple-600',
  orange: 'border-orange-600',
  blue:   'border-blue-700',
  cyan:   'border-cyan-600',
  gray:   'border-gray-600',
  green:  'border-green-600',
  amber:  'border-amber-600',
};

function fmtUSD(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000_000) return '$' + (v / 1_000_000_000).toFixed(1) + 'B';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function ChannelCard({ ch }) {
  const border = COLOR_BORDER[ch.color] || COLOR_BORDER.gray;
  return (
    <Link
      to={`/admin/opportunities/my?channel=${encodeURIComponent(ch.key)}`}
      className={`block bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 ${border} p-4 hover:shadow-md transition`}
      data-testid={`channel-card-${ch.key}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {ch.icon} {ch.label}
        </span>
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{ch.active_count.toLocaleString()}</span>
      </div>
      {ch.total_value > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Total value: <span className="font-mono">{fmtUSD(ch.total_value)}</span>
        </div>
      )}
      {ch.top_opp && (
        <div className="text-xs text-gray-600 dark:text-gray-400 truncate" title={ch.top_opp.title}>
          Top: {ch.top_opp.title}
        </div>
      )}
      {!ch.top_opp && ch.active_count === 0 && (
        <div className="text-xs text-gray-400 dark:text-gray-500">No active items</div>
      )}
    </Link>
  );
}

export default function ChannelOverview() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getChannelsSummary()
      .then((data) => { if (!cancelled) setChannels(Array.isArray(data) ? data : []); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Failed to load channels'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400 p-3">Loading channels…</div>;
  }
  if (err) {
    return <div className="text-sm text-red-700 bg-red-50 p-3 rounded">{err}</div>;
  }
  if (!channels.length) {
    return null;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {channels.map((ch) => <ChannelCard key={ch.key} ch={ch} />)}
    </div>
  );
}
