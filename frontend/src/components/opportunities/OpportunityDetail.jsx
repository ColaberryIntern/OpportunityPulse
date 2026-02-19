import React, { useState } from 'react';
import ShareButtons from '../common/ShareButtons';

const TYPE_COLORS = {
  gov_contract: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800',
  ai_job: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800',
  investment: 'bg-green-100 dark:bg-green-900/30 text-green-800',
};

const TYPE_LABELS = {
  gov_contract: 'Gov Contract',
  ai_job: 'AI Job',
  investment: 'Investment',
};

const STATUS_COLORS = {
  active: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  closed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  expired: 'bg-red-100 dark:bg-red-900/30 text-red-800',
  archived: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800',
};

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
  if (score >= 60) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
  return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900';
}

function OpportunityDetail({ opportunity, loading }) {
  const [showRawData, setShowRawData] = useState(false);

  if (loading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading opportunity...</p>;
  }

  if (!opportunity) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
        Opportunity not found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[opportunity.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
            {TYPE_LABELS[opportunity.type] || opportunity.type}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[opportunity.status] || STATUS_COLORS.active}`}>
            {opportunity.status}
          </span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{opportunity.title}</h2>
        <div className="mt-3">
          <ShareButtons title={opportunity.title} url={window.location.href} />
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
          {opportunity.source && <span>Source: {opportunity.source}</span>}
          {opportunity.sourceUrl && (
            <a
              href={opportunity.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              View Original
            </a>
          )}
          {opportunity.publishedAt && (
            <span>Published: {new Date(opportunity.publishedAt).toLocaleDateString()}</span>
          )}
          {opportunity.expiresAt && (
            <span>Expires: {new Date(opportunity.expiresAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Details</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-4">{opportunity.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {opportunity.category && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">Category</span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{opportunity.category}</p>
            </div>
          )}
          {opportunity.location && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">Location</span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{opportunity.location}</p>
            </div>
          )}
          {opportunity.value != null && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">Value</span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ${parseFloat(opportunity.value).toLocaleString()}
              </p>
            </div>
          )}
          {opportunity.tags?.length > 0 && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">Tags</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {opportunity.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis */}
      {(opportunity.aiScore != null || opportunity.aiAnalysis) && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">AI Analysis</h3>
          <div className="flex items-center gap-4 mb-4">
            {opportunity.aiScore != null && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${getScoreColor(opportunity.aiScore)}`}>
                <span className="text-3xl font-bold">{opportunity.aiScore}</span>
                <span className="text-sm">/100</span>
              </div>
            )}
          </div>
          {opportunity.aiAnalysis && (
            <div className="space-y-2">
              {typeof opportunity.aiAnalysis === 'object' ? (
                Object.entries(opportunity.aiAnalysis).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {key.replace(/_/g, ' ')}:
                    </span>{' '}
                    <span className="text-gray-600 dark:text-gray-400">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300">{String(opportunity.aiAnalysis)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Source Data (collapsible) */}
      {opportunity.sourceData && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <button
            onClick={() => setShowRawData(!showRawData)}
            className="text-sm text-accent hover:underline font-medium"
          >
            {showRawData ? 'Hide' : 'Show'} raw source data
          </button>
          {showRawData && (
            <pre className="mt-3 bg-gray-50 dark:bg-gray-900 p-4 rounded text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
              {JSON.stringify(opportunity.sourceData, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default OpportunityDetail;
