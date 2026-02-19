import React, { useState } from 'react';
import personalMatchService from '../../services/personalMatchService';

const TYPE_COLORS = {
  gov_contract: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  ai_job: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  grant: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  investment: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  ai_news: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300',
};

const TYPE_LABELS = {
  gov_contract: 'Gov Contract',
  ai_job: 'AI Job',
  grant: 'Grant',
  investment: 'Investment',
  ai_news: 'AI News',
};

function MatchCard({ match }) {
  const [feedbackState, setFeedbackState] = useState(match.feedback);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const opp = match.opportunity;
  if (!opp) return null;

  const scoreColor = match.matchScore >= 80
    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    : match.matchScore >= 60
    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    : 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';

  const handleFeedback = async (type) => {
    if (feedbackLoading || feedbackState === type) return;
    setFeedbackLoading(true);
    try {
      await personalMatchService.submitFeedback(match.id, type);
      setFeedbackState(type);
    } catch (err) {
      console.error('Feedback failed:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Type badge and score */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${TYPE_COLORS[opp.type] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'}`}>
              {TYPE_LABELS[opp.type] || opp.type}
            </span>
            {opp.category && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{opp.category}</span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
            {opp.sourceUrl ? (
              <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                {opp.title}
              </a>
            ) : (
              opp.title
            )}
          </h3>

          {/* Match reason */}
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
            {match.matchReason}
          </p>

          {/* Action suggestion */}
          {match.actionSuggestion && (
            <p className="text-xs text-accent font-medium mb-2">
              {match.actionSuggestion}
            </p>
          )}

          {/* Strength areas */}
          {match.strengthAreas && match.strengthAreas.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {match.strengthAreas.map((area, i) => (
                <span key={i} className="inline-block px-1.5 py-0.5 text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded">
                  {area}
                </span>
              ))}
            </div>
          )}

          {/* Feedback buttons */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => handleFeedback('helpful')}
              disabled={feedbackLoading}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition ${
                feedbackState === 'helpful'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20'
              }`}
              aria-label="Mark as helpful"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
              </svg>
              Helpful
            </button>
            <button
              onClick={() => handleFeedback('not_helpful')}
              disabled={feedbackLoading}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition ${
                feedbackState === 'not_helpful'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              }`}
              aria-label="Mark as not helpful"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
              </svg>
              Not helpful
            </button>
          </div>
        </div>

        {/* Match score badge */}
        <div className={`flex-shrink-0 w-14 h-14 flex flex-col items-center justify-center rounded-lg border ${scoreColor}`}>
          <span className="text-lg font-bold leading-none">{match.matchScore}</span>
          <span className="text-[9px] font-medium">% match</span>
        </div>
      </div>
    </div>
  );
}

export default MatchCard;
