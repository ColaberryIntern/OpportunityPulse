// Submission Readiness Engine v0.2 — per-Bonfire-opp AI requirements tailoring.
//
// Reads an opp's text + the canonical document-type registry, asks the
// AI to flag which ADDITIONAL requirements (beyond the v0.1 baseline)
// THIS specific bid needs, and persists the result on
// bonfire_opportunities.submission_requirements (JSONB, cached).
//
// Conservative: AI must quote text from the RFP for each additional
// requirement it flags. Confidence is also returned so the merge layer
// can drop low-signal hits if needed.

const { BonfireOpportunity, OpportunityAttachment } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const types = require('../documents/documentTypes');
const logger = require('../logging/logger');

// v0.4: when the opp has fetched RFP attachments with parsed_text, we
// include excerpts in the prompt.
//
// v0.10.4: bumped per-attachment cap from 4000 → 12000 chars after SLCC
// validation surfaced that the canonical "Proposal File Requirements" PDF
// (9336 chars) was being truncated, hiding FILE 3–6 from the AI extractor.
// Total cap raised to 30K to match. Also: attachments whose names look like
// they ARE the requirements list get full text first via priority sort below.
const MAX_EXCERPT_PER_ATTACHMENT = 12000;
const MAX_TOTAL_EXCERPT = 30000;

// Attachments whose names match these patterns are submission-requirements
// docs themselves and get prioritized in the excerpt budget so AI sees the
// canonical list in full before we spend bytes on T&Cs / general conditions.
const REQUIREMENTS_DOC_PATTERNS = [
  /proposal\s+file\s+requirements?/i,
  /required?\s+(documents?|submissions?|files?|information)/i,
  /submission\s+requirements?/i,
  /proposal\s+format/i,
  /response\s+format/i,
  /response\s+template/i,
  /files?\s+to\s+submit/i,
];

function attachmentPriority(name) {
  const n = String(name || '');
  for (const re of REQUIREMENTS_DOC_PATTERNS) {
    if (re.test(n)) return 0; // highest — submission requirements doc
  }
  if (/(^|\b)(rfp|rfo|rfq|sow|statement of (work|need)|son)\b/i.test(n)) return 1; // RFP body
  return 2; // everything else (T&Cs, general conditions, addenda, about, etc.)
}

// v0.1 baseline — AI is told NOT to repeat these in the additional list.
const BASELINE_TYPES = [
  'cover_letter_template',
  'capability_statement',
  'coi',
  'references',
  'technical_response_template',
  'pricing_response_template',
];

// Types AI is allowed to flag as "additional" — explicitly listed so AI
// can't invent type keys that have no upload home in the vault.
function flaggableTypes() {
  return types.TYPES
    .filter((t) => t.platforms.includes('bonfire') || t.platforms.includes('sam_gov'))
    .filter((t) => !BASELINE_TYPES.includes(t.key))
    .filter((t) => t.key !== 'other');
}

const SYSTEM_PROMPT = `You are a state and local government procurement compliance officer.
Given the text of a Bonfire RFP/RFQ, your job is to identify ADDITIONAL document
requirements beyond the standard baseline that vendors must include in their submission.

Standard baseline (DO NOT include these in your output — they apply to every bid):
- Cover Letter
- Capability Statement
- Certificate of Insurance (COI)
- References
- Technical Response
- Pricing Response

For each ADDITIONAL requirement you find, return ONE entry with:
  - type: must be one of the type keys provided in the user prompt's "Available types" list,
          OR "other" if no listed type matches
  - name_if_other: ONLY when type is "other" — short title (≤60 chars)
  - confidence: 0.0–1.0 (your honest read of how clear the requirement is)
  - reason: ≤120 chars, plain language
  - source_quote: the exact phrase from the RFP that supports this (≤200 chars)

CRITICAL RULES:
- Only flag requirements that are EXPLICITLY stated in the RFP text.
- DO NOT invent requirements based on what's "typical for this kind of work."
- DO NOT include the baseline 6 types.
- If the RFP doesn't mention bonds, DO NOT flag bonds.
- If you can't quote the text supporting a requirement, DO NOT flag it.
- Empty additional list is the right answer for many simple RFPs.

Return ONLY valid JSON in this exact shape:
{
  "additional_required": [
    {
      "type": "<key | other>",
      "name_if_other": "<only when type=other>",
      "confidence": 0.85,
      "reason": "<short>",
      "source_quote": "<exact text from RFP>"
    }
  ],
  "summary": "<one-sentence summary of what's distinctive about this RFP's submission requirements>"
}`;

function buildUserPrompt(opp, { attachmentExcerpts = [] } = {}) {
  const flaggable = flaggableTypes();
  const lines = [
    'Available types you may flag (use the "key" exactly):',
    flaggable.map((t) => `  - ${t.key}: ${t.label}`).join('\n'),
    '',
    `Title: ${opp.title || ''}`,
    `Agency: ${opp.agency || ''}`,
    `Category (raw): ${opp.categoryRaw || ''}`,
    opp.estimatedValue ? `Estimated value: $${opp.estimatedValue}` : '',
    '',
    'Description:',
    String(opp.description || '').slice(0, 4000),
  ].filter(Boolean);

  // raw_text and overview if present and not already in description
  const extras = [];
  if (opp.rawText && !String(opp.description || '').includes(opp.rawText.slice(0, 40))) {
    extras.push('Raw RFP text:', String(opp.rawText).slice(0, 4000));
  }
  if (opp.overview) {
    extras.push('AI overview:', String(opp.overview).slice(0, 1000));
  }
  if (extras.length > 0) {
    lines.push('', ...extras);
  }

  // v0.4: include parsed text from RFP attachments if we have them.
  // This is where bond / EEO / prevailing-wage / etc. requirements live;
  // titles + descriptions almost never carry that detail.
  if (attachmentExcerpts.length > 0) {
    lines.push('', '=== Official RFP attachment excerpts (cited by AI when used) ===');
    for (const att of attachmentExcerpts) {
      lines.push('', `--- ${att.name} ---`);
      lines.push(att.text);
    }
  }

  return lines.join('\n');
}

// Build [{name, text}] from an opp's attachments, capped per-file and total.
// v0.10.4: sort by REQUIREMENTS_DOC_PATTERNS so the agency's published file-
// list (e.g. "SLCC RFP Proposal File Requirements.pdf") gets full budget
// before we spend bytes on T&Cs / general conditions / about-the-agency PDFs.
async function loadAttachmentExcerpts(opp) {
  const rows = await OpportunityAttachment.findAll({
    where: { bonfireOpportunityId: opp.id, parsedText: { [require('sequelize').Op.ne]: null } },
    order: [['downloaded_at', 'DESC']],
  });
  if (rows.length === 0) return [];
  rows.sort((a, b) => attachmentPriority(a.name) - attachmentPriority(b.name));
  const out = [];
  let totalChars = 0;
  for (const r of rows) {
    const text = String(r.parsedText || '').trim();
    if (!text) continue;
    const remaining = MAX_TOTAL_EXCERPT - totalChars;
    if (remaining <= 200) break;
    const slice = text.slice(0, Math.min(MAX_EXCERPT_PER_ATTACHMENT, remaining));
    totalChars += slice.length;
    out.push({ name: r.name, text: slice });
  }
  return out;
}

// v0.10.4 — second AI pass: extract the agency's structured submission
// requirements list directly from the RFP body. Many RFPs don't publish a
// "Required Information" table on the portal, but they DO contain a section
// like "FILE ONE — Letter of Transmittal / FILE TWO — Technical Proposal /
// FILE THREE — Cost Proposal" inside the RFP PDF itself. This pass produces
// the same shape as the portal-screenshot extractor (rows + found flag) so
// the readiness service can use either source interchangeably.
const REQUIRED_INFO_SYSTEM_PROMPT = `You are a state and local government procurement compliance officer.
You receive the parsed text of one or more RFP attachments (the actual solicitation documents).
Your job is to find the section that lists what the vendor must SUBMIT — usually titled something like:
  "Proposal File Requirements", "Required Submission", "Required Information", "Required Documents",
  "Submission Requirements", "Response Format", "Proposal Format", "Files to Submit", or similar.
That section may use language like "FILE ONE", "FILE TWO", "Section 1", "Section 2", "Required Files",
or simply a numbered list of items.

For each ITEM the agency requires the vendor to submit, extract one row:
  - name: the item's title as written in the RFP (verbatim, no paraphrasing — e.g. "Letter of Transmittal", "Technical Proposal", "Cost Proposal", "Sample Contract/Agreement", "Financial Responsibility", "HECVAT", "Accessibility Conformance Report (VPAT)")
  - file_type: the format the agency wants if specified ("pdf", "docx", "xlsx", "Microsoft Word", "BidTable") — null if not specified
  - required: true unless the RFP explicitly marks it optional, conditional, or "if applicable"
  - conditions: any conditional language ("if applicable", "use Response Template", "in MS Word for redlines", "≥5 references") — null if none
  - source_quote: an EXACT short phrase from the RFP that supports this row (≤200 chars). MUST be present.

Also include any non-file deliverables that the RFP explicitly requires (e.g. HECVAT, ACR, audited financials, D&B report, bonds, certifications) as separate rows.

CRITICAL RULES:
- Only extract items the RFP explicitly says the vendor must submit. Do NOT invent items.
- No source_quote → drop the row.
- If you can't find a structured submission-requirements section in the RFP text, return { "found": false, "reason": "..." }.
- Return only items the AGENCY asks for in this specific RFP. Do not include generic things common to all bids unless THIS RFP names them.

Respond ONLY with JSON:
{
  "found": true,
  "section_label": "Proposal File Requirements",
  "rows": [
    {
      "name": "Letter of Transmittal",
      "file_type": "pdf",
      "required": true,
      "conditions": "must be signed by authorized signatory; include addenda acknowledgment",
      "source_quote": "FILE ONE – LETTER OF TRANSMITTAL ... shall be signed by an individual authorized to legally bind the offeror"
    }
  ]
}
OR
{
  "found": false,
  "reason": "RFP body does not contain a structured submission-requirements section. Try uploading a portal screenshot."
}`;

const REQUIRED_INFO_USER_PREFIX = 'Read the attached RFP text and extract the structured submission-requirements list. Each row must include a verbatim source_quote.';

function buildRequiredInfoUserPrompt(opp, { attachmentExcerpts }) {
  const lines = [
    REQUIRED_INFO_USER_PREFIX,
    '',
    `Bid title: ${opp.title || ''}`,
    `Agency: ${opp.agency || ''}`,
    '',
    '=== RFP attachment text (cite verbatim phrases in source_quote) ===',
  ];
  for (const att of attachmentExcerpts) {
    lines.push('', `--- ${att.name} ---`);
    lines.push(att.text);
  }
  return lines.join('\n');
}

function sanitizeRequiredInfoRows(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name || '').trim().slice(0, 240);
    if (!name) continue;
    const sourceQuote = r.source_quote ? String(r.source_quote).trim().slice(0, 400) : null;
    if (!sourceQuote) continue; // hard rule: no quote, no row
    out.push({
      name,
      file_type: r.file_type ? String(r.file_type).trim().slice(0, 60) : null,
      required: r.required !== false,
      conditions: r.conditions ? String(r.conditions).trim().slice(0, 240) : null,
      count: typeof r.count === 'number' ? r.count
        : (typeof r.count === 'string' && r.count.trim() ? r.count.trim().slice(0, 30) : null),
      source_quote: sourceQuote,
    });
    if (out.length >= 50) break;
  }
  return out;
}

async function extractRequiredInformationFromText({ opp, attachmentExcerpts }) {
  if (!attachmentExcerpts || attachmentExcerpts.length === 0) {
    return { found: false, reason: 'No attachment text available — cannot read RFP body.', rows: [] };
  }
  const totalChars = attachmentExcerpts.reduce((acc, a) => acc + (a.text || '').length, 0);
  if (totalChars < 500) {
    return { found: false, reason: 'Attachment text too short for structured extraction.', rows: [] };
  }
  const ai = getAIClient();
  const userPrompt = buildRequiredInfoUserPrompt(opp, { attachmentExcerpts });
  let parsed = null;
  let aiError = null;
  let tokensUsed = 0;
  try {
    const { content, tokensUsed: t } = await ai.chat(REQUIRED_INFO_SYSTEM_PROMPT, userPrompt, {
      temperature: 0,
      maxTokens: 2500,
    });
    tokensUsed = t;
    try { parsed = JSON.parse(content); }
    catch (e) {
      logger.warn('extractRequiredInformationFromText: non-JSON AI response', { id: opp.id, snippet: String(content).slice(0, 200) });
      parsed = null;
    }
  } catch (e) {
    aiError = e.message;
    logger.error('extractRequiredInformationFromText: AI call failed', { id: opp.id, error: e.message });
  }
  const found = !!(parsed && parsed.found === true);
  return {
    found,
    section_label: parsed?.section_label || null,
    reason: parsed?.reason || null,
    rows: found ? sanitizeRequiredInfoRows(parsed.rows) : [],
    tokens_used: tokensUsed,
    ai_error: aiError,
  };
}

function validateAndFilter(parsed) {
  const validKeys = new Set(flaggableTypes().map((t) => t.key));
  const additional = Array.isArray(parsed && parsed.additional_required) ? parsed.additional_required : [];
  const cleaned = [];
  for (const item of additional) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '').trim();
    if (!type) continue;
    const isOther = type === 'other';
    if (!isOther && !validKeys.has(type)) continue;
    const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
    const reason = String(item.reason || '').slice(0, 240);
    const sourceQuote = String(item.source_quote || '').slice(0, 400);
    if (!sourceQuote) continue; // hard rule: no quote, no flag
    cleaned.push({
      type,
      name_if_other: isOther ? String(item.name_if_other || 'Additional requirement').slice(0, 80) : null,
      confidence,
      reason,
      source_quote: sourceQuote,
    });
  }
  return {
    additional_required: cleaned,
    summary: String((parsed && parsed.summary) || '').slice(0, 400),
  };
}

async function tailorRequirements({ opportunityId, force = false } = {}) {
  const opp = await BonfireOpportunity.findByPk(opportunityId);
  if (!opp) {
    const err = new Error('Bonfire opportunity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  // Cache-or-rerun decision. v0.8: if attachments are now present but the
  // cached run didn't read any, the cache is stale by definition — re-run
  // even without force=true. Otherwise the user clicks "Tailor with AI" in
  // attachments-only state, the cache returns the old (attachment_count:0)
  // payload, and the readiness state stays stuck on attachments-only.
  const ai = getAIClient();
  const attachmentExcerpts = await loadAttachmentExcerpts(opp).catch(() => []);
  const cached = opp.submissionRequirements;
  const cachedHasGen = !!(cached && cached.generated_at);
  const cachedAttachmentCount = (cached && cached.attachment_count) || 0;
  const staleByAttachments = cachedHasGen
    && cachedAttachmentCount === 0
    && attachmentExcerpts.length > 0;
  if (!force && cachedHasGen && !staleByAttachments) {
    return cached;
  }
  const userPrompt = buildUserPrompt(opp, { attachmentExcerpts });
  const startedAt = new Date();
  let parsed = {};
  let modelUsed = ai.model;
  try {
    const { content, tokensUsed } = await ai.chat(SYSTEM_PROMPT, userPrompt, {
      temperature: 0.1,
      maxTokens: 1200,
    });
    try {
      parsed = JSON.parse(content);
    } catch (jsonErr) {
      logger.warn('bonfireAIRequirements: AI returned non-JSON', { opportunityId, content: String(content).slice(0, 200) });
      parsed = {};
    }
    logger.info('bonfireAIRequirements: AI call complete', { opportunityId, tokensUsed });
  } catch (e) {
    logger.error('bonfireAIRequirements: AI call failed', { opportunityId, error: e.message });
    // Persist a stub so the UI can show "AI failed; baseline only"
    parsed = { additional_required: [], summary: '', _error: e.message };
  }

  const validated = validateAndFilter(parsed);

  // v0.10.4 — second pass: ask AI to extract a structured submission-
  // requirements list from the RFP body (the "FILE ONE / FILE TWO / ..."
  // pattern that SLCC and many institutional RFPs use). If found, this
  // becomes the canonical readiness checklist via required_information,
  // mirroring the portal-screenshot path. Only runs when we have
  // substantial attachment text (no point asking AI to read a title).
  let extractedReqInfo = null;
  if (attachmentExcerpts.length > 0) {
    try {
      extractedReqInfo = await extractRequiredInformationFromText({ opp, attachmentExcerpts });
    } catch (e) {
      logger.warn('bonfireAIRequirements: required-info extraction failed', { opportunityId, error: e.message });
    }
  }

  // Decision: required_information from a portal screenshot is canonical;
  // never overwrite it with the AI-from-RFP-body version. If no portal
  // screenshot exists OR the prior required_information also came from RFP,
  // use the new extraction.
  const priorReqInfo = (opp.submissionRequirements && opp.submissionRequirements.required_information) || null;
  const priorViaPortal = priorReqInfo
    && Array.isArray(priorReqInfo.screenshot_paths)
    && priorReqInfo.screenshot_paths.length > 0;

  const payload = {
    generated_at: startedAt.toISOString(),
    model_used: modelUsed,
    baseline_types: BASELINE_TYPES.slice(),
    additional_required: validated.additional_required,
    summary: validated.summary,
    error: parsed._error || null,
    attachment_count: attachmentExcerpts.length,
    attachment_chars: attachmentExcerpts.reduce((acc, a) => acc + a.text.length, 0),
  };

  // Preserve non-AI-generated metadata that lives on submissionRequirements.
  if (opp.submissionRequirements && opp.submissionRequirements.last_attachment_fetch) {
    payload.last_attachment_fetch = opp.submissionRequirements.last_attachment_fetch;
  }
  if (priorViaPortal) {
    // Keep the portal-derived list — it's the canonical agency list.
    payload.required_information = priorReqInfo;
  } else if (extractedReqInfo && extractedReqInfo.found && extractedReqInfo.rows.length > 0) {
    payload.required_information = {
      found: true,
      section_label: extractedReqInfo.section_label,
      rows: extractedReqInfo.rows,
      captured_at: new Date().toISOString(),
      via: 'ai_from_rfp_body',
      tokens_used: extractedReqInfo.tokens_used,
    };
  } else if (priorReqInfo) {
    // Preserve prior (non-portal) required_information rather than nuking it.
    payload.required_information = priorReqInfo;
  }

  opp.submissionRequirements = payload;
  await opp.save();
  return payload;
}

// Pure helper for tests — no DB, no AI.
function computeAdditionalRequiredTypes(submissionRequirements, { confidenceThreshold = 0.5 } = {}) {
  if (!submissionRequirements || !Array.isArray(submissionRequirements.additional_required)) return [];
  return submissionRequirements.additional_required
    .filter((r) => Number(r.confidence) >= confidenceThreshold)
    .map((r) => ({
      type: r.type,
      name_if_other: r.name_if_other || null,
      reason: r.reason || null,
      source_quote: r.source_quote || null,
      confidence: r.confidence,
    }));
}

module.exports = {
  tailorRequirements,
  computeAdditionalRequiredTypes,
  validateAndFilter,
  buildUserPrompt,
  flaggableTypes,
  BASELINE_TYPES,
  SYSTEM_PROMPT,
};
