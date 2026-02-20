import React from 'react';
import { Link } from 'react-router-dom';

function BriefHeroBanner({ brief, loading }) {
  if (loading || !brief) {
    return (
      <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 mb-6 animate-pulse">
        <div className="h-4 w-48 bg-white/20 rounded mb-3" />
        <div className="h-6 w-3/4 bg-white/20 rounded mb-2" />
        <div className="h-4 w-full bg-white/20 rounded mb-1" />
        <div className="h-4 w-2/3 bg-white/20 rounded" />
      </div>
    );
  }

  const dateStr = brief.briefDate
    ? new Date(brief.briefDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Today';

  return (
    <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 mb-6 text-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs bg-white/20 px-2 py-1 rounded">AI-Generated</span>
          <span className="text-sm opacity-80">{dateStr}</span>
        </div>
        <Link
          to="/executive-brief"
          className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition"
        >
          View Full Brief
        </Link>
      </div>
      <h1 className="text-xl font-bold mb-2">{brief.headline || 'Executive Intelligence Brief'}</h1>
      <p className="text-sm opacity-90 leading-relaxed">{brief.executiveSummary}</p>
    </div>
  );
}

export default BriefHeroBanner;
