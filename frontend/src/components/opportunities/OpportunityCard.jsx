import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ShareButtons from '../common/ShareButtons';
import savedOpportunityService from '../../services/savedOpportunityService';

const TYPE_COLORS = {
  gov_contract: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800',
  ai_job: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800',
  investment: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  grant: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800',
  ai_news: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800',
};

const TYPE_LABELS = {
  gov_contract: 'Gov Contract',
  ai_job: 'AI Job',
  investment: 'Investment',
  grant: 'Grant',
  ai_news: 'AI News',
};

const STATUS_COLORS = {
  active: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  closed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  expired: 'bg-red-100 dark:bg-red-900/30 text-red-800',
  archived: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800',
};

const ACTION_TYPE_COLORS = {
  BUILD: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
  BID: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  APPLY: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
  PARTNER: 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300',
  INVEST: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  TEACH: 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
  IGNORE: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

const QUADRANT_SHORT = {
  'High Demand / Low Competition': { label: 'HD/LC', color: 'text-green-600 dark:text-green-400' },
  'High Demand / High Competition': { label: 'HD/HC', color: 'text-yellow-600 dark:text-yellow-400' },
  'Low Demand / Low Competition': { label: 'LD/LC', color: 'text-gray-500 dark:text-gray-400' },
  'Low Demand / High Competition': { label: 'LD/HC', color: 'text-red-500 dark:text-red-400' },
};

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-gray-500';
}

function BookmarkIcon({ filled }) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21.75a.75.75 0 01-1.085.67L12 18.089l-7.165 4.332A.75.75 0 013.75 21.75V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
  );
}

function OpportunityCard({ opportunity, isPublic = false, initialSaved = false }) {
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsSaved(initialSaved);
  }, [initialSaved]);

  const linkTo = isPublic
    ? `/browse/${opportunity.id}`
    : `/opportunities/${opportunity.id}`;

  const handleToggleSave = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      if (isSaved) {
        await savedOpportunityService.unsaveOpportunity(opportunity.id);
        setIsSaved(false);
      } else {
        await savedOpportunityService.saveOpportunity(opportunity.id);
        setIsSaved(true);
      }
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 hover:shadow-md transition">
      <Link to={linkTo} className="block">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[opportunity.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                {TYPE_LABELS[opportunity.type] || opportunity.type}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[opportunity.status] || STATUS_COLORS.active}`}>
                {opportunity.status}
              </span>
              {opportunity.actionType && opportunity.actionType !== 'IGNORE' && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_TYPE_COLORS[opportunity.actionType] || ''}`}>
                  {opportunity.actionType}
                </span>
              )}
              {opportunity.opportunityQuadrant && QUADRANT_SHORT[opportunity.opportunityQuadrant] && (
                <span className={`text-xs font-medium ${QUADRANT_SHORT[opportunity.opportunityQuadrant].color}`}>
                  {QUADRANT_SHORT[opportunity.opportunityQuadrant].label}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{opportunity.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{opportunity.description}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {opportunity.value != null && (
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  ${parseFloat(opportunity.value).toLocaleString()}
                </span>
              )}
              {opportunity.publishedAt && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(opportunity.publishedAt).toLocaleDateString()}
                </span>
              )}
              {opportunity.category && (
                <span className="text-xs text-gray-400 dark:text-gray-500">{opportunity.category}</span>
              )}
              {opportunity.tags?.length > 0 && (
                <div className="flex gap-1">
                  {opportunity.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {opportunity.tags.length > 3 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">+{opportunity.tags.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="ml-4 shrink-0 text-right">
            {!isPublic && opportunity.aiScore != null ? (
              <div>
                <span className={`text-2xl font-bold ${getScoreColor(opportunity.aiScore)}`}>
                  {opportunity.aiScore}
                </span>
                <p className="text-xs text-gray-400 dark:text-gray-500">AI Score</p>
              </div>
            ) : isPublic ? (
              <span className="text-xs text-accent font-medium hover:underline">
                Sign in for details
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <ShareButtons
          title={opportunity.title}
          url={`${window.location.origin}${isPublic ? `/browse/${opportunity.id}` : `/opportunities/${opportunity.id}`}`}
        />
        {!isPublic && (
          <button
            type="button"
            onClick={handleToggleSave}
            disabled={saving}
            className={`p-1.5 rounded-md transition-colors ${
              isSaved
                ? 'text-primary hover:text-primary/80'
                : 'text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-primary'
            } disabled:opacity-50`}
            title={isSaved ? 'Remove bookmark' : 'Bookmark this opportunity'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark this opportunity'}
          >
            <BookmarkIcon filled={isSaved} />
          </button>
        )}
      </div>
    </div>
  );
}

export default OpportunityCard;
