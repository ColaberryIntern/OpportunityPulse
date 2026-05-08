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

const { BonfireOpportunity } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const types = require('../documents/documentTypes');
const logger = require('../logging/logger');

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

function buildUserPrompt(opp) {
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
  return lines.join('\n');
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
  // Cached path — return existing unless force=true.
  if (!force && opp.submissionRequirements && opp.submissionRequirements.generated_at) {
    return opp.submissionRequirements;
  }

  const ai = getAIClient();
  const userPrompt = buildUserPrompt(opp);
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
  const payload = {
    generated_at: startedAt.toISOString(),
    model_used: modelUsed,
    baseline_types: BASELINE_TYPES.slice(),
    additional_required: validated.additional_required,
    summary: validated.summary,
    error: parsed._error || null,
  };
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
