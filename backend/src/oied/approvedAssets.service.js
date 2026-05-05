// OIED v8 — Approved Assets service.
//
// Returns the org's allowed services / case studies / banned terms so
// proposal generation stays anchored to real offerings instead of
// hallucinated product names.
//
// Banned terms today is short + hardcoded. Future v9 could move it to
// org settings JSONB so each tenant can manage their own list.

const profileSvc = require('./profile.service');

// Hallucinated product names that gpt-4o-mini occasionally invents,
// plus generic-AI buzzwords v3 COLABERRY_POSITIONING already bans.
const BANNED_TERMS = [
  'StaffMatch',
  'OpsBot',
  'leverage cutting-edge AI',
  'unlock value',
  'synergy',
];

// Map raw service tokens (lowercase, hyphenated) → display names. Keeps
// proposals using consistent capitalization across tenants.
const SERVICE_DISPLAY = {
  'ai-systems':     'AI Systems',
  'data-analytics': 'Data Analytics',
  'data-science':   'Data Science',
  'staffing':       'AI-Augmented Staffing',
  'compliance':     'Compliance & Audit',
  'consulting':     'Strategic Consulting',
  'it-services':    'IT Services',
  'automation':     'Process Automation',
};

function displayServices(rawServices = []) {
  const out = [];
  const seen = new Set();
  for (const s of rawServices) {
    const display = SERVICE_DISPLAY[String(s).toLowerCase()] || String(s);
    if (!seen.has(display)) { seen.add(display); out.push(display); }
  }
  return out;
}

async function getApprovedAssets({ organizationId, userId = null } = {}) {
  let profile = {};
  try {
    const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
    profile = (await profileSvc.getOrDefaultByOrg(orgId)) || {};
  } catch {
    profile = {};
  }
  const services = displayServices(profile.services || []);
  const tools = Array.isArray(profile.tools) ? profile.tools : [];
  const case_studies = Array.isArray(profile.pastWins)
    ? profile.pastWins.slice(0, 10)
    : [];
  const allowed_terms = [...services, ...tools].filter((s, i, arr) => arr.indexOf(s) === i);
  return {
    organization_id: profile.organizationId || organizationId || null,
    services,
    case_studies,
    allowed_terms,
    banned_terms: BANNED_TERMS.slice(),
  };
}

// Pure: case-insensitive scan for any banned term in content. Returns
// the list of banned terms that appeared (preserving original casing
// from BANNED_TERMS), or empty array if clean.
function findBannedTerms(content, banned = BANNED_TERMS) {
  if (!content) return [];
  const lower = String(content).toLowerCase();
  const hits = [];
  for (const t of banned) {
    if (lower.includes(String(t).toLowerCase())) hits.push(t);
  }
  return hits;
}

module.exports = {
  getApprovedAssets,
  findBannedTerms,
  displayServices,
  BANNED_TERMS,
  SERVICE_DISPLAY,
};
