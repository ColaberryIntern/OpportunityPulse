import React from 'react';

const TYPE_LABELS = {
  gov_contract: 'Gov Contracts',
  ai_job: 'AI Jobs',
  investment: 'Investments',
};

function TrendCard({ type, trendData }) {
  return (
    <div className="bg-white shadow rounded-lg p-5">
      <h4 className="text-sm font-semibold text-gray-900 mb-2">
        {TYPE_LABELS[type] || type}
      </h4>
      {!trendData ? (
        <p className="text-sm text-gray-400">No trend data available yet.</p>
      ) : (
        <>
          {trendData.summary && (
            <p className="text-sm text-gray-700 mb-3">{trendData.summary}</p>
          )}
          {trendData.trends?.length > 0 && (
            <ul className="space-y-1.5">
              {trendData.trends.slice(0, 5).map((trend, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">&#x2022;</span>
                  <span>{typeof trend === 'string' ? trend : trend.description || JSON.stringify(trend)}</span>
                </li>
              ))}
            </ul>
          )}
          {trendData.analyzedAt && (
            <p className="text-xs text-gray-400 mt-3">
              Analyzed: {new Date(trendData.analyzedAt).toLocaleDateString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default TrendCard;
