// Submission Readiness Engine v0.1 — Bonfire readiness scoring.
//
// For a given Bonfire opportunity + the org's vault, returns:
//   - a checklist of required document types for THIS bid
//   - whether each is satisfied by an active vault doc
//   - a completion % (satisfied / required)
//
// v0.1 uses a fixed 7-doc Bonfire checklist with one cheap signal:
// MWBE/DBE cert is ONLY required if the opp text mentions it. Everything
// else is required for every Bonfire bid. v0.2 will replace this with a
// per-opp AI compliance matrix; the response shape is forward-compatible.

const { BonfireOpportunity } = require('../models');
const docSvc = require('../documents/document.service');
const types = require('../documents/documentTypes');
const profileSvc = require('../oied/profile.service');

// Required for EVERY Bonfire bid (per industry research; see docs/submission-readiness-walkthrough.html § 6).
const ALWAYS_REQUIRED = [
  'cover_letter_template',
  'capability_statement',
  'coi',
  'references',
  'technical_response_template',
  'pricing_response_template',
];

// Conditionally required when the opp text signals diversity-business
// preference. The signal is a soft regex over title + description + raw_text.
const CONDITIONAL = [
  {
    type: 'cert_mwbe_dbe',
    pattern: /\b(mwbe|m\/wbe|m-wbe|wbe|dbe|disadvantaged business|minority.{0,8}owned|woman.{0,8}owned|women.{0,8}owned|hub\s*partner)\b/i,
    reason: 'Opportunity text mentions MWBE/DBE preference.',
  },
];

function detectConditional(opp) {
  const haystack = [opp.title, opp.description, opp.rawText, opp.overview]
    .filter(Boolean)
    .join(' \n ');
  return CONDITIONAL.filter((rule) => rule.pattern.test(haystack));
}

function buildChecklistItem(typeKey, { vaultDocByType, reason }) {
  const vaultDoc = vaultDocByType.get(typeKey) || null;
  const expiresAt = vaultDoc && vaultDoc.expires_at ? new Date(vaultDoc.expires_at) : null;
  const expiresInDays = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
  let status = 'gap';
  if (vaultDoc) {
    if (expiresInDays != null && expiresInDays < 0) status = 'expired';
    else if (expiresInDays != null && expiresInDays <= 30) status = 'expiring';
    else status = 'satisfied';
  }
  return {
    type: typeKey,
    type_label: types.labelFor(typeKey),
    required: true,
    status,                 // satisfied | expiring | expired | gap
    reason: reason || null,
    document: vaultDoc ? {
      id: vaultDoc.id,
      name: vaultDoc.name,
      version: vaultDoc.version,
      expires_at: vaultDoc.expires_at || null,
      expires_in_days: expiresInDays,
    } : null,
  };
}

async function computeReadiness({ opportunityId, organizationId, userId } = {}) {
  const orgId = organizationId || await profileSvc.resolveOrgId(userId);
  const opp = await BonfireOpportunity.findByPk(opportunityId);
  if (!opp) {
    const err = new Error('Bonfire opportunity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const vaultDocByType = await docSvc.activeTypeMap({ organizationId: orgId });

  // Build the required-types list for THIS opp.
  const required = ALWAYS_REQUIRED.map((t) => ({ type: t, reason: null }));
  for (const rule of detectConditional(opp)) {
    required.push({ type: rule.type, reason: rule.reason });
  }

  const checklist = required.map(({ type, reason }) =>
    buildChecklistItem(type, { vaultDocByType, reason }));

  const total = checklist.length;
  const satisfied = checklist.filter((c) => c.status === 'satisfied').length;
  const expiring  = checklist.filter((c) => c.status === 'expiring').length;
  const expired   = checklist.filter((c) => c.status === 'expired').length;
  const gaps      = checklist.filter((c) => c.status === 'gap').length;
  const completion = total > 0 ? Math.round((satisfied / total) * 100) : 0;

  return {
    opportunity_id: opp.id,
    title: opp.title,
    agency: opp.agency,
    completion_pct: completion,
    counts: { total, satisfied, expiring, expired, gaps },
    checklist,
    generated_at: new Date().toISOString(),
    version: 'v0.1-fixed-checklist',
  };
}

// Lightweight summary used by list endpoints — same shape minus the
// per-item checklist, so a Bonfire opp listing can render a progress
// bar without 50 sub-objects per row.
async function computeReadinessSummaries({ opportunityIds, organizationId, userId }) {
  const orgId = organizationId || await profileSvc.resolveOrgId(userId);
  const vaultDocByType = await docSvc.activeTypeMap({ organizationId: orgId });
  const opps = await BonfireOpportunity.findAll({
    where: { id: opportunityIds },
    attributes: ['id', 'title', 'description', 'rawText', 'overview'],
  });
  const out = {};
  for (const opp of opps) {
    const required = ALWAYS_REQUIRED.map((t) => ({ type: t, reason: null }));
    for (const rule of detectConditional(opp)) {
      required.push({ type: rule.type, reason: rule.reason });
    }
    const items = required.map(({ type, reason }) =>
      buildChecklistItem(type, { vaultDocByType, reason }));
    const total = items.length;
    const satisfied = items.filter((c) => c.status === 'satisfied').length;
    out[opp.id] = {
      completion_pct: total > 0 ? Math.round((satisfied / total) * 100) : 0,
      satisfied,
      total,
      gaps: items.filter((c) => c.status === 'gap').length,
    };
  }
  return out;
}

module.exports = {
  computeReadiness,
  computeReadinessSummaries,
  ALWAYS_REQUIRED,
  CONDITIONAL,
  detectConditional,
};
