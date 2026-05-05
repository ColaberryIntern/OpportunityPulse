// OIED v8 — Grounding service.
//
// Pulls the real procurement metadata for an opportunity so proposal
// generation can be anchored in agency_name + solicitation_id +
// scope + submission requirements rather than letting the model
// fabricate context.
//
// Also enforces the v7.1 lifecycle gate on the *content* side: once
// an opp has any submitted/responded/won/lost event, regeneration
// returns `{status: 'invalid_stage'}` so the AI call is skipped.
//
// Pure helpers (deriveAgencyName / deriveSolicitationId /
// deriveScopeSummary / deriveSubmissionRequirements) are exported so
// tests don't need a DB. The DB-bound entry point is
// getOpportunityGrounding(opportunityId).

const { Opportunity } = require('../models');
const events = require('./events.service');
const effortEstimator = require('./effortEstimator.service');

const MIN_SCOPE_CHARS = 50;
const MIN_AGENCY_CHARS = 3;

// Bonfire opps store agency in sourceData.agency. Fall back to opp.location
// for non-Bonfire rows. Strip "(slug)" suffixes so "U3P (utah)" → "U3P".
function deriveAgencyName(opp) {
  if (!opp) return null;
  const candidates = [
    opp.sourceData?.agency,
    opp.location,
    opp.category,
  ].filter((v) => v != null && String(v).trim().length > 0);
  for (const c of candidates) {
    const cleaned = String(c).replace(/\s*\([^)]+\)\s*$/, '').trim();
    if (cleaned.length >= MIN_AGENCY_CHARS && cleaned.toLowerCase() !== 'unknown') {
      return cleaned;
    }
  }
  return null;
}

// Bonfire stores external_id like "bonfire:agency:utah:2026-016".
// Extract the trailing solicitation token. Fall back to opp.sourceId,
// then a regex over the title for "RFP-25-007"-style refs.
function deriveSolicitationId(opp) {
  if (!opp) return null;
  const ext = opp.sourceData?.external_id || opp.sourceId || '';
  if (ext) {
    const tail = String(ext).split(':').pop();
    if (tail && /^[A-Za-z0-9_/.-]+$/.test(tail) && tail.length > 2 && tail !== ext) {
      return tail;
    }
  }
  // Match RFP/RFQ/RFI/RFSQ/Solicitation followed by an id-shaped token
  // that contains at least one digit (so "Solicitation for ..." doesn't
  // capture "for" as the id). Iterate; first digit-bearing candidate wins.
  const titleStr = String(opp.title || '');
  const titleRe = /\b(RFP|RFQ|RFI|RFSQ|Solicitation)\s*[#:-]?\s*([A-Z0-9][A-Z0-9-]*)\b/gi;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = titleRe.exec(titleStr)) !== null) {
    const candidate = m[2];
    if (/\d/.test(candidate)) return candidate;
  }
  // sourceId without colons (rare) — accept if it looks like an id.
  if (ext && /^[A-Za-z0-9_/.-]+$/.test(ext) && ext.length > 2 && ext.length < 80) {
    return ext;
  }
  return null;
}

// Scope summary: AI overview > description > null. Capped at 500 chars.
function deriveScopeSummary(opp) {
  if (!opp) return null;
  const ai = opp.aiAnalysis?.overview;
  if (ai && String(ai).trim().length > MIN_SCOPE_CHARS) {
    return String(ai).trim().slice(0, 500);
  }
  const desc = opp.description || '';
  if (desc.length >= MIN_SCOPE_CHARS) return desc.slice(0, 500);
  return null;
}

// Required-section detection (reuses v6 effortEstimator) + page_limit
// + format. Returns crude regex output — null when uncertain.
function deriveSubmissionRequirements(opp) {
  if (!opp) {
    return { required_sections: [], page_limit: null, format: null };
  }
  const text = `${opp.title || ''} ${opp.description || ''} ${
    opp.sourceData?.raw_text || ''
  }`.toLowerCase();
  const { sections } = effortEstimator.detectSections(text);

  let page_limit = null;
  const pageMatch = text.match(/(\d{1,3})\s*-?\s*page(s)?\s*(maximum|max|limit|or fewer)/i);
  if (pageMatch) page_limit = Math.min(200, Number(pageMatch[1]));

  let format = null;
  if (/\bpdf\b/i.test(text)) format = 'PDF';
  else if (/\b\.docx?\b|microsoft word/i.test(text)) format = 'Word';

  return { required_sections: sections, page_limit, format };
}

// DB-bound entry point. Loads opp + checks the v7.1 lifecycle gate.
// Returns one of:
//   { status: 'not_found',     message }
//   { status: 'invalid_stage', message, event_type, opportunity_id }
//   { status: 'ok', opportunity_id, agency_name, solicitation_id,
//                   opportunity_title, scope_summary,
//                   submission_requirements, source_url }
async function getOpportunityGrounding(opportunityId) {
  if (!opportunityId) {
    return { status: 'not_found', message: 'No opportunityId provided' };
  }
  const opp = await Opportunity.findByPk(opportunityId);
  if (!opp) {
    return { status: 'not_found', message: `Opportunity ${opportunityId} not found` };
  }

  // v7.1 lifecycle gate: any terminal event = blocked.
  const blockingEvent = await events.hasAnyTerminalEvent(opportunityId);
  if (blockingEvent) {
    return {
      status: 'invalid_stage',
      message: 'Proposal generation not allowed at this lifecycle stage',
      event_type: blockingEvent,
      opportunity_id: opportunityId,
    };
  }

  const oppData = opp.toJSON ? opp.toJSON() : opp;
  return {
    status: 'ok',
    opportunity_id: oppData.id,
    agency_name: deriveAgencyName(oppData),
    solicitation_id: deriveSolicitationId(oppData),
    opportunity_title: oppData.title || null,
    scope_summary: deriveScopeSummary(oppData),
    submission_requirements: deriveSubmissionRequirements(oppData),
    source_url: oppData.sourceUrl || null,
  };
}

// Pure: returns the list of required fields that are missing from the
// grounding payload. Empty list = grounding is sufficient for generation.
function missingGroundingFields(grounding) {
  if (!grounding || grounding.status !== 'ok') return [];
  const missing = [];
  if (!grounding.agency_name)     missing.push('agency_name');
  if (!grounding.solicitation_id) missing.push('solicitation_id');
  if (!grounding.scope_summary)   missing.push('scope_summary');
  return missing;
}

module.exports = {
  getOpportunityGrounding,
  missingGroundingFields,
  deriveAgencyName,
  deriveSolicitationId,
  deriveScopeSummary,
  deriveSubmissionRequirements,
};
