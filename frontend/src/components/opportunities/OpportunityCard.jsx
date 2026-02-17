import React from 'react';
import { Link } from 'react-router-dom';

const TYPE_COLORS = {
  gov_contract: 'bg-blue-100 text-blue-800',
  ai_job: 'bg-purple-100 text-purple-800',
  investment: 'bg-green-100 text-green-800',
};

const TYPE_LABELS = {
  gov_contract: 'Gov Contract',
  ai_job: 'AI Job',
  investment: 'Investment',
};

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-800',
  archived: 'bg-yellow-100 text-yellow-800',
};

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-gray-500';
}

function OpportunityCard({ opportunity, isPublic = false }) {
  const linkTo = isPublic
    ? `/browse/${opportunity.id}`
    : `/opportunities/${opportunity.id}`;

  return (
    <Link to={linkTo} className="block">
      <div className="bg-white shadow rounded-lg p-5 hover:shadow-md transition">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[opportunity.type] || 'bg-gray-100 text-gray-800'}`}>
                {TYPE_LABELS[opportunity.type] || opportunity.type}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[opportunity.status] || STATUS_COLORS.active}`}>
                {opportunity.status}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 truncate">{opportunity.title}</h3>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{opportunity.description}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {opportunity.value != null && (
                <span className="text-sm font-medium text-gray-700">
                  ${parseFloat(opportunity.value).toLocaleString()}
                </span>
              )}
              {opportunity.publishedAt && (
                <span className="text-xs text-gray-400">
                  {new Date(opportunity.publishedAt).toLocaleDateString()}
                </span>
              )}
              {opportunity.category && (
                <span className="text-xs text-gray-400">{opportunity.category}</span>
              )}
              {opportunity.tags?.length > 0 && (
                <div className="flex gap-1">
                  {opportunity.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {opportunity.tags.length > 3 && (
                    <span className="text-xs text-gray-400">+{opportunity.tags.length - 3}</span>
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
                <p className="text-xs text-gray-400">AI Score</p>
              </div>
            ) : isPublic ? (
              <span className="text-xs text-accent font-medium hover:underline">
                Sign in for details
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default OpportunityCard;
