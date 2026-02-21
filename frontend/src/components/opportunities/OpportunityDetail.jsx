import React, { useState } from 'react';
import ShareButtons from '../common/ShareButtons';
import actionEngineService from '../../services/actionEngineService';

const TYPE_COLORS = {
  gov_contract: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800',
  ai_job: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800',
  investment: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  grant: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800',
  ai_news: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800',
  freelance: 'bg-teal-100 dark:bg-teal-900/30 text-teal-800',
};

const TYPE_LABELS = {
  gov_contract: 'Gov Contract',
  ai_job: 'AI Job',
  investment: 'Investment',
  grant: 'Grant',
  ai_news: 'AI News',
  freelance: 'Freelance',
};

const TYPE_EMOJIS = {
  gov_contract: '\u{1F3DB}\uFE0F',
  ai_job: '\u{1F916}',
  investment: '\u{1F4B0}',
  grant: '\u{1F393}',
  ai_news: '\u{1F4F0}',
  freelance: '\u{1F4BC}',
};

const STATUS_COLORS = {
  active: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  closed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  expired: 'bg-red-100 dark:bg-red-900/30 text-red-800',
  archived: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800',
};

const STATUS_EMOJIS = {
  active: '\u{1F7E2}',
  closed: '\u26AB',
  expired: '\u{1F534}',
  archived: '\u{1F7E1}',
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

const ACTION_TYPE_EMOJIS = {
  BUILD: '\u{1F528}',
  BID: '\u{1F4CB}',
  APPLY: '\u2705',
  PARTNER: '\u{1F91D}',
  INVEST: '\u{1F4C8}',
  TEACH: '\u{1F393}',
  IGNORE: '\u23ED\uFE0F',
};

const SKILL_PILL_COLORS = [
  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
];

const COMPETITION_CONFIG = {
  low: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  moderate: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  high: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
};

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
  if (score >= 60) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
  return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900';
}

function getBarColor(value) {
  if (value >= 0.7) return 'bg-green-500';
  if (value >= 0.4) return 'bg-yellow-500';
  return 'bg-red-400';
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

function formatCompact(n) {
  if (!n) return '';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

// Keys already displayed in Strategic Intelligence or internal-only
const SKIP_KEYS = new Set([
  'classified', 'classifiedAt', 'classification', 'saturation', 'actionPlan',
]);

function ScoreBar({ label, value, maxValue = 1 }) {
  const pct = Math.min(Math.round((value / maxValue) * 100), 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div className={`${getBarColor(value / maxValue)} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 text-right">
        {maxValue === 1 ? `${pct}%` : `${value}/${maxValue}`}
      </span>
    </div>
  );
}

function PillBadges({ items, colorful = false }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={item}
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            colorful ? SKILL_PILL_COLORS[i % SKILL_PILL_COLORS.length] : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function renderFreelanceAnalysis(ai) {
  const fs = ai.freelanceScore;
  const COMPONENT_LABELS = {
    budget: '\u{1F4B5} Budget',
    clientReliability: '\u2B50 Client Reliability',
    lowCompetition: '\u{1F3AF} Low Competition',
    recurringPotential: '\u{1F504} Recurring Potential',
    saasConversion: '\u{1F680} SaaS Conversion',
    strategicAlignment: '\u{1F9ED} Strategic Alignment',
  };

  return (
    <div className="space-y-5">
      {/* Skills */}
      {ai.skills?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F6E0}\uFE0F'} Skills</h4>
          <PillBadges items={ai.skills} colorful />
        </div>
      )}

      {/* Freelance Score Breakdown */}
      {fs && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F48E}'} Freelance Score</h4>
          <div className="flex items-center gap-3 mb-3">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${getScoreColor(fs.score)}`}>
              <span className="text-2xl font-bold">{Math.round(fs.score)}</span>
              <span className="text-sm">/100</span>
            </div>
          </div>
          {fs.components && (
            <div className="space-y-2">
              {Object.entries(fs.components).map(([key, val]) => (
                <ScoreBar key={key} label={COMPONENT_LABELS[key] || key} value={val} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Project Profile */}
      {(ai.complexity || ai.projectType || ai.saasConversionPotential != null) && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F9E9}'} Project Profile</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ai.complexity && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">{'\u{1F4CA}'} Complexity</span>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize mt-0.5">{ai.complexity}</p>
              </div>
            )}
            {ai.projectType && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">{'\u{1F4E6}'} Project Type</span>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize mt-0.5">{ai.projectType.replace(/-/g, ' ')}</p>
              </div>
            )}
            {ai.saasConversionPotential != null && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">{'\u{1F504}'} SaaS Potential</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className={`${getBarColor(ai.saasConversionPotential / 100)} h-2 rounded-full`} style={{ width: `${ai.saasConversionPotential}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ai.saasConversionPotential}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Demand Signals */}
      {ai.demandSignals?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F4CA}'} Demand Signals</h4>
          <PillBadges items={ai.demandSignals} />
        </div>
      )}

      {/* Vertical Fit */}
      {ai.verticalFit?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F3E2}'} Vertical Fit</h4>
          <PillBadges items={ai.verticalFit} colorful />
        </div>
      )}
    </div>
  );
}

function renderGovAnalysis(ai) {
  const compConfig = COMPETITION_CONFIG[ai.competition_level] || COMPETITION_CONFIG.moderate;

  return (
    <div className="space-y-4">
      {/* Confidence */}
      {ai.confidence != null && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F3AF}'} AI Confidence</h4>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3 max-w-xs">
              <div className={`${getBarColor(ai.confidence)} h-3 rounded-full`} style={{ width: `${Math.round(ai.confidence * 100)}%` }} />
            </div>
            <span className="text-lg font-bold text-gray-700 dark:text-gray-300">{Math.round(ai.confidence * 100)}%</span>
          </div>
        </div>
      )}

      {/* Keywords */}
      {ai.keywords?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F511}'} Key Terms</h4>
          <PillBadges items={ai.keywords} colorful />
        </div>
      )}

      {/* Competition Level */}
      {ai.competition_level && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{'\u2694\uFE0F'} Competition</h4>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize ${compConfig.bg} ${compConfig.color}`}>
            {ai.competition_level}
          </span>
        </div>
      )}

      {/* Recommendation */}
      {ai.recommendation && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">{'\u{1F4A1}'} Recommendation</h4>
          <p className="text-sm text-blue-700 dark:text-blue-400">{ai.recommendation}</p>
        </div>
      )}

      {/* RSS Signals */}
      {ai.rssSignals && renderRssSignals(ai.rssSignals)}
    </div>
  );
}

function renderRssSignals(signals) {
  if (!signals || signals.method === 'llm_failed') return null;
  const items = [];
  if (signals.budget?.allocationAmount) {
    items.push({ emoji: '\u{1F4B0}', label: 'Budget Allocation', value: formatCompact(signals.budget.allocationAmount) });
  }
  if (signals.actor?.actorName) {
    items.push({ emoji: '\u{1F3DB}\uFE0F', label: 'Key Actor', value: signals.actor.actorName });
  }
  if (signals.enterprise?.companyName) {
    items.push({ emoji: '\u{1F3E2}', label: 'Enterprise', value: signals.enterprise.companyName });
  }
  if (signals.compliance?.regulationType) {
    items.push({ emoji: '\u{1F6E1}\uFE0F', label: 'Compliance', value: signals.compliance.regulationType.replace(/_/g, ' ') });
  }
  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F4E1}'} Intelligence Signals</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 flex items-start gap-2">
            <span className="text-lg">{item.emoji}</span>
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{item.label}</span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function hasDisplayableAnalysis(ai) {
  if (!ai || typeof ai !== 'object') return false;
  return Object.entries(ai).some(([k, v]) => !SKIP_KEYS.has(k) && v != null && v !== '');
}

function renderGenericAnalysis(ai) {
  if (!hasDisplayableAnalysis(ai)) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        Detailed analysis is not yet available for this opportunity.
      </p>
    );
  }

  const shown = new Set();

  return (
    <div className="space-y-4">
      {/* Confidence */}
      {ai.confidence != null && (shown.add('confidence'),
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F3AF}'} AI Confidence</h4>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3 max-w-xs">
              <div className={`${getBarColor(typeof ai.confidence === 'number' && ai.confidence <= 1 ? ai.confidence : ai.confidence / 100)} h-3 rounded-full`}
                style={{ width: `${typeof ai.confidence === 'number' && ai.confidence <= 1 ? Math.round(ai.confidence * 100) : ai.confidence}%` }} />
            </div>
            <span className="text-lg font-bold text-gray-700 dark:text-gray-300">
              {typeof ai.confidence === 'number' && ai.confidence <= 1 ? Math.round(ai.confidence * 100) : ai.confidence}%
            </span>
          </div>
        </div>
      )}

      {/* Keywords */}
      {ai.keywords?.length > 0 && (shown.add('keywords'),
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F511}'} Key Terms</h4>
          <PillBadges items={ai.keywords} colorful />
        </div>
      )}

      {/* Competition */}
      {ai.competition_level && (shown.add('competition_level'),
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{'\u2694\uFE0F'} Competition</h4>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize ${(COMPETITION_CONFIG[ai.competition_level] || COMPETITION_CONFIG.moderate).bg} ${(COMPETITION_CONFIG[ai.competition_level] || COMPETITION_CONFIG.moderate).color}`}>
            {ai.competition_level}
          </span>
        </div>
      )}

      {/* Recommendation */}
      {ai.recommendation && (shown.add('recommendation'),
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">{'\u{1F4A1}'} Recommendation</h4>
          <p className="text-sm text-blue-700 dark:text-blue-400">{ai.recommendation}</p>
        </div>
      )}

      {/* RSS Signals */}
      {ai.rssSignals && (shown.add('rssSignals'), renderRssSignals(ai.rssSignals))}

      {/* Remaining unknown keys */}
      {Object.entries(ai)
        .filter(([k]) => !SKIP_KEYS.has(k) && !shown.has(k))
        .filter(([, v]) => v != null && v !== '')
        .map(([key, value]) => (
          <div key={key}>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 capitalize">{key.replace(/_/g, ' ')}</h4>
            {Array.isArray(value) ? (
              <PillBadges items={value.map(String)} />
            ) : typeof value === 'object' ? (
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded text-gray-600 dark:text-gray-400 overflow-x-auto">
                {JSON.stringify(value, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">{String(value)}</p>
            )}
          </div>
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

  const typeEmoji = TYPE_EMOJIS[opportunity.type] || '';
  const statusEmoji = STATUS_EMOJIS[opportunity.status] || '';
  const actionEmoji = ACTION_TYPE_EMOJIS[opportunity.actionType] || '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[opportunity.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
            {typeEmoji} {TYPE_LABELS[opportunity.type] || opportunity.type}
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[opportunity.status] || STATUS_COLORS.active}`}>
            {statusEmoji} {opportunity.status}
          </span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{opportunity.title}</h2>
        <div className="mt-3">
          <ShareButtons title={opportunity.title} url={window.location.href} />
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
          {opportunity.source && <span>{'\u{1F4E1}'} {opportunity.source}</span>}
          {isValidUrl(opportunity.sourceUrl) ? (
            <a
              href={opportunity.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {'\u{1F517}'} View Original
            </a>
          ) : opportunity.sourceUrl ? (
            <span className="text-gray-400 dark:text-gray-500 text-xs">(invalid source link)</span>
          ) : null}
          {opportunity.publishedAt && (
            <span>{'\u{1F4C5}'} {new Date(opportunity.publishedAt).toLocaleDateString()}</span>
          )}
          {opportunity.expiresAt && (
            <span>{'\u23F0'} Expires {new Date(opportunity.expiresAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{'\u{1F4CB}'} Details</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-4">{opportunity.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {opportunity.category && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{'\u{1F4C2}'} Category</span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{opportunity.category}</p>
            </div>
          )}
          {opportunity.location && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{'\u{1F4CD}'} Location</span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{opportunity.location}</p>
            </div>
          )}
          {opportunity.value != null && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{'\u{1F4B5}'} Value</span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                ${parseFloat(opportunity.value).toLocaleString()}
              </p>
            </div>
          )}
          {opportunity.tags?.length > 0 && (
            <div className="sm:col-span-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase mb-1 block">{'\u{1F3F7}\uFE0F'} Tags</span>
              <PillBadges items={opportunity.tags} colorful />
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis */}
      {(opportunity.aiScore != null || opportunity.aiAnalysis) && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{'\u{1F9E0}'} AI Analysis</h3>
          <div className="flex items-center gap-4 mb-4">
            {opportunity.aiScore != null && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${getScoreColor(opportunity.aiScore)}`}>
                <span className="text-3xl font-bold">{opportunity.aiScore}</span>
                <span className="text-sm">/100</span>
              </div>
            )}
          </div>
          {opportunity.aiAnalysis && typeof opportunity.aiAnalysis === 'object' && (
            opportunity.type === 'freelance'
              ? renderFreelanceAnalysis(opportunity.aiAnalysis)
              : opportunity.type === 'gov_contract'
                ? renderGovAnalysis(opportunity.aiAnalysis)
                : renderGenericAnalysis(opportunity.aiAnalysis)
          )}
          {opportunity.aiAnalysis && typeof opportunity.aiAnalysis !== 'object' && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{String(opportunity.aiAnalysis)}</p>
          )}
        </div>
      )}

      {/* Strategic Intelligence */}
      {opportunity.actionType && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{'\u{1F3AF}'} Strategic Intelligence</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {/* Classification */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{'\u26A1'} Action Type</span>
              <div className="mt-1">
                <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold ring-1 ring-inset ring-current/20 ${ACTION_TYPE_COLORS[opportunity.actionType] || 'bg-gray-100 text-gray-600'}`}>
                  {actionEmoji} {opportunity.actionType}
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
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{'\u{1F4CA}'} Market Saturation</span>
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
                      <span className="text-xs text-gray-400 w-20">{'\u{1F4C8}'} Demand</span>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${opportunity.aiAnalysis.saturation.demandScore || 0}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-20">{'\u2694\uFE0F'} Compete</span>
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
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{'\u{1F5FA}\uFE0F'} Action Plan</span>
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
                    {generatingPlan ? 'Generating...' : '\u2728 Generate Action Plan'}
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
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{'\u{1F4DD}'} Steps</h4>
              <div className="space-y-2">
                {(actionPlan?.steps || opportunity.aiAnalysis.actionPlan.steps).map((step, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-6 h-6 bg-accent/10 text-accent rounded-full flex items-center justify-center text-xs font-bold">
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
                <span className="text-sm text-green-600 dark:text-green-400">{'\u2705'} Tracked! View in Action Tracker.</span>
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
                  {trackingAction ? 'Tracking...' : '\u{1F680} Track This Opportunity'}
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
            {showRawData ? '\u{1F4E6} Hide' : '\u{1F4E6} Show'} raw source data
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
