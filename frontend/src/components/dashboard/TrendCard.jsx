import React from 'react';

const TYPE_LABELS = {
  gov_contract: '\u{1F3DB}\uFE0F Gov Contracts',
  ai_job: '\u{1F4BC} AI Jobs',
  investment: '\u{1F4B0} Investments',
  grant: '\u{1F393} Grants',
  ai_news: '\u{1F4F0} AI News',
  freelance: '\u{1F680} Freelance',
};

function TrendCard({ type, trendData, variant = 'default' }) {
  const cardClass = variant === 'compact'
    ? 'bg-white/60 dark:bg-gray-700/50 rounded-lg p-4'
    : 'bg-white dark:bg-gray-800 shadow rounded-lg p-5';

  return (
    <div className={cardClass}>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {TYPE_LABELS[type] || type}
      </h4>
      {!trendData ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No trend data available yet.</p>
      ) : (
        <>
          {trendData.summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{trendData.summary}</p>
          )}
          {trendData.trends?.length > 0 && (
            <ul className="space-y-1.5">
              {trendData.trends.slice(0, 5).map((trend, i) => (
                <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                  <span className="mt-0.5">{trend.direction === 'up' || trend.direction === 'emerging' ? '\u{1F4C8}' : trend.direction === 'down' || trend.direction === 'declining' ? '\u{1F4C9}' : '\u27A1\uFE0F'}</span>
                  <span>{typeof trend === 'string' ? trend : trend.description || JSON.stringify(trend)}</span>
                </li>
              ))}
            </ul>
          )}
          {trendData.analyzedAt && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
              {'\u{1F552}'} Analyzed: {new Date(trendData.analyzedAt).toLocaleDateString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default TrendCard;
