// Disqualification taxonomy + verdict engine. Turns a high-scoring opportunity into
// a BID / NO_BID / CONDITIONAL verdict so the digest + app can show WHY a row that
// scores well is actually dead. See directives/OPPORTUNITY_VETTING_AND_DISQUALIFICATION.md
//
// Two verdict sources, in priority order:
//   1. KNOWN_VERDICTS — human/AI deep-vet results from reading the actual RFP docs.
//      Authoritative (auto:false). Matched by a title regex.
//   2. autoFlag() — cheap pre-download heuristics over title/agency/description.
//      Tentative caution only (auto:true); a known verdict always overrides.

// Taxonomy: code -> short default label. Full rationale lives in the directive.
const DISQUALIFIERS = {
  CERT_WALL: 'Security cert required at submission (TX-RAMP / SOC 2 / CJIS / FedRAMP)',
  DOMAIN_MISMATCH: 'Outside Colaberry delivery lane',
  SCALE_WALL: 'Enterprise scale / financial-capacity wall',
  EXPERIENCE_GATE: 'Mandatory N years of specific prior experience',
  PRODUCT_REQUIRED: 'Requires an existing commercial product we do not have',
  PHYSICAL_INSTALL: 'Physical furnish-and-install / bid bond',
  SET_ASIDE_INELIGIBLE: 'Set-aside we are not certified for (8a / WOSB / HUBZone / SDVOSB)',
  DEADLINE_TIGHT: 'Real deadline under 14 days',
  INCUMBENT_LOCK: 'Re-compete wired to the incumbent',
};

// Pre-download heuristics. First match wins. Kept conservative — these only triage.
const AUTO_SIGNALS = [
  { code: 'CERT_WALL', re: /tx-?ramp|\bsoc ?2\b|stateramp|govramp|fedramp|\bcjis\b|\bfips\b|hecvat|criminal justice|housing and community affairs|\btdhca\b|\btdcj\b/i },
  { code: 'PHYSICAL_INSTALL', re: /curbside|signage|\bIFB\b|furnish and install|bid bond|\bHVAC\b|building automation|construction|general contractor|job order contract|pump station|paver|paving|pavement|plumbing|roofing|electrician|electrical work|demolition|\bconcrete\b|asphalt|fencing|sidewalk|\bbridge\b|sewer|water treatment|building (interior|improvement|renovation)|\bmechanical\b|elevator|\bboiler\b|hvac/i },
  { code: 'DOMAIN_MISMATCH', re: /property manag|real estate|residential|group home|\bDCFS\b|\bDHHS\b|foster|child care|audio ?visual|metering|transportation software|janitor|custodial|landscap|grounds maintenance|food service|catering|\bfleet\b|uniform|massage|security guard|armed guard|guard services|\bvehicles?\b|light rail|\bbus(es)?\b|solid waste|recycl|refuse|\bfurniture\b|tree (removal|trim|service)|\bfuel\b|towing|pest control|\blaundry\b|locksmith|snow removal/i },
  { code: 'SCALE_WALL', re: /application services|managed services|\bERP\b|enterprise outsourc|parent guarantee|source code escrow/i },
  { code: 'PRODUCT_REQUIRED', re: /licensing system|financial reporting system|video creation|comprehensive .* software|agenda (and )?meeting/i },
  { code: 'EXPERIENCE_GATE', re: /minimum of (three|five|3|5|ten|10) \(?\d*\)? years|years of experience producing|prior (deployments|implementations)/i },
];

// Deep-vet results from reading the actual documents this engagement. Authoritative.
// `match` is tested (case-insensitive) against the opportunity title.
const KNOWN_VERDICTS = [
  { match: /jefferson high school building automation|building automation system \(bas\)/i, status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: building-automation/HVAC, not our lane' },
  { match: /comprehensive transportation software/i, status: 'no_bid', disqualifier: 'PRODUCT_REQUIRED', label: 'No-bid: needs an existing student-transportation software product' },
  { match: /advanced metering infrastructure|\bAMI\b proof of concept/i, status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: smart-metering/utility OT, not our lane' },
  { match: /community development software for housing/i, status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid: TX-RAMP required at submission (UTD)' },
  { match: /juvenile justice control system/i, status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid: CJIS criminal-justice data' },
  { match: /residential small group home|services for dhhs clients|supports waiver|emergency placement|short-term shelter/i, status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: social-services delivery, not a software/AI build' },
  { match: /application services/i, status: 'no_bid', disqualifier: 'SCALE_WALL', label: 'No-bid: enterprise ERP/AMS outsourcing (parent guarantee, TxDOT scale)' },
  { match: /property management services/i, status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: operational property management (HUD), no Colaberry build role' },
  { match: /multi-family apartments|mansell manor/i, status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: housing/property, not our lane' },
  { match: /terminal d south digital curbside/i, status: 'no_bid', disqualifier: 'PHYSICAL_INSTALL', label: 'No-bid: physical signage install (IFB + bid bond + plans)' },
  { match: /audio[- ]?visual equipment/i, status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: AV hardware integration, not AI/software' },
  { match: /multifamily management system/i, status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid: TX-RAMP + SOC 2 (TDHCA)' },
  { match: /financial reporting system/i, status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid: Harris USRA + SOC 2 security controls' },
  { match: /agenda (and )?meeting/i, status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid: SOC 2 + USRA (Harris)' },
  { match: /salt lake city.*agenda|slci.*agenda/i, status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid: SOC 2 (Salt Lake City)' },
  { match: /upskill/i, status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'Not a bid: employer-applies model; register as a training provider instead' },
  { match: /supporting career shift/i, status: 'no_bid', disqualifier: 'DEADLINE_TIGHT', label: 'No-bid: WIOA grant, deadline too tight to prepare' },
  // Conditional — clears every gate except one a partner can satisfy.
  { match: /infill housing strategy/i, status: 'conditional', disqualifier: 'EXPERIENCE_GATE', label: 'Conditional: needs Que (5-yr infill-housing financial-modeling gate)', lane: 'services', unblocked_by: 'Que: 5-yr infill-housing experience' },
];

function autoFlag(opp = {}) {
  const hay = `${opp.title || ''} ${opp.agency || ''} ${opp.fullParentPathName || ''} ${(opp.description || '').slice(0, 600)}`;
  for (const sig of AUTO_SIGNALS) {
    if (sig.re.test(hay)) {
      return {
        status: 'needs_review',
        disqualifier: sig.code,
        label: `Likely no-bid: ${DISQUALIFIERS[sig.code]}`,
        evidence: null,
        lane: null,
        auto: true,
        vetted_at: null,
      };
    }
  }
  return null; // nothing flagged — a genuine candidate until deep-vetted
}

// Authoritative verdict if known, else a tentative auto-flag, else null.
function verdictFor(opp = {}) {
  const title = String(opp.title || '');
  const known = KNOWN_VERDICTS.find((k) => k.match.test(title));
  if (known) {
    return {
      status: known.status,
      disqualifier: known.disqualifier,
      label: known.label,
      evidence: known.evidence || null,
      lane: known.lane || null,
      unblocked_by: known.unblocked_by || null,
      auto: false,
      vetted_at: new Date().toISOString(),
    };
  }
  return autoFlag(opp);
}

module.exports = { DISQUALIFIERS, AUTO_SIGNALS, KNOWN_VERDICTS, autoFlag, verdictFor };
