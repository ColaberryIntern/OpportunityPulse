const ROLES = {
  ADMIN: 'admin',
  CONSULTANT: 'consultant',
  AUDITOR: 'auditor',
  DEVOPS: 'devops',
};

const CONTENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  PREMIUM: 'premium',
};

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

const USER_ACTIVITY_ACTIONS = {
  LOGIN: 'login',
  CONTENT_VIEW: 'content_view',
  CONTENT_CREATE: 'content_create',
  CONTENT_UPDATE: 'content_update',
  CONTENT_DELETE: 'content_delete',
  SEARCH_QUERY: 'search_query',
  PROFILE_UPDATE: 'profile_update',
  OPPORTUNITY_VIEW: 'opportunity_view',
  OPPORTUNITY_CLICK: 'opportunity_click',
  RECOMMENDATION_CLICK: 'recommendation_click',
  TIME_ON_PAGE: 'time_on_page',
};

const OPPORTUNITY_TYPES = {
  GOV_CONTRACT: 'gov_contract',
  AI_JOB: 'ai_job',
  INVESTMENT: 'investment',
  GRANT: 'grant',
  AI_NEWS: 'ai_news',
  FREELANCE: 'freelance',
  // bonfire = procurement bids scraped from the user's Bonfire vendor account
  // and synced into the unified opportunities table. Source rows live in
  // bonfire_opportunities; the sync (bonfire/sync.service.js) keeps a
  // type='bonfire' shadow here so they show up in the main /opportunities view.
  BONFIRE: 'bonfire',
};

const FREELANCE_ACTION_TYPES = {
  PROPOSAL: 'PROPOSAL',
  ARCHITECTURE: 'ARCHITECTURE',
  SOW: 'SOW',
  SAAS_IDEA: 'SAAS_IDEA',
  OUTREACH: 'OUTREACH',
};

const FREELANCE_SCORING_WEIGHTS = {
  BUDGET: 0.25,
  CLIENT_RELIABILITY: 0.15,
  LOW_COMPETITION: 0.15,
  RECURRING_POTENTIAL: 0.15,
  SAAS_CONVERSION: 0.20,
  STRATEGIC_ALIGNMENT: 0.10,
};

const OPPORTUNITY_STATUS = {
  ACTIVE: 'active',
  CLOSED: 'closed',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
};

const INGESTION_STATUS = {
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

const DATA_SOURCE_TYPES = {
  API: 'api',
  SCRAPER: 'scraper',
  MOCK: 'mock',
  MANUAL: 'manual',
};

const ANALYSIS_TYPES = {
  SCORING: 'scoring',
  TREND_DETECTION: 'trend_detection',
  INSIGHT_GENERATION: 'insight_generation',
  CLASSIFICATION: 'classification',
  SATURATION_COMPUTATION: 'saturation_computation',
  ACTION_RECOMMENDATION: 'action_recommendation',
  EXECUTIVE_BRIEF: 'executive_brief',
  DOMAIN_CLASSIFICATION: 'domain_classification',
  CAPABILITY_CLASSIFICATION: 'capability_classification',
  STRATEGIC_INTENT: 'strategic_intent',
  MONETIZATION_ANGLE: 'monetization_angle',
  MATURITY_PHASE: 'maturity_phase',
  GEOGRAPHIC_TAGGING: 'geographic_tagging',
  META_SIGNAL_COMPUTATION: 'meta_signal_computation',
  CLUSTER_DETECTION: 'cluster_detection',
  RSS_SIGNAL_ENRICHMENT: 'rss_signal_enrichment',
  TOOL_GITHUB_ACCELERATION: 'tool_github_acceleration',
  TOOL_SOCIAL_VELOCITY: 'tool_social_velocity',
  TOOL_FUNDING_SCORING: 'tool_funding_scoring',
  TOOL_ENTERPRISE_SCORING: 'tool_enterprise_scoring',
  TOOL_MOMENTUM_SCORING: 'tool_momentum_scoring',
};

const ACTION_TYPES = {
  BUILD: 'BUILD',
  BID: 'BID',
  APPLY: 'APPLY',
  PARTNER: 'PARTNER',
  INVEST: 'INVEST',
  TEACH: 'TEACH',
  IGNORE: 'IGNORE',
};

const OPPORTUNITY_QUADRANTS = {
  HD_LC: 'High Demand / Low Competition',
  HD_HC: 'High Demand / High Competition',
  LD_LC: 'Low Demand / Low Competition',
  LD_HC: 'Low Demand / High Competition',
};

const ACTION_STATUSES = {
  PLANNED: 'planned',
  IN_PROGRESS: 'in_progress',
  EXECUTED: 'executed',
  ABANDONED: 'abandoned',
};

const ANALYSIS_STATUS = {
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

const ALERT_TYPES = {
  NEW_OPPORTUNITY: 'new_opportunity',
  SCORE_CHANGE: 'score_change',
  TREND_ALERT: 'trend_alert',
  SYSTEM: 'system',
};

const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  IMPORTANT: 'important',
};

const DIGEST_FREQUENCIES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
};

const FEEDBACK_TYPES = {
  PLATFORM: 'platform',
  OPPORTUNITY: 'opportunity',
  CONTENT: 'content',
};

const FEEDBACK_STATUS = {
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
};

const FORUM_POST_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  PINNED: 'pinned',
};

const FORUM_CATEGORIES = {
  GENERAL: 'general',
  GOV_CONTRACTS: 'gov_contracts',
  AI_JOBS: 'ai_jobs',
  INVESTMENTS: 'investments',
  GRANTS: 'grants',
  AI_NEWS: 'ai_news',
  PLATFORM: 'platform',
};

const SUBSCRIPTION_FEATURES = {
  PREMIUM_ENDPOINTS: [
    'analysis_trends',
    'analysis_insights',
    'dashboard_charts',
    'opportunity_score_filter',
  ],
};

module.exports = {
  ROLES,
  CONTENT_STATUS,
  SUBSCRIPTION_PLANS,
  PAGINATION,
  USER_ACTIVITY_ACTIONS,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_STATUS,
  INGESTION_STATUS,
  DATA_SOURCE_TYPES,
  ANALYSIS_TYPES,
  ANALYSIS_STATUS,
  ALERT_TYPES,
  ALERT_SEVERITY,
  DIGEST_FREQUENCIES,
  SUBSCRIPTION_FEATURES,
  FEEDBACK_TYPES,
  FEEDBACK_STATUS,
  FORUM_POST_STATUS,
  FORUM_CATEGORIES,
  ACTION_TYPES,
  OPPORTUNITY_QUADRANTS,
  ACTION_STATUSES,
  FREELANCE_ACTION_TYPES,
  FREELANCE_SCORING_WEIGHTS,
};
