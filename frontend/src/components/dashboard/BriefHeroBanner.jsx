import React from 'react';

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

  const riskCount = brief.riskFlags?.length || 0;
  const signalCount = brief.trendSignals?.length || 0;

  return (
    <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 mb-6 text-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs bg-white/20 px-2 py-1 rounded">AI-Generated</span>
          {brief.personalized && (
            <span className="text-xs bg-white/20 px-2 py-1 rounded">Personalized for you</span>
          )}
          <span className="text-sm opacity-80">{dateStr}</span>
        </div>
        <div className="flex items-center gap-2">
          {riskCount > 0 && (
            <span className="text-xs bg-red-500/80 px-2 py-1 rounded font-medium">
              &#9888; {riskCount} risk{riskCount !== 1 ? 's' : ''}
            </span>
          )}
          {signalCount > 0 && (
            <span className="text-xs bg-green-500/80 px-2 py-1 rounded font-medium">
              &#8599; {signalCount} signal{signalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <h1 className="text-xl font-bold mb-2">{brief.headline || 'Executive Intelligence Brief'}</h1>
      <p className="text-sm opacity-90 leading-relaxed">{brief.executiveSummary}</p>
    </div>
  );
}

export default BriefHeroBanner;
