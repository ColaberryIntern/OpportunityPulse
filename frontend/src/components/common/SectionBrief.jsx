import React, { useEffect, useState } from 'react';
import actionEngineService from '../../services/actionEngineService';

function SectionBrief({ section }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!section) return;
    let cancelled = false;
    setLoading(true);

    actionEngineService.getSectionBrief(section)
      .then((res) => {
        if (!cancelled) setBrief(res.data?.data || null);
      })
      .catch(() => {
        if (!cancelled) setBrief(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [section]);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 rounded-lg p-4 mb-4 animate-pulse">
        <div className="h-3 w-32 bg-blue-100 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-3/4 bg-blue-100 dark:bg-gray-700 rounded mb-2" />
        <div className="h-3 w-full bg-blue-100 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (!brief || !brief.headline) return null;

  const dateStr = brief.briefDate
    ? new Date(brief.briefDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Today';

  const riskCount = brief.riskFlags?.length || 0;
  const signalCount = brief.trendSignals?.length || 0;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 border border-blue-100 dark:border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded">AI Insight</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{dateStr}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {riskCount > 0 && (
            <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
              {riskCount} risk{riskCount !== 1 ? 's' : ''}
            </span>
          )}
          {signalCount > 0 && (
            <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">
              {signalCount} signal{signalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{brief.headline}</p>
      {brief.summary && (
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{brief.summary}</p>
      )}
    </div>
  );
}

export default SectionBrief;
