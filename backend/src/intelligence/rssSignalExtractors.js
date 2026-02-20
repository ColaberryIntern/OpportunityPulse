/**
 * Pure deterministic extraction functions for RSS intelligence signals.
 * No DB access, no side effects — follows pattern of classification.rules.js.
 */

const { extractFundingAmount, extractPercentageDelta } = require('../utils/monetaryParser');

// ─── Budget Signal Extraction ──────────────────────────────────────

const BUDGET_PATTERNS = [
  /(?:allocated|appropriat|earmark|commit|dedicat|set aside|designat)\w*\s+\$\s*([\d,]+(?:\.\d+)?)\s*([mMbBtT](?:illion)?)\b/i,
  /budget\s+(?:increase|boost|expansion|of)\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d+)?)\s*([mMbBtT](?:illion)?)\b/i,
  /(?:fiscal\s+year|FY\s*\d{2,4})\s+(?:funding|budget|allocation)\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d+)?)\s*([mMbBtT](?:illion)?)\b/i,
  /modernization\s+(?:funding|budget|investment)\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d+)?)\s*([mMbBtT](?:illion)?)\b/i,
  /capital\s+allocation\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d+)?)\s*([mMbBtT](?:illion)?)\b/i,
  /investment\s+commitment\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d+)?)\s*([mMbBtT](?:illion)?)\b/i,
];

const BUDGET_KEYWORDS = /\b(?:allocated?|budget|appropriat|earmark|fiscal\s+year|modernization\s+fund|capital\s+allocat|investment\s+commit)\w*/i;

const FISCAL_YEAR_PATTERN = /(?:FY\s*(\d{2,4})|fiscal\s+year\s+(\d{4}))/i;

const ENTITY_PATTERNS = [
  /(?:the\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:has\s+)?(?:allocated|appropriated|earmarked|committed|dedicated)/i,
  /(?:allocated|appropriated|earmarked)\s+(?:by|from)\s+(?:the\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i,
];

function extractBudgetSignal(title, description) {
  const text = [title, description].filter(Boolean).join(' ');
  if (!BUDGET_KEYWORDS.test(text)) return null;

  const amount = extractFundingAmount(text);
  if (!amount && !BUDGET_KEYWORDS.test(text)) return null;

  let entityName = null;
  for (const pat of ENTITY_PATTERNS) {
    const m = text.match(pat);
    if (m) { entityName = m[1].trim(); break; }
  }

  const fyMatch = text.match(FISCAL_YEAR_PATTERN);
  const fiscalYear = fyMatch ? (fyMatch[1] || fyMatch[2]) : null;

  const delta = extractPercentageDelta(text);

  const domainGuess = guessDomain(text);

  // Confidence: higher if we got an amount + entity
  let confidence = 0.4;
  if (amount) confidence += 0.3;
  if (entityName) confidence += 0.15;
  if (fiscalYear) confidence += 0.1;
  if (delta) confidence += 0.05;

  return {
    entityName,
    allocationAmount: amount,
    fiscalYear,
    domainGuess,
    deltaPercentage: delta ? delta.value * (delta.direction === 'down' ? -1 : 1) : null,
    confidence: Math.min(1, confidence),
  };
}

// ─── Actor / Winner Signal Extraction ──────────────────────────────

const ACTOR_KEYWORDS = /\b(?:awarded?\s+to|contract\s+won\s+by|selected\s+vendor|prime\s+contractor|subcontractor|grant\s+recipient|task\s+order\s+(?:to|awarded)|chosen\s+by|selected\s+by)\b/i;

const ACTOR_PATTERNS = [
  /awarded?\s+to\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4})/i,
  /contract\s+won\s+by\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4})/i,
  /selected\s+(?:vendor|contractor)\s*:?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4})/i,
  /prime\s+contractor\s*:?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4})/i,
  /grant\s+(?:awarded?\s+to|recipient)\s*:?\s*([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,4})/i,
  /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4})\s+(?:wins?|secures?|awarded?|receives?)\s+\$/i,
  /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4})\s+(?:wins?|secures?)\s+(?:contract|award|deal)/i,
];

const AWARDING_ENTITY_PATTERNS = [
  /(?:from|by)\s+(?:the\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:for|to|worth)/i,
  /([A-Z]{2,6})\s+(?:awards?|selects?|chooses?)\s/i,
];

const ROLE_MAP = {
  'prime contractor': 'prime_contractor',
  'subcontractor': 'subcontractor',
  'grant recipient': 'grant_recipient',
  'selected vendor': 'vendor',
};

function extractActorSignal(title, description) {
  const text = [title, description].filter(Boolean).join(' ');
  if (!ACTOR_KEYWORDS.test(text)) return null;

  let actorName = null;
  for (const pat of ACTOR_PATTERNS) {
    const m = text.match(pat);
    if (m) { actorName = m[1].trim(); break; }
  }
  if (!actorName) return null;

  const amount = extractFundingAmount(text);

  let awardingEntity = null;
  for (const pat of AWARDING_ENTITY_PATTERNS) {
    const m = text.match(pat);
    if (m) { awardingEntity = m[1].trim(); break; }
  }

  let role = 'vendor';
  for (const [keyword, roleValue] of Object.entries(ROLE_MAP)) {
    if (text.toLowerCase().includes(keyword)) { role = roleValue; break; }
  }

  return {
    actorName,
    awardAmount: amount,
    awardingEntity,
    role,
    domainGuess: guessDomain(text),
  };
}

// ─── Enterprise Adoption Signal Extraction ─────────────────────────

const ENTERPRISE_KEYWORDS = /\b(?:deploy(?:ing|s|ed)?\s+AI|scal(?:ing|e)\s+AI|launch(?:ing|es|ed)?\s+AI\s+platform|enterprise[- ]wide\s+(?:AI|rollout)|hiring\s+AI\s+leadership|integrat(?:ing|es|ed)\s+AI\s+into|AI\s+rollout|AI\s+transformation|AI[- ]first\s+strategy)\b/i;

const ENTERPRISE_PATTERNS = [
  /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:is\s+)?(?:deploying|scaling|launching|integrating|rolling out)\s+AI/i,
  /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:announces?|unveils?|reveals?)\s+(?:enterprise|AI)/i,
  /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:adopts?|embraces?|implements?)\s+AI/i,
];

const ACTIVITY_TYPES = {
  deploy: 'deployment',
  scal: 'scaling',
  launch: 'launch',
  integrat: 'integration',
  rollout: 'rollout',
  transform: 'transformation',
  hir: 'hiring',
  adopt: 'adoption',
};

function extractEnterpriseSignal(title, description) {
  const text = [title, description].filter(Boolean).join(' ');
  if (!ENTERPRISE_KEYWORDS.test(text)) return null;

  let companyName = null;
  for (const pat of ENTERPRISE_PATTERNS) {
    const m = text.match(pat);
    if (m) { companyName = m[1].trim(); break; }
  }

  let activityType = 'adoption';
  const lowerText = text.toLowerCase();
  for (const [prefix, type] of Object.entries(ACTIVITY_TYPES)) {
    if (lowerText.includes(prefix)) { activityType = type; break; }
  }

  const amount = extractFundingAmount(text);

  let confidence = 0.5;
  if (companyName) confidence += 0.25;
  if (amount) confidence += 0.15;
  if (/enterprise[- ]wide/i.test(text)) confidence += 0.1;

  return {
    companyName,
    activityType,
    estimatedSpendSignal: amount,
    capabilityGuess: guessCapability(text),
    confidence: Math.min(1, confidence),
  };
}

// ─── Compliance / Regulation Signal Extraction ─────────────────────

const COMPLIANCE_KEYWORDS = /\b(?:AI\s+Act|regulatory\s+enforcement|AI\s+audit|compliance\s+mandate|FTC\s+investigation|state\s+AI\s+bill|executive\s+order\s+on\s+AI|AI\s+regulation|AI\s+governance\s+(?:rule|law|regulation|framework)|NIST\s+AI|EU\s+AI|AI\s+safety\s+(?:mandate|rule|law))\b/i;

const JURISDICTION_PATTERNS = [
  { pattern: /\bEU\b|European\s+Union/i, jurisdiction: 'EU' },
  { pattern: /\bFTC\b|Federal\s+Trade\s+Commission/i, jurisdiction: 'US-Federal' },
  { pattern: /\bNIST\b/i, jurisdiction: 'US-Federal' },
  { pattern: /\bSEC\b|Securities\s+and\s+Exchange/i, jurisdiction: 'US-Federal' },
  { pattern: /\bstate\s+(?:of\s+)?([A-Z][a-z]+)/i, jurisdiction: 'US-State' },
  { pattern: /\bChinese?\b|China/i, jurisdiction: 'China' },
  { pattern: /\bUK\b|United\s+Kingdom|Britain/i, jurisdiction: 'UK' },
  { pattern: /executive\s+order/i, jurisdiction: 'US-Federal' },
];

const REGULATION_TYPES = {
  'AI Act': 'comprehensive_regulation',
  'audit': 'audit_requirement',
  'enforcement': 'enforcement_action',
  'investigation': 'investigation',
  'mandate': 'mandate',
  'bill': 'legislation',
  'executive order': 'executive_order',
  'safety': 'safety_standard',
  'governance': 'governance_framework',
};

const SEVERITY_KEYWORDS = {
  high: /\b(?:enforc|investigat|penalt|fine|ban|prohibit|suspend|revoke)\w*/i,
  medium: /\b(?:mandat|requir|audit|compli|must|shall)\w*/i,
  low: /\b(?:guideline|framework|recommend|voluntary|suggest)\w*/i,
};

function extractComplianceSignal(title, description) {
  const text = [title, description].filter(Boolean).join(' ');
  if (!COMPLIANCE_KEYWORDS.test(text)) return null;

  let jurisdiction = 'Unknown';
  for (const { pattern, jurisdiction: j } of JURISDICTION_PATTERNS) {
    if (pattern.test(text)) { jurisdiction = j; break; }
  }

  let regulationType = 'general';
  const lowerText = text.toLowerCase();
  for (const [keyword, type] of Object.entries(REGULATION_TYPES)) {
    if (lowerText.includes(keyword.toLowerCase())) { regulationType = type; break; }
  }

  let enforcementSeverity = 'medium';
  if (SEVERITY_KEYWORDS.high.test(text)) enforcementSeverity = 'high';
  else if (SEVERITY_KEYWORDS.low.test(text)) enforcementSeverity = 'low';

  // Estimate spend pressure: high enforcement = high spend pressure
  const severityToSpend = { high: 'high', medium: 'medium', low: 'low' };

  return {
    jurisdiction,
    regulationType,
    enforcementSeverity,
    expectedSpendPressure: severityToSpend[enforcementSeverity],
  };
}

// ─── Shared Helpers ────────────────────────────────────────────────

const DOMAIN_HINTS = {
  defense_ai: /\b(?:DoD|Pentagon|military|defense|DARPA|Army|Navy|Air Force)\b/i,
  healthcare_ai: /\b(?:HHS|NIH|FDA|healthcare|medical|pharma|biotech|clinical)\b/i,
  finance_ai: /\b(?:SEC|Treasury|banking|fintech|financial|Wall Street|JPMorgan|Goldman)\b/i,
  energy_ai: /\b(?:DOE|energy|grid|solar|renewable|oil|gas)\b/i,
  education_ai: /\b(?:education|university|school|EdTech)\b/i,
  ai_governance: /\b(?:NIST|FTC|governance|regulation|compliance|audit)\b/i,
  gov_modernization_ai: /\b(?:GSA|OMB|federal\s+IT|gov(?:ernment)?\s+moderniz)\b/i,
};

function guessDomain(text) {
  for (const [domain, pattern] of Object.entries(DOMAIN_HINTS)) {
    if (pattern.test(text)) return domain;
  }
  return null;
}

const CAPABILITY_HINTS = {
  nlp: /\b(?:NLP|natural\s+language|language\s+model|LLM|GPT|chatbot|text\s+analysis)\b/i,
  computer_vision: /\b(?:computer\s+vision|image\s+recognition|object\s+detection|visual\s+AI)\b/i,
  ml_ops: /\b(?:MLOps|model\s+deployment|ML\s+pipeline|model\s+monitoring)\b/i,
  generative_ai: /\b(?:generative\s+AI|GenAI|content\s+generation|text-to-image)\b/i,
  robotics: /\b(?:robot|autonomous|drone|self-driving)\b/i,
  cybersecurity: /\b(?:cybersecurity|threat\s+detection|security\s+AI)\b/i,
};

function guessCapability(text) {
  for (const [capability, pattern] of Object.entries(CAPABILITY_HINTS)) {
    if (pattern.test(text)) return capability;
  }
  return null;
}

/**
 * Run all four extractors on an opportunity's text.
 * Returns an object with only non-null signals.
 * @param {string} title
 * @param {string} description
 * @returns {{ budget?: object, actor?: object, enterprise?: object, compliance?: object }|null}
 */
function extractAllSignals(title, description) {
  const budget = extractBudgetSignal(title, description);
  const actor = extractActorSignal(title, description);
  const enterprise = extractEnterpriseSignal(title, description);
  const compliance = extractComplianceSignal(title, description);

  const signals = {};
  if (budget) signals.budget = budget;
  if (actor) signals.actor = actor;
  if (enterprise) signals.enterprise = enterprise;
  if (compliance) signals.compliance = compliance;

  return Object.keys(signals).length > 0 ? signals : null;
}

/**
 * Check if text contains keywords suggesting it might have extractable signals
 * worth sending to LLM for deeper analysis.
 */
function hasEnrichmentPotential(title, description) {
  const text = [title, description].filter(Boolean).join(' ');
  return /\$|awarded|enterprise|compliance|regulation|contract|budget|vendor|deploy/i.test(text);
}

module.exports = {
  extractBudgetSignal,
  extractActorSignal,
  extractEnterpriseSignal,
  extractComplianceSignal,
  extractAllSignals,
  hasEnrichmentPotential,
};
