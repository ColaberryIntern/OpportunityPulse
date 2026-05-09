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

// v0.8 — derive the user-facing flow state from the opp's pursuit + attachment +
// AI-tailoring signals. Drives the four distinct UIs in BonfireReadinessPanel.
//   pre-pursuit             — user hasn't expressed intent yet
//   pursuing-no-attachments — intent expressed, but no RFP body uploaded yet
//   attachments-only        — RFP body present, AI hasn't tailored yet
//   tailored                — AI has read the RFP and produced a real checklist
//
// Until we have the agency's published checklist (or a tailored AI run on
// attachments), completion_pct is null — a generic baseline % is misleading.
async function computeReadinessState({ opp, attachmentCount }) {
  const pursuit = opp.pursuitStatus || 'none';
  if (pursuit !== 'pursuing') {
    if (pursuit === 'submitted') return 'submitted';
    if (pursuit === 'declined')  return 'declined';
    return 'pre-pursuit';
  }
  // v0.10 — once we have the required_information from a portal screenshot,
  // we can compute readiness even before any attachments are uploaded
  // (because the checklist exists; rows just show as gaps until templates +
  // filled versions land).
  const hasRequiredInformation = !!(
    opp.submissionRequirements &&
    opp.submissionRequirements.required_information &&
    opp.submissionRequirements.required_information.found &&
    Array.isArray(opp.submissionRequirements.required_information.rows) &&
    opp.submissionRequirements.required_information.rows.length > 0
  );
  if (hasRequiredInformation) return 'tailored';
  // Fallback path (v0.2 AI tailoring against RFP body) — still valid when
  // user prefers AI over screenshot, OR for older bids that weren't captured.
  if (attachmentCount === 0) return 'pursuing-no-attachments';
  const tailoredAgainstAttachments = !!(
    opp.submissionRequirements &&
    opp.submissionRequirements.generated_at &&
    (opp.submissionRequirements.attachment_count || 0) > 0
  );
  if (!tailoredAgainstAttachments) return 'attachments-only';
  return 'tailored';
}

// v0.10 — match one Required Information row against the uploaded attachments
// list. We look for ANY attachment whose name overlaps the row's name.
// Loose matching (substring on lowercased + cleaned name) — agencies vary in
// how they spell things between the portal table and the file they hand out.
//
// Future graduation: when Phase B (form filler) is shipped, "satisfied" should
// require the FILLED version of the doc, not just the template. For now,
// having the template uploaded is enough to mark the row green.
function buildPortalRowItem(row, attachments) {
  const rowKey = String(row.name || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const required = row.required === true;
  const matchedAttachments = (attachments || []).filter((a) => {
    const aName = String(a.name || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!aName || !rowKey) return false;
    // Direct substring match either way (row title may be "Pricing Schedule"
    // and attachment may be "7-03. Pricing Schedule.xlsx").
    if (aName.includes(rowKey)) return true;
    // Or row name short-words present in attachment name.
    const sigWords = rowKey.split(' ').filter((w) => w.length >= 4);
    if (sigWords.length === 0) return false;
    return sigWords.every((w) => aName.includes(w));
  });
  let status = required ? 'gap' : 'optional';
  if (matchedAttachments.length > 0) {
    status = required ? 'satisfied' : 'satisfied_optional';
  }
  return {
    type: 'portal_row',
    type_label: row.name,
    type_generatable: false,
    required,
    status,
    source: 'portal',
    reason: row.conditions || null,
    file_type_expected: row.file_type || null,
    count_expected: row.count != null ? row.count : null,
    matched_attachments: matchedAttachments.map((a) => ({
      id: a.id,
      name: a.name,
      mime: a.mime,
      classification: a.metadata?.classification || null,
    })),
    document: null,
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

  // v0.8: derive UI state. For non-tailored states we short-circuit and
  // return a state envelope without computing a misleading %.
  // eslint-disable-next-line global-require
  const { OpportunityAttachment } = require('../models');
  const attachmentCount = await OpportunityAttachment.count({
    where: { bonfireOpportunityId: opp.id },
  });
  const state = await computeReadinessState({ opp, attachmentCount });

  if (state !== 'tailored') {
    return {
      opportunity_id: opp.id,
      title: opp.title,
      agency: opp.agency,
      state,
      completion_pct: null,
      counts: null,
      checklist: [],
      pursuit: {
        status: opp.pursuitStatus || 'none',
        pursued_at: opp.pursuedAt,
        pursued_by: opp.pursuedBy,
      },
      attachments: {
        count: attachmentCount,
        last_attachment_fetch: opp.submissionRequirements?.last_attachment_fetch || null,
      },
      ai: opp.submissionRequirements && opp.submissionRequirements.generated_at ? {
        generated_at: opp.submissionRequirements.generated_at,
        attachments_used: (opp.submissionRequirements.attachment_count || 0) > 0,
        attachment_count: opp.submissionRequirements.attachment_count || 0,
        summary: opp.submissionRequirements.summary || null,
      } : null,
      source_url: opp.sourceUrl || null,
      generated_at: new Date().toISOString(),
      version: 'v0.8-state-gated',
    };
  }

  // Tailored path — compute the real checklist + %.

  // v0.3: scope-aware — local-for-this-bid docs take precedence over globals.
  const vaultDocByType = await docSvc.activeTypeMap({
    organizationId: orgId,
    bonfireOpportunityId: opp.id,
  });

  // v0.10 — when the agency's published Required Information list is on
  // file (from a portal screenshot), use it as the canonical checklist.
  // Each row from the agency becomes one checklist item, with status driven
  // by whether we can match an uploaded attachment to it.
  const reqInfo = opp.submissionRequirements?.required_information;
  if (reqInfo && reqInfo.found && Array.isArray(reqInfo.rows) && reqInfo.rows.length > 0) {
    // eslint-disable-next-line global-require
    const { OpportunityAttachment: AttModel } = require('../models');
    const allAttachments = await AttModel.findAll({
      where: { bonfireOpportunityId: opp.id },
      attributes: ['id', 'name', 'mime', 'metadata', 'sizeBytes'],
    });
    const checklist = reqInfo.rows.map((row) => buildPortalRowItem(row, allAttachments));
    const required = checklist.filter((c) => c.required);
    const total = required.length;
    const satisfied = required.filter((c) => c.status === 'satisfied').length;
    const gaps = required.filter((c) => c.status === 'gap').length;
    const completion = total > 0 ? Math.round((satisfied / total) * 100) : 0;
    return {
      opportunity_id: opp.id,
      title: opp.title,
      agency: opp.agency,
      state: 'tailored',
      completion_pct: completion,
      counts: { total, satisfied, expiring: 0, expired: 0, gaps, optional: checklist.length - required.length },
      checklist,
      pursuit: {
        status: opp.pursuitStatus || 'none',
        pursued_at: opp.pursuedAt,
        pursued_by: opp.pursuedBy,
      },
      attachments: {
        count: allAttachments.length,
        last_attachment_fetch: opp.submissionRequirements?.last_attachment_fetch || null,
      },
      ai: opp.submissionRequirements && opp.submissionRequirements.generated_at ? {
        generated_at: opp.submissionRequirements.generated_at,
        attachments_used: (opp.submissionRequirements.attachment_count || 0) > 0,
        attachment_count: opp.submissionRequirements.attachment_count || 0,
        summary: opp.submissionRequirements.summary || null,
      } : null,
      required_information: {
        captured_at: reqInfo.captured_at,
        section_label: reqInfo.section_label,
        row_count: reqInfo.rows.length,
        // 'portal_screenshot' if extracted via vision from a user-dropped
        // image, 'ai_from_rfp_body' if AI extracted from the parsed RFP
        // attachment text. Frontend uses this to pick the right label.
        via: reqInfo.via
          || (Array.isArray(reqInfo.screenshot_paths) && reqInfo.screenshot_paths.length > 0
            ? 'portal_screenshot'
            : 'unknown'),
      },
      source_url: opp.sourceUrl || null,
      generated_at: new Date().toISOString(),
      version: 'v0.10-portal-required-info',
    };
  }

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
    state: 'tailored',
    completion_pct: completion,
    counts: { total, satisfied, expiring, expired, gaps },
    checklist,
    pursuit: {
      status: opp.pursuitStatus || 'none',
      pursued_at: opp.pursuedAt,
      pursued_by: opp.pursuedBy,
    },
    attachments: {
      count: attachmentCount,
      last_attachment_fetch: opp.submissionRequirements?.last_attachment_fetch || null,
    },
    ai: opp.submissionRequirements ? {
      generated_at: opp.submissionRequirements.generated_at,
      model_used: opp.submissionRequirements.model_used,
      summary: opp.submissionRequirements.summary || null,
      additional_count: (opp.submissionRequirements.additional_required || []).length,
      error: opp.submissionRequirements.error || null,
      attachments_used: (opp.submissionRequirements.attachment_count || 0) > 0,
      attachment_count: opp.submissionRequirements.attachment_count || 0,
    } : null,
    source_url: opp.sourceUrl || null,
    generated_at: new Date().toISOString(),
    version: 'v0.8-state-gated',
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
    attributes: ['id', 'title', 'description', 'rawText', 'overview', 'submissionRequirements', 'pursuitStatus'],
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
    // v0.8 — only emit a meaningful % when AI has tailored against attachments.
    // Otherwise list rows just show the pursuit pill, not a misleading number.
    const tailoredAgainstAttachments = !!(
      opp.submissionRequirements &&
      opp.submissionRequirements.generated_at &&
      (opp.submissionRequirements.attachment_count || 0) > 0
    );
    out[opp.id] = {
      pursuit_status: opp.pursuitStatus || 'none',
      completion_pct: tailoredAgainstAttachments
        ? (total > 0 ? Math.round((satisfied / total) * 100) : 0)
        : null,
      satisfied: tailoredAgainstAttachments ? satisfied : null,
      total: tailoredAgainstAttachments ? total : null,
      gaps: tailoredAgainstAttachments ? items.filter((c) => c.status === 'gap').length : null,
      ai_tailored: tailoredAgainstAttachments,
    };
  }
  return out;
}

module.exports = {
  computeReadiness,
  computeReadinessState,
  computeReadinessSummaries,
  ALWAYS_REQUIRED,
  CONDITIONAL,
  detectConditional,
};
