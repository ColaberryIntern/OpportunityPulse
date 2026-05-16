// Deep Research Phase 10 — optional LLM second-pass for compliance matrix.
//
// FEATURE-FLAG protected. Disabled by default. Only runs when the
// deterministic Phase 9 parser produced a low-completeness matrix AND
// the operator explicitly opts in. Structured extraction only — the LLM
// returns a JSON array of {item_kind, label, requirement_text, severity}
// records, which are merged into the existing matrix.
//
// IMPORTANT: deterministic parser remains primary. The LLM augments but
// does NOT replace the Phase 9 regex-based parser. Every LLM-extracted
// item is tagged in metadata.source so future audits know which came
// from regex vs LLM.

const logger = require('../logging/logger');
const {
  ComplianceMatrix, ComplianceMatrixItem,
} = require('../models');
const complianceMatrix = require('./complianceMatrix.service');
const aiProvider = require('./aiProvider.service');

const FEATURE_FLAG_ENV = 'DEEP_RESEARCH_LLM_COMPLIANCE_ENABLED';
const LOW_CONFIDENCE_THRESHOLD = 6;  // matrices with <6 items get a second look
const MAX_LLM_ITEMS = 25;

function isEnabled() {
  return process.env[FEATURE_FLAG_ENV] === 'true';
}

const SYSTEM_PROMPT = `You extract compliance requirements from RFP text. Return ONLY a JSON object with one key "items", whose value is an array of requirement objects, each shaped:
  { "item_kind": "requirement"|"form"|"certification"|"attachment"|"staffing"|"instruction"|"due_date",
    "label": "short label, <= 200 chars",
    "requirement_text": "the exact RFP phrase that drove this item, <= 400 chars",
    "severity": "critical"|"high"|"normal" }

Rules:
- Return AT MOST 25 items.
- Skip anything already obvious from a standard federal submission template (capability statement, past performance, key personnel, SAM.gov, page limit, deadline). The caller already has those from a deterministic parser.
- Severity "critical" is reserved for deal-breakers: missing forms, hard deadlines, mandatory certifications.
- Do NOT invent items. Every label must trace back to phrasing in the RFP text.
- Respond with ONLY the JSON object.`;

function sanitizeLlmItems(parsed) {
  if (!parsed || !Array.isArray(parsed.items)) return [];
  const out = [];
  const VALID_KINDS = new Set([
    'requirement', 'form', 'certification', 'attachment',
    'staffing', 'instruction', 'due_date',
  ]);
  const VALID_SEV = new Set(['critical', 'high', 'normal']);
  for (const raw of parsed.items.slice(0, MAX_LLM_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const item_kind = VALID_KINDS.has(raw.item_kind) ? raw.item_kind : 'requirement';
    const label = String(raw.label || '').slice(0, 200).trim();
    if (!label) continue;
    const requirement_text = String(raw.requirement_text || '').slice(0, 400);
    const severity = VALID_SEV.has(raw.severity) ? raw.severity : 'normal';
    out.push({ item_kind, label, requirement_text, severity });
  }
  return out;
}

// Try the LLM second-pass. Soft-fails: returns { ran: false, reason } if
// the feature flag is off, the matrix is already high-completeness, or
// the AI provider is unavailable.
async function maybeAugmentMatrix(pursuitId, {
  rfpText, force = false, actor = null,
} = {}) {
  if (!isEnabled()) {
    return { ran: false, reason: 'feature_flag_disabled' };
  }
  if (!rfpText || !String(rfpText).trim()) {
    return { ran: false, reason: 'no_rfp_text' };
  }
  // Confirm the matrix exists.
  const existing = await complianceMatrix.getMatrixForPursuit(pursuitId);
  if (!existing || !existing.matrix) {
    return { ran: false, reason: 'no_matrix' };
  }
  // Only augment when item count is low (deterministic parser was thin),
  // unless caller explicitly forces.
  if (!force && Number(existing.matrix.totalCount) >= LOW_CONFIDENCE_THRESHOLD) {
    return { ran: false, reason: 'matrix_already_complete', item_count: existing.matrix.totalCount };
  }

  let llmContent;
  try {
    const result = await aiProvider.chat(SYSTEM_PROMPT, String(rfpText).slice(0, 12000), {
      temperature: 0.1, maxTokens: 1400, operation: 'compliance_matrix_llm',
    });
    llmContent = result.content;
  } catch (e) {
    logger.warn('complianceMatrixLlm: provider call failed', { error: e.message });
    return { ran: false, reason: 'provider_error', error: e.message };
  }

  let parsed;
  try { parsed = JSON.parse(llmContent); }
  catch (e) {
    logger.warn('complianceMatrixLlm: LLM returned non-JSON');
    return { ran: false, reason: 'parse_error', snippet: String(llmContent).slice(0, 160) };
  }

  const items = sanitizeLlmItems(parsed);
  if (items.length === 0) {
    return { ran: true, added: 0, reason: 'no_items_after_sanitize' };
  }

  // Skip items whose labels already exist on the matrix (case-insensitive).
  const existingItems = existing.items.map((i) => String(i.label || '').toLowerCase());
  const fresh = items.filter((i) => !existingItems.includes(String(i.label || '').toLowerCase()));
  let added = 0;
  for (const item of fresh) {
    // eslint-disable-next-line no-await-in-loop
    await ComplianceMatrixItem.create({
      complianceMatrixId: existing.matrix.id,
      itemKind: item.item_kind,
      label: item.label,
      requirementText: item.requirement_text,
      status: 'missing',
      severity: item.severity,
      notes: 'LLM-extracted (Phase 10 second-pass).',
    });
    added += 1;
  }
  // Re-roll the matrix counts.
  await complianceMatrix.rerollMatrix(existing.matrix.id);
  // Stamp source on the matrix metadata.
  await ComplianceMatrix.update(
    { rationale: `${existing.matrix.rationale || ''} | LLM second-pass added ${added} items by ${actor || 'system'}.` },
    { where: { id: existing.matrix.id } },
  );
  return {
    ran: true, added,
    candidate_items: items.length,
    deduped: items.length - fresh.length,
  };
}

module.exports = {
  FEATURE_FLAG_ENV, LOW_CONFIDENCE_THRESHOLD, MAX_LLM_ITEMS,
  isEnabled, sanitizeLlmItems, maybeAugmentMatrix,
};
