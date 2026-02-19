import React, { useState } from 'react';
import ShareButtons from '../common/ShareButtons';
import actionEngineService from '../../services/actionEngineService';

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

const ACTION_TYPE_COLORS = {
  BUILD: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
  BID: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  APPLY: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
  PARTNER: 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300',
  INVEST: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  TEACH: 'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300',
  IGNORE: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
  if (score >= 60) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
  return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900';
}

function isValidUrl(str) {
  if (!str || typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderAiAnalysisValue(key, value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') {
    return <span className="text-gray-600 dark:text-gray-400 ml-1">{String(value)}</span>;
  }

  if (key === 'classification') {
    return (
      <div className="mt-1 pl-3 border-l-2 border-indigo-200 dark:border-indigo-700 space-y-1">
        {value.actionType && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Action:</span> {value.actionType}
          </p>
        )}
        {value.confidenceScore != null && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Confidence:</span> {value.confidenceScore}%
          </p>
        )}
        {value.method && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Method:</span> {value.method}
          </p>
        )}
        {value.reasoning && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">{value.reasoning}</p>
        )}
        {value.classifiedAt && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Classified: {new Date(value.classifiedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  if (key === 'saturation') {
    return (
      <div className="mt-1 pl-3 border-l-2 border-amber-200 dark:border-amber-700 space-y-1">
        {value.demandScore != null && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Demand:</span> {value.demandScore}/100
          </p>
        )}
        {value.competitionScore != null && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Competition:</span> {value.competitionScore}/100
          </p>
        )}
        {value.groupCount != null && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Similar opportunities:</span> {value.groupCount}
          </p>
        )}
      </div>
    );
  }

  if (key === 'actionPlan') {
    return (
      <div className="mt-1 pl-3 border-l-2 border-green-200 dark:border-green-700 space-y-1">
        {value.summary && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{value.summary}</p>
        )}
        {value.estimatedEffort && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Effort:</span> {value.estimatedEffort}
          </p>
        )}
        {value.riskLevel && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Risk:</span> {value.riskLevel}
          </p>
        )}
        {value.steps?.length > 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Steps:</span> {value.steps.length} steps defined
          </p>
        )}
        {value.method && (
          <p className="text-xs text-gray-400 dark:text-gray-500">Generated via: {value.method}</p>
        )}
      </div>
    );
  }

  // Fallback for unknown objects
  return (
    <div className="mt-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-1">
      {Object.entries(value).map(([k, v]) => (
        <p key={k} className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </p>
      ))}
    </div>
  );
}

function OpportunityDetail({ opportunity, loading }) {
  const [showRawData, setShowRawData] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [trackingAction, setTrackingAction] = useState(false);
  const [actionPlan, setActionPlan] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [trackSuccess, setTrackSuccess] = useState(false);

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
          {isValidUrl(opportunity.sourceUrl) ? (
            <a
              href={opportunity.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              View Original
            </a>
          ) : opportunity.sourceUrl ? (
            <span className="text-gray-400 dark:text-gray-500 text-xs">(invalid source link)</span>
          ) : null}
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
                    </span>
                    {renderAiAnalysisValue(key, value)}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300">{String(opportunity.aiAnalysis)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Strategic Intelligence */}
      {opportunity.actionType && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Strategic Intelligence</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {/* Classification */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">Action Type</span>
              <div className="mt-1">
                <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold ring-1 ring-inset ring-current/20 ${ACTION_TYPE_COLORS[opportunity.actionType] || 'bg-gray-100 text-gray-600'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  {opportunity.actionType}
                </span>
              </div>
              {opportunity.aiAnalysis?.classification?.reasoning && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {opportunity.aiAnalysis.classification.reasoning}
                </p>
              )}
              {opportunity.aiAnalysis?.classification?.confidenceScore && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Confidence: {opportunity.aiAnalysis.classification.confidenceScore}%
                </p>
              )}
            </div>

            {/* Saturation */}
            {opportunity.saturationIndex != null && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">Market Saturation</span>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {parseFloat(opportunity.saturationIndex).toFixed(0)}
                  <span className="text-sm font-normal text-gray-500">/100</span>
                </p>
                {opportunity.opportunityQuadrant && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{opportunity.opportunityQuadrant}</p>
                )}
                {opportunity.aiAnalysis?.saturation && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-20">Demand</span>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${opportunity.aiAnalysis.saturation.demandScore || 0}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-20">Competition</span>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-red-500 h-2 rounded-full" style={{ width: `${opportunity.aiAnalysis.saturation.competitionScore || 0}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Plan Summary */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">Action Plan</span>
              {(opportunity.aiAnalysis?.actionPlan || actionPlan) ? (
                <div className="mt-1">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {(actionPlan || opportunity.aiAnalysis.actionPlan).summary}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Effort: {(actionPlan || opportunity.aiAnalysis.actionPlan).estimatedEffort} | Risk: {(actionPlan || opportunity.aiAnalysis.actionPlan).riskLevel}
                  </p>
                </div>
              ) : (
                <div>
                  <button
                    onClick={async () => {
                      setGeneratingPlan(true);
                      setPlanError(null);
                      try {
                        const res = await actionEngineService.generateActionPlan(opportunity.id);
                        setActionPlan(res.data.data);
                      } catch (err) {
                        const status = err.response?.status;
                        const message = err.response?.data?.message;
                        if (status === 429) {
                          setPlanError('Rate limit reached. Please try again in a few minutes.');
                        } else if (message?.includes('IGNORE') || message?.includes('classified')) {
                          setPlanError('This opportunity must be classified with a non-IGNORE type first.');
                        } else {
                          setPlanError(message || 'Failed to generate action plan. Please try again.');
                        }
                      }
                      setGeneratingPlan(false);
                    }}
                    disabled={generatingPlan}
                    className="mt-1 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary/90 disabled:opacity-50"
                  >
                    {generatingPlan ? 'Generating...' : 'Generate Action Plan'}
                  </button>
                  {planError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{planError}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Plan Steps */}
          {(actionPlan?.steps || opportunity.aiAnalysis?.actionPlan?.steps) && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Steps</h4>
              <div className="space-y-2">
                {(actionPlan?.steps || opportunity.aiAnalysis.actionPlan.steps).map((step, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-6 h-6 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full flex items-center justify-center text-xs font-bold">
                      {step.order || i + 1}
                    </span>
                    <div>
                      <p className="text-gray-700 dark:text-gray-300">{step.action}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {step.effort} effort | {step.timeframe}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Track This Opportunity */}
          {opportunity.actionType !== 'IGNORE' && (
            <div>
              {trackSuccess ? (
                <span className="text-sm text-green-600 dark:text-green-400">Tracked! View in Action Tracker.</span>
              ) : (
                <button
                  onClick={async () => {
                    setTrackingAction(true);
                    try {
                      await actionEngineService.createAction({ opportunityId: opportunity.id, actionType: opportunity.actionType });
                      setTrackSuccess(true);
                    } catch { /* silent */ }
                    setTrackingAction(false);
                  }}
                  disabled={trackingAction}
                  className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/90 disabled:opacity-50"
                >
                  {trackingAction ? 'Tracking...' : 'Track This Opportunity'}
                </button>
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
