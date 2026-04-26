const CATEGORIES = [
  'Staffing',
  'Data & Analytics',
  'Consulting',
  'Compliance',
  'Financial Services',
  'Education',
  'IT Services',
];

// Canonical product mapping by category. Picking a product is what unlocks
// the PRODUCTIZABLE signal for repeatable categories — without an entry here
// the AI can return null and the rule falls through. Names follow the existing
// pattern (Match/Bot/Sense/Pulse). Rename freely.
const PRODUCT_MAP = {
  Staffing: 'StaffMatch',
  Compliance: 'ComplianceBot',
  'Financial Services': 'BudgetSense',
  Education: 'EduPulse',
  'IT Services': 'OpsBot',
  'Data & Analytics': 'DataLens',
  Consulting: 'AdvisorAI',
};

const CATEGORY_HEURISTICS = {
  Staffing:             { ease: 85, rep_seed: 90, auto_seed: 75 },
  'Data & Analytics':   { ease: 60, rep_seed: 70, auto_seed: 80 },
  Consulting:           { ease: 55, rep_seed: 40, auto_seed: 35 },
  Compliance:           { ease: 40, rep_seed: 75, auto_seed: 65 },
  'Financial Services': { ease: 45, rep_seed: 65, auto_seed: 60 },
  Education:            { ease: 70, rep_seed: 80, auto_seed: 70 },
  'IT Services':        { ease: 60, rep_seed: 65, auto_seed: 70 },
};

const DEFAULT_HEURISTIC = { ease: 50, rep_seed: 50, auto_seed: 50 };

const SIGNAL_CODES = {
  HIGH_ROI: 'HIGH_ROI',
  HIGH_AUTOMATION: 'HIGH_AUTOMATION',
  QUICK_WIN: 'QUICK_WIN',
  PRODUCTIZABLE: 'PRODUCTIZABLE',
};

const SCORING_WEIGHTS = {
  revenue: 0.4,
  automation: 0.3,
  repeatability: 0.2,
  ease: 0.1,
};

const ENRICHMENT_VERSION = 1;

const RAW_TEXT_MAX_STORE = 16000;
const RAW_TEXT_MAX_PROMPT = 4000;

const AI_CLAMP_DELTA = 25;

module.exports = {
  CATEGORIES,
  PRODUCT_MAP,
  CATEGORY_HEURISTICS,
  DEFAULT_HEURISTIC,
  SIGNAL_CODES,
  SCORING_WEIGHTS,
  ENRICHMENT_VERSION,
  RAW_TEXT_MAX_STORE,
  RAW_TEXT_MAX_PROMPT,
  AI_CLAMP_DELTA,
};
