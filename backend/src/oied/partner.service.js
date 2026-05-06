// OIED v9 - Partner service.
//
// Two responsibilities:
//   1. findCandidatePartners({opp, partnerProfile}) - returns the
//      partner_profile + a candidates list. v1 returns an empty list
//      (no partner_candidates table yet); the shape is in place so a
//      future iteration can plug in a registry.
//   2. composeOutreachDraft({opp, partnerProfile, primeName,
//      grounding, approvedAssets}) - returns a markdown outreach draft
//      to a named prospective prime. Sending is human-gated; this
//      function only produces text.

const { findBannedTerms } = require('./approvedAssets.service');

function findCandidatePartners({ opp, partnerProfile }) {
  if (!opp || !partnerProfile) {
    throw new Error('findCandidatePartners requires opp and partnerProfile');
  }
  // v1: no candidate registry. Return shape so consumer can render.
  return {
    opportunity_id: opp.id,
    partner_profile: partnerProfile,
    candidates: [],
    note: 'No partner candidate registry exists yet. Procurement team supplies prime name to compose outreach.',
  };
}

function composeOutreachDraft({
  opp,
  partnerProfile,
  primeName,
  grounding = null,
  approvedAssets = null,
} = {}) {
  if (!opp) throw new Error('composeOutreachDraft requires opp');
  if (!partnerProfile) throw new Error('composeOutreachDraft requires partnerProfile');
  if (!primeName || !String(primeName).trim()) {
    throw new Error('composeOutreachDraft requires primeName');
  }

  const agency  = (grounding && grounding.agency_name) || (opp.sourceData && opp.sourceData.agency) || 'the agency';
  const solId   = (grounding && grounding.solicitation_id) || opp.sourceId || '';
  const oppTitle = opp.title || 'an upcoming procurement';
  const services = (approvedAssets && approvedAssets.services) || partnerProfile.colaberry_contribution || [];
  const contributionList = services.length > 0 ? services.slice(0, 5).join(', ') : 'AI-augmented staffing, data analytics, and compliance support';
  const capabilitiesList = (partnerProfile.capabilities_needed || []).join(', ');
  const geography = partnerProfile.geography || 'the project geography';
  const solLine = solId ? ` (Solicitation ID ${solId})` : '';

  const draft = `Subject: Teaming inquiry - ${agency}${solLine}

Hi ${primeName} team,

Colaberry is reviewing ${agency}'s ${oppTitle}${solLine}. Our read is that this scope sits squarely in your operational wheelhouse: ${capabilitiesList}. Where Colaberry adds value as a teaming partner is the operational-intelligence layer above your delivery: ${contributionList}.

We are not bidding as prime on this work. We are reaching out to gauge interest in a teaming arrangement where ${primeName} contracts with ${agency} and Colaberry serves as a named subcontractor for workforce, analytics, and compliance scope inside your bid response.

If this is interesting, the next step is a 30-minute call to align on scope split, pricing, and timing relative to the bid deadline. Happy to share a one-page teaming sketch ahead of that.

Best,
Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.
`;

  // Belt-and-braces: scrub for banned terms before returning the draft.
  // composeOutreachDraft is text Claude assembles deterministically, so
  // banned terms shouldn't appear, but the check protects against future
  // edits introducing them.
  const hits = findBannedTerms(draft);
  return {
    opportunity_id: opp.id,
    prime_name: primeName,
    geography,
    draft,
    banned_terms_detected: hits,
  };
}

module.exports = {
  findCandidatePartners,
  composeOutreachDraft,
};
