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
const aiReqSvc = require('./bonfireAIRequirements.service');

const AI_CONFIDENCE_THRESHOLD = 0.5;

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

function buildChecklistItem(typeKey, { vaultDocByType, reason, source = 'baseline', sourceQuote = null, confidence = null, nameIfOther = null }) {
  const vaultDoc = typeKey === 'other' ? null : (vaultDocByType.get(typeKey) || null);
  const expiresAt = vaultDoc && vaultDoc.expires_at ? new Date(vaultDoc.expires_at) : null;
  const expiresInDays = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
  let status = 'gap';
  if (vaultDoc) {
    if (expiresInDays != null && expiresInDays < 0) status = 'expired';
    else if (expiresInDays != null && expiresInDays <= 30) status = 'expiring';
    else status = 'satisfied';
  } else if (typeKey === 'other') {
    // "Other" requirements never have a vault doc; surface as gap with the AI-given name.
    status = 'gap';
  }
  return {
    type: typeKey,
    type_label: typeKey === 'other' ? (nameIfOther || 'Additional requirement') : types.labelFor(typeKey),
    type_generatable: typeKey === 'other' ? false : types.isGeneratable(typeKey),
    required: true,
    status,
    source,                 // 'baseline' | 'ai' | 'conditional'
    reason: reason || null,
    source_quote: sourceQuote,
    confidence: confidence != null ? Number(confidence) : null,
    document: vaultDoc ? {
      id: vaultDoc.id,
      name: vaultDoc.name,
      version: vaultDoc.version,
      expires_at: vaultDoc.expires_at || null,
      expires_in_days: expiresInDays,
      scope: vaultDoc.scope || 'global',
      doc_source: vaultDoc.source || 'manual',
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

  // v0.3: scope-aware — local-for-this-bid docs take precedence over globals.
  const vaultDocByType = await docSvc.activeTypeMap({
    organizationId: orgId,
    bonfireOpportunityId: opp.id,
  });

  // Baseline 6 types (always required for any Bonfire bid).
  const baseline = ALWAYS_REQUIRED.map((t) => ({ type: t, source: 'baseline', reason: null }));

  // v0.1 regex-conditional (MWBE/DBE) — kept for backward-compat when the
  // AI hasn't run yet. AI will supersede this signal once tailorRequirements
  // has been called.
  const conditional = detectConditional(opp).map((rule) => ({
    type: rule.type, source: 'conditional', reason: rule.reason,
  }));

  // v0.2 AI-detected additional requirements (if cached on the row).
  const aiAdditional = aiReqSvc.computeAdditionalRequiredTypes(
    opp.submissionRequirements,
    { confidenceThreshold: AI_CONFIDENCE_THRESHOLD },
  ).map((r) => ({
    type: r.type,
    name_if_other: r.name_if_other,
    source: 'ai',
    reason: r.reason,
    sourceQuote: r.source_quote,
    confidence: r.confidence,
  }));

  // De-dupe by type. AI > conditional > baseline if a type appears twice
  // (so the AI's reason+quote wins on display).
  const merged = [];
  const seen = new Set();
  for (const set of [aiAdditional, conditional, baseline]) {
    for (const item of set) {
      const dedupeKey = item.type === 'other'
        ? `other:${item.name_if_other || item.reason || ''}`
        : item.type;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(item);
    }
  }

  const checklist = merged.map((it) => buildChecklistItem(it.type, {
    vaultDocByType,
    reason: it.reason,
    source: it.source,
    sourceQuote: it.sourceQuote || null,
    confidence: it.confidence != null ? it.confidence : null,
    nameIfOther: it.name_if_other,
  }));

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
    ai: opp.submissionRequirements ? {
      generated_at: opp.submissionRequirements.generated_at,
      model_used: opp.submissionRequirements.model_used,
      summary: opp.submissionRequirements.summary || null,
      additional_count: (opp.submissionRequirements.additional_required || []).length,
      error: opp.submissionRequirements.error || null,
      // Tells the UI whether AI read the actual RFP PDFs or only the metadata
      // (title + description). Used to color the "AI-tailored" framing on the panel.
      attachments_used: (opp.submissionRequirements.attachment_count || 0) > 0,
      attachment_count: opp.submissionRequirements.attachment_count || 0,
    } : null,
    generated_at: new Date().toISOString(),
    version: 'v0.2-ai-tailored',
  };
}

// Lightweight summary used by list endpoints — same shape minus the
// per-item checklist, so a Bonfire opp listing can render a progress
// bar without 50 sub-objects per row.
async function computeReadinessSummaries({ opportunityIds, organizationId, userId }) {
  const orgId = organizationId || await profileSvc.resolveOrgId(userId);
  // v0.3 — for the bulk path we still pass globals only; local-for-bid
  // docs are bid-specific so we'd have to query per-bid which negates
  // the bulk speed-up. Per-bid readiness GET picks up local docs.
  const vaultDocByType = await docSvc.activeTypeMap({ organizationId: orgId });
  const opps = await BonfireOpportunity.findAll({
    where: { id: opportunityIds },
    attributes: ['id', 'title', 'description', 'rawText', 'overview', 'submissionRequirements'],
  });
  const out = {};
  for (const opp of opps) {
    const baseline = ALWAYS_REQUIRED.map((t) => ({ type: t, source: 'baseline', reason: null }));
    const conditional = detectConditional(opp).map((rule) => ({ type: rule.type, source: 'conditional', reason: rule.reason }));
    const aiAdditional = aiReqSvc.computeAdditionalRequiredTypes(
      opp.submissionRequirements,
      { confidenceThreshold: AI_CONFIDENCE_THRESHOLD },
    ).map((r) => ({ type: r.type, source: 'ai', name_if_other: r.name_if_other }));
    const merged = [];
    const seen = new Set();
    for (const set of [aiAdditional, conditional, baseline]) {
      for (const item of set) {
        const dedupeKey = item.type === 'other'
          ? `other:${item.name_if_other || ''}`
          : item.type;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        merged.push(item);
      }
    }
    const items = merged.map((it) => buildChecklistItem(it.type, {
      vaultDocByType, reason: it.reason, source: it.source, nameIfOther: it.name_if_other,
    }));
    const total = items.length;
    const satisfied = items.filter((c) => c.status === 'satisfied').length;
    out[opp.id] = {
      completion_pct: total > 0 ? Math.round((satisfied / total) * 100) : 0,
      satisfied,
      total,
      gaps: items.filter((c) => c.status === 'gap').length,
      ai_tailored: !!(opp.submissionRequirements && opp.submissionRequirements.generated_at),
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
