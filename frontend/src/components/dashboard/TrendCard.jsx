import React from 'react';

const TYPE_LABELS = {
  gov_contract: 'Gov Contracts',
  ai_job: 'AI Jobs',
  investment: 'Investments',
  ai_news: 'AI News',
};

function TrendCard({ type, trendData }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
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
                  <span className="text-accent mt-0.5">&#x2022;</span>
                  <span>{typeof trend === 'string' ? trend : trend.description || JSON.stringify(trend)}</span>
                </li>
              ))}
            </ul>
          )}
          {trendData.analyzedAt && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
              Analyzed: {new Date(trendData.analyzedAt).toLocaleDateString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default TrendCard;
