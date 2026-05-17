// Strategic Intelligence Overlay — deterministic classification dictionaries.
//
// Each keyword can match MULTIPLE categories (intentional — "compliance"
// is operational_pain + procurement_language + regulated_domains).
// Lookups are SUBSTRING-based (lowercased), so "data compliance" matches
// the "compliance" entry. Order matters only when we report the dominant
// strategic_category (first match wins in the dominantCategory() helper).

// Operational pain signals — the language of an org's daily friction.
// These keywords mean "something hurts" and that pain is what venture-able
// products solve. STRONG strategic leverage when paired with procurement.
const OPERATIONAL_PAIN = [
  'bottleneck', 'backlog', 'manual', 'manual entry', 'manual process',
  'paperwork', 'spreadsheet', 'inefficient', 'slow', 'duplicate',
  'rework', 'error', 'mistake', 'turnover', 'attrition',
  'staffing shortage', 'burnout', 'workload', 'overwhelmed',
  'compliance', 'audit', 'reporting burden', 'silos', 'silo',
  'fragmented', 'legacy', 'legacy system', 'paper-based',
  'workaround', 'patchwork', 'understaffed', 'short-staffed',
  'reconciliation', 'reconcile', 'rekeying',
];

// Procurement language — phrases that show up in RFPs, SOWs, grants,
// bonfire postings. STRONG strategic leverage in their own right; very
// strong when matched against operational_pain.
const PROCUREMENT_LANGUAGE = [
  'rfp', 'request for proposal', 'sow', 'statement of work',
  'task order', 'idiq', 'gsa', 'contract vehicle', 'set-aside',
  '8(a)', 'small business', 'sdvosb', 'wosb', 'hubzone', 'naics',
  'far ', 'modification', 'amendment', 'solicitation',
  'pre-solicitation', 'sources sought', 'rfi', 'rfq',
  'bpa', 'blanket purchase', 'contracting officer',
  'sam.gov', 'period of performance', 'procurement', 'bid',
  'evaluation criteria', 'past performance', 'capability statement',
];

// Modernization language — programs that signal a budgeted modernization
// initiative (the strongest single procurement signal).
const MODERNIZATION_LANGUAGE = [
  'modernization', 'transformation', 'digital transformation',
  'cloud migration', 'cloud adoption', 'cloud-first', 'cloud first',
  'legacy modernization', 'mainframe modernization',
  'replatform', 'refactor', 're-architect',
  'sso', 'identity', 'zero trust', 'zero-trust',
  'platform consolidation', 'consolidation', 'shared services',
  'paperless', 'digitization', 'digitalize', 'digitisation',
  'automation', 'rpa', 'low-code', 'no-code', 'low code',
  'soa to api', 'monolith to microservices', 'microservices',
  'ai adoption', 'ai readiness', 'data modernization',
  'data lake', 'data warehouse', 'data platform',
];

// Emerging AI — fresh research/AI vocabulary that hasn't fully
// commercialized yet but has clear demand signals.
const EMERGING_AI = [
  'agentic', 'agent', 'agentic workflow', 'agentic ai',
  'multi-agent', 'multi agent', 'orchestration',
  'rag', 'retrieval augmented', 'retrieval-augmented',
  'fine-tuning', 'finetune', 'lora', 'peft',
  'vector', 'vector search', 'vector database', 'embedding',
  'mcp', 'tool calling', 'tool use', 'function calling',
  'reasoning', 'chain of thought', 'chain-of-thought',
  'evals', 'eval', 'guardrail', 'safety',
  'sora', 'gemini', 'claude', 'gpt-4', 'gpt-5',
  'llama', 'mixtral', 'gemma',
  'world model', 'foundation model',
  'small language model', 'slm', 'distillation',
  'inference', 'serving',
];

// Regulated domains — verticals where compliance, audit, and procurement
// rules apply heavily. Boost when paired with operational_pain + procurement.
const REGULATED_DOMAINS = [
  'healthcare', 'health care', 'medical', 'clinical', 'patient',
  'ehr', 'electronic health record', 'hipaa', 'phi', 'hitech',
  'pharma', 'pharmaceutical', 'biotech', 'fda',
  'finance', 'banking', 'insurance', 'fintech', 'regtech',
  'aml', 'anti-money laundering', 'kyc', 'know your customer',
  'sox', 'pci', 'gdpr', 'ccpa', 'glba',
  'defense', 'dod', 'classified', 'security clearance', 'cmmc',
  'fedramp', 'fisma', 'nist', 'cui',
  'energy', 'oil and gas', 'utilities', 'nuclear', 'nerc',
  'aviation', 'faa', 'airline',
  'education', 'ferpa', 'k-12', 'higher ed', 'higher education',
  'food', 'fda food', 'usda', 'safety',
  'cybersecurity', 'security',
  'government', 'federal', 'state government', 'municipal', 'public sector',
];

// Infrastructure — AI / data / cloud infra primitives.
const INFRASTRUCTURE = [
  'kubernetes', 'k8s', 'docker', 'container',
  'aws', 'azure', 'gcp', 'cloud',
  'snowflake', 'databricks', 'bigquery', 'redshift',
  'kafka', 'spark', 'airflow', 'dbt',
  'postgres', 'mysql', 'mongo', 'mongodb',
  'redis', 'elasticsearch',
  'terraform', 'ci/cd', 'cicd',
  'observability', 'monitoring', 'datadog', 'splunk',
  'iam', 'identity management',
];

// Workforce pressure — talent/hiring signals (RFQ writers, AI talent,
// healthcare workforce, etc.).
const WORKFORCE_PRESSURE = [
  'staffing', 'staffing shortage', 'shortage',
  'hiring', 'workforce', 'talent', 'talent shortage',
  'training', 'reskill', 'reskilling', 'upskill', 'upskilling',
  'burnout', 'turnover', 'attrition', 'retention',
  'nurse', 'nursing', 'physician', 'caregiver',
  'teacher', 'educator',
  'cyber talent', 'cybersecurity talent',
  'data scientist', 'data engineer', 'ml engineer',
  'developer shortage', 'engineer shortage',
];

// Compliance pressure — specific signals that an org is responding to
// new regulation or audit findings.
const COMPLIANCE_PRESSURE = [
  'compliance', 'audit', 'regulatory', 'regulation',
  'gdpr', 'ccpa', 'hipaa', 'sox', 'pci',
  'fedramp', 'fisma', 'cmmc', 'nist',
  'ai act', 'eu ai', 'executive order',
  'consent decree', 'finding', 'breach', 'data breach',
  'incident', 'incident response', 'soc 2', 'soc2',
  'iso 27001', 'iso27001',
];

// Automation categories — process/work categories ripe for AI.
const AUTOMATION_CATEGORIES = [
  'document processing', 'document intelligence', 'idp',
  'invoice processing', 'invoice', 'accounts payable',
  'claims processing', 'claims', 'prior authorization',
  'underwriting', 'fraud detection',
  'customer support', 'helpdesk', 'service desk',
  'recruiting', 'screening', 'resume screening',
  'contract review', 'contract analysis', 'cla',
  'translation', 'transcription',
  'workflow automation', 'process automation', 'rpa',
  'data entry', 'data extraction',
];

// Commercialization signals — when a research term is moving toward
// procurement. Phrases that appear in budget/funding/sales contexts.
const COMMERCIALIZATION_SIGNALS = [
  'production', 'enterprise', 'enterprise-ready', 'enterprise ready',
  'ga', 'general availability',
  'launch', 'launches', 'available', 'now available',
  'pricing', 'subscription',
  'pilot', 'poc', 'proof of concept', 'proof-of-concept',
  'deploy', 'deployment', 'rollout',
  'roi', 'cost savings', 'savings', 'fte savings',
  'series a', 'series b', 'series c', 'funding round',
  'ipo', 'acquisition', 'acquires', 'acquired',
];

// Operational outcomes — the THING an org wants to buy.
const OPERATIONAL_OUTCOMES = [
  'cost reduction', 'cost savings', 'efficiency',
  'productivity', 'throughput', 'cycle time',
  'time to value', 'time-to-value',
  'customer satisfaction', 'csat', 'nps',
  'patient outcome', 'patient outcomes', 'patient safety',
  'student outcome', 'student outcomes',
  'first call resolution', 'fcr',
  'reduction in errors', 'error reduction',
  'risk reduction', 'risk mitigation',
];

// Curated map of category → keyword list. Keys are stable identifiers
// the rest of the system references.
const STRATEGIC_DICTIONARIES = {
  operational_pain: OPERATIONAL_PAIN,
  procurement_language: PROCUREMENT_LANGUAGE,
  modernization_language: MODERNIZATION_LANGUAGE,
  emerging_ai: EMERGING_AI,
  regulated_domains: REGULATED_DOMAINS,
  infrastructure: INFRASTRUCTURE,
  workforce_pressure: WORKFORCE_PRESSURE,
  compliance_pressure: COMPLIANCE_PRESSURE,
  automation_categories: AUTOMATION_CATEGORIES,
  commercialization_signals: COMMERCIALIZATION_SIGNALS,
  operational_outcomes: OPERATIONAL_OUTCOMES,
};

// Lowercased substring sets per category for fast membership checks.
const STRATEGIC_SETS = Object.fromEntries(
  Object.entries(STRATEGIC_DICTIONARIES).map(([k, list]) => [
    k, list.map((s) => String(s).toLowerCase()),
  ]),
);

// Category priority for "dominant category" tie-breaking — when a word
// belongs to multiple categories, the earliest-listed one wins. Order
// reflects strategic information density (operational_pain + procurement
// are the most actionable signals).
const CATEGORY_PRIORITY = [
  'procurement_language',
  'operational_pain',
  'compliance_pressure',
  'modernization_language',
  'regulated_domains',
  'commercialization_signals',
  'automation_categories',
  'emerging_ai',
  'workforce_pressure',
  'operational_outcomes',
  'infrastructure',
];

function normalizeWord(word) {
  return String(word || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Substring containment — "data compliance" matches "compliance".
function wordMatches(word, phrase) {
  const w = normalizeWord(word);
  const p = String(phrase).toLowerCase();
  if (!w || !p) return false;
  if (w === p) return true;
  return w.includes(p) || p.includes(w);
}

function categoriesFor(word) {
  const out = [];
  const w = normalizeWord(word);
  if (!w) return out;
  for (const [cat, phrases] of Object.entries(STRATEGIC_SETS)) {
    for (const p of phrases) {
      if (w === p || w.includes(p) || (p.length >= 5 && p.includes(w))) {
        out.push(cat);
        break;
      }
    }
  }
  return out;
}

function dominantCategory(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return null;
  for (const cat of CATEGORY_PRIORITY) {
    if (categories.includes(cat)) return cat;
  }
  return categories[0];
}

module.exports = {
  STRATEGIC_DICTIONARIES,
  STRATEGIC_SETS,
  CATEGORY_PRIORITY,
  OPERATIONAL_PAIN,
  PROCUREMENT_LANGUAGE,
  MODERNIZATION_LANGUAGE,
  EMERGING_AI,
  REGULATED_DOMAINS,
  INFRASTRUCTURE,
  WORKFORCE_PRESSURE,
  COMPLIANCE_PRESSURE,
  AUTOMATION_CATEGORIES,
  COMMERCIALIZATION_SIGNALS,
  OPERATIONAL_OUTCOMES,
  normalizeWord,
  wordMatches,
  categoriesFor,
  dominantCategory,
};
