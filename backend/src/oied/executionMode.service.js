// OIED v9 - Execution Mode service.
//
// Decides whether an opportunity is one Colaberry can pursue as PRIME
// (direct_submit), one that requires a teaming partner with operational
// capability Colaberry doesn't have (partner_required), or one to skip
// entirely (ignore).
//
// Pure function: takes opp + profile + approvedAssets + grounding and
// returns an execution mode + (when relevant) a partner_profile sketch.
// The recommendation/intelligence path embeds the result in the context
// envelope and may override `recommended_action` for pre-draft opps.

// Operational-blocker keywords (lowercase, substring scan against title +
// description + scope_summary). Presence = Colaberry can't deliver as prime.
// Grouped by industry so partner_profile can name the gap.
const OPERATIONAL_BLOCKERS = {
  waste_management: [
    'waste collection', 'curbside', 'recycling', 'recyclable',
    'dumpster', 'disposal', 'trash', 'refuse', 'sanitation',
    'solid waste',
  ],
  construction: [
    'construction', 'roofing', 'roof replacement', 'concrete',
    'asphalt', 'paving', 'demolition', 'renovation', 'remodel',
    'general contractor', 'masonry', 'flooring',
  ],
  transportation: [
    'transportation services', 'hauling', 'trucking', 'fleet',
    'vehicle', 'truck', 'delivery service', 'courier',
  ],
  field_services: [
    'landscaping', 'janitorial', 'cleaning service', 'pest control',
    'food service', 'catering', 'security guard', 'maintenance crew',
    'field technician', 'snow removal',
  ],
  physical_infrastructure: [
    'water system', 'sewer', 'pipeline', 'electrical service',
    'hvac installation', 'plumbing',
  ],
};

// Support-layer keywords - Colaberry's services overlay.
const SUPPORT_LAYER = [
  // Tech / data
  'data analytics', 'analytics', 'dashboard', 'reporting', 'data',
  'system', 'software', 'application', 'platform',
  // Workforce
  'staffing', 'recruitment', 'training', 'personnel', 'workforce',
  'human resources',
  // Compliance
  'compliance', 'audit', 'regulation', 'policy', 'documentation',
  // Strategy
  'consulting', 'assessment', 'advisory', 'optimization', 'strategy',
];

// Strong direct-fit keywords - Colaberry can prime.
const DIRECT_FIT = [
  'artificial intelligence', 'machine learning', 'ai-',
  'automation', 'chatbot', 'llm', 'generative ai', 'genai',
  'it services', 'it modernization', 'cloud migration',
  'digital transformation', 'data science', 'data engineering',
];

function lowerJoin(...parts) {
  return parts.filter(Boolean).map(String).join(' ').toLowerCase();
}

function countMatchesFlat(text, list) {
  const matched = [];
  for (const term of list) {
    if (text.includes(term)) matched.push(term);
  }
  return { count: matched.length, matched };
}

function countBlockers(text) {
  const matched = {};
  let total = 0;
  for (const [industry, terms] of Object.entries(OPERATIONAL_BLOCKERS)) {
    const hits = terms.filter((t) => text.includes(t));
    if (hits.length > 0) {
      matched[industry] = hits;
      total += hits.length;
    }
  }
  return { total, matched };
}

// Profile-overlap signal: how many of the org's services map onto the
// opp's category / aiAnalysis recommended product. Token-based so
// 'data-analytics' matches descriptions mentioning 'data' or 'analytics'.
function profileOverlapScore({ profile, opp }) {
  if (!profile || !Array.isArray(profile.services)) return 0;
  const oppText = lowerJoin(
    opp && opp.category,
    opp && opp.aiAnalysis && opp.aiAnalysis.ai_category,
    opp && opp.aiAnalysis && opp.aiAnalysis.recommended_product,
  );
  if (!oppText) return 0;
  let hits = 0;
  for (const s of profile.services) {
    const tokens = String(s).toLowerCase().split('-');
    if (tokens.some((t) => t.length >= 3 && oppText.includes(t))) hits += 1;
  }
  return hits;
}

// Geography heuristic: agency suffix "(slug)" in sourceData.agency, then
// opp.location, then null.
function deriveGeography({ opp }) {
  const agency = (opp && opp.sourceData && opp.sourceData.agency) || '';
  const slug = /\(([^)]+)\)\s*$/.exec(agency);
  if (slug && slug[1]) {
    const s = slug[1].toLowerCase();
    if (s === 'utah') return 'Utah';
    if (s === 'detroit') return 'Michigan (Detroit)';
    if (s === 'twc-texas-gov') return 'Texas';
    if (s === 'dallascityhall') return 'Texas (Dallas)';
    if (s === 'libertyhilltx') return 'Texas (Liberty Hill)';
    if (s === 'metra') return 'Illinois (Metra)';
    return slug[1].charAt(0).toUpperCase() + slug[1].slice(1);
  }
  if (opp && opp.location) {
    const m = String(opp.location).match(/,\s*([A-Z]{2})\b/);
    if (m) return m[1];
    return opp.location;
  }
  return null;
}

function deriveSizeBand({ value }) {
  const v = Number(value) || 0;
  if (v <= 0)        return 'any';
  if (v < 100_000)   return 'regional_small';
  if (v < 5_000_000) return 'regional_mid_market';
  return 'any';
}

function pickPrimaryIndustry(matched) {
  const keys = Object.keys(matched);
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  return keys.sort((a, b) => matched[b].length - matched[a].length)[0];
}

function colaberryContribution({ approvedAssets, supportMatched }) {
  const services = (approvedAssets && approvedAssets.services) || [];
  if (services.length > 0) return services.slice(0, 6);
  // Fallback: synthesize from support keywords matched.
  const fromSupport = [];
  const re = (rx) => supportMatched.some((t) => rx.test(t));
  if (re(/staff|recruit|workforce|personnel/))     fromSupport.push('AI-Augmented Staffing');
  if (re(/analyt|dashboard|reporting|data/))        fromSupport.push('Data Analytics');
  if (re(/complian|audit|regulation|polic/))        fromSupport.push('Compliance & Audit');
  if (re(/consult|assess|advisory|strategy/))       fromSupport.push('Strategic Consulting');
  if (re(/software|system|application|platform/))   fromSupport.push('IT Services');
  return fromSupport;
}

function capabilitiesNeededFor(industry) {
  switch (industry) {
    case 'waste_management':
      return ['fleet_and_collection_operations', 'transfer_station_relationships'];
    case 'construction':
      return ['field_construction_workforce', 'equipment_and_materials_supply'];
    case 'transportation':
      return ['vehicle_fleet_and_drivers'];
    case 'field_services':
      return ['field_workforce_and_equipment'];
    case 'physical_infrastructure':
      return ['licensed_physical_trade_workforce'];
    default:
      return ['operational_delivery_capability'];
  }
}

function derivePartnerProfile({ opp, blockersMatched, supportMatched, approvedAssets }) {
  const industry = pickPrimaryIndustry(blockersMatched) || 'unknown';
  return {
    geography: deriveGeography({ opp }),
    size_band: deriveSizeBand({ value: opp && opp.value }),
    industry,
    capabilities_needed: capabilitiesNeededFor(industry),
    colaberry_contribution: colaberryContribution({ approvedAssets, supportMatched }),
    avoid: ['national_scale_primes_with_internal_capability'],
  };
}

function hasEnoughForOutreach({ partnerProfile, grounding }) {
  if (!partnerProfile || !partnerProfile.geography) return false;
  if (!grounding || grounding.status !== 'ok') return false;
  if (!grounding.scope_summary) return false;
  if (!grounding.solicitation_id) return false;
  return true;
}

function computeExecutionMode({
  opp,
  profile = null,
  approvedAssets = null,
  grounding = null,
} = {}) {
  const text = lowerJoin(
    opp && opp.title,
    opp && opp.description,
    grounding && grounding.scope_summary,
    opp && opp.category,
  );

  const blockers = countBlockers(text);
  const support  = countMatchesFlat(text, SUPPORT_LAYER);
  const direct   = countMatchesFlat(text, DIRECT_FIT);
  const overlap  = profileOverlapScore({ profile, opp });

  const baseSignals = {
    blockers: blockers.total,
    support: support.count,
    direct: direct.count,
    overlap,
  };

  // Direct submit - strong fit signals, no operational blockers.
  if (blockers.total === 0 && (direct.count >= 1 || overlap >= 2)) {
    return {
      execution_mode: 'direct_submit',
      partner_profile: null,
      outreach_ready: false,
      signals: baseSignals,
    };
  }

  // Partner required - has blockers, but Colaberry's services overlay.
  if (blockers.total >= 1 && support.count >= 2) {
    const partnerProfile = derivePartnerProfile({
      opp,
      blockersMatched: blockers.matched,
      supportMatched: support.matched,
      approvedAssets,
    });
    return {
      execution_mode: 'partner_required',
      partner_profile: partnerProfile,
      outreach_ready: hasEnoughForOutreach({ partnerProfile, grounding }),
      signals: baseSignals,
    };
  }

  // Ignore - has blockers, no meaningful support overlap.
  if (blockers.total >= 1 && support.count < 2) {
    return {
      execution_mode: 'ignore',
      partner_profile: null,
      outreach_ready: false,
      signals: baseSignals,
    };
  }

  // Default conservative: direct_submit so v9 doesn't downgrade existing flows.
  return {
    execution_mode: 'direct_submit',
    partner_profile: null,
    outreach_ready: false,
    signals: baseSignals,
  };
}

module.exports = {
  computeExecutionMode,
  derivePartnerProfile,
  deriveGeography,
  deriveSizeBand,
  hasEnoughForOutreach,
  capabilitiesNeededFor,
  OPERATIONAL_BLOCKERS,
  SUPPORT_LAYER,
  DIRECT_FIT,
};
