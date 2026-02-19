import React from 'react';

const SIGNIFICANCE_LABELS = {
  major_update: { label: 'Major Update', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  review: { label: 'Review', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  comparison: { label: 'Comparison', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  mention: { label: 'Mention', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

const SENTIMENT_ICONS = {
  positive: { icon: '+', color: 'text-green-600 dark:text-green-400' },
  neutral: { icon: '~', color: 'text-gray-500 dark:text-gray-400' },
  negative: { icon: '-', color: 'text-red-600 dark:text-red-400' },
};

function ToolMentionTimeline({ mentions, loading }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-16" />
        ))}
      </div>
    );
  }

  if (!mentions || mentions.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">No mentions found yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {mentions.map((mention) => {
        const sig = SIGNIFICANCE_LABELS[mention.significance] || SIGNIFICANCE_LABELS.mention;
        const sent = SENTIMENT_ICONS[mention.sentiment] || SENTIMENT_ICONS.neutral;
        const date = mention.mentionedAt ? new Date(mention.mentionedAt).toLocaleDateString() : '';

        return (
          <div
            key={mention.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${sig.color}`}>
                  {sig.label}
                </span>
                <span className={`text-xs font-bold ${sent.color}`}>{sent.icon}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{mention.source}</span>
              </div>
              <span className="text-xs text-gray-400">{date}</span>
            </div>
            {mention.title && (
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                {mention.sourceUrl ? (
                  <a href={mention.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                    {mention.title}
                  </a>
                ) : mention.title}
              </p>
            )}
            {mention.snippet && (
              <p className="text-xs text-gray-600 dark:text-gray-400">{mention.snippet}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ToolMentionTimeline;
