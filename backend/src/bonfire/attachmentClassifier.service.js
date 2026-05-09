// Submission Readiness Engine v0.9 (Phase A) — attachment classifier.
//
// For each RFP attachment uploaded by the human (or fetched by Playwright),
// labels it as:
//   read_only_reference  — RFP body, SOW, Q&A, intro docs (read for context)
//   vendor_form          — DOCX template with fields the vendor must fill +
//                          sign (Execution of Offer, Family Code Schedule, etc.)
//   vendor_schedule      — XLSX/spreadsheet the vendor populates (Pricing,
//                          Assumptions, Exceptions)
//   other                — fallback (images, terms-of-service, etc.)
//
// For vendor_form rows, also extracts the field list (key + label + required
// + example value) so Phase B's form-filler knows what to populate from the
// org profile.
//
// Classification persists on attachment.metadata.classification + .fields.
// AI uses gpt-4o-mini with a JSON-Schema'd response; failure → records error
// on the row but doesn't throw (so an upload of 7 files doesn't fail because
// 1 classifier call hiccupped).

const logger = require('../logging/logger');
const { OpportunityAttachment } = require('../models');
const { getAIClient } = require('../analysis/ai.client');

const CLASSIFICATIONS = ['read_only_reference', 'vendor_form', 'vendor_schedule', 'other'];

const SYSTEM_PROMPT = `You are a federal-and-state procurement document classifier.
Given one RFP attachment's filename, mime type, and (if available) the first ~3000 chars of its body text, decide whether it is:

- "read_only_reference": The agency-authored RFP body, Statement of Work, Q&A, addendum, or intro doc. The vendor reads it but does NOT modify it.
- "vendor_form": A DOCX or PDF template the vendor must complete: signs, fills in company info, certifies compliance. Examples: "Execution of Offer", "Bidder Certification", "Family Code Schedule", "W-9", "Anti-Lobbying Certification", "Vendor Information Form".
- "vendor_schedule": A spreadsheet (XLSX or XLS) the vendor populates with values. Examples: "Pricing Schedule", "Assumptions Schedule", "Exceptions Schedule", "Cost Worksheet", "BidTable", "Schedule of Quantities".
- "other": images, ZIP containers, terms-of-service PDFs, or anything that doesn't fit the above.

For "vendor_form" rows ONLY, also list the fillable fields. A field is anything the vendor needs to enter or sign. Common fields: company_name, ein, uei, cage, duns, naics, signatory_name, signatory_title, address, city, state, zip, phone, email, date, signature, texas_resident_yes_no, owner_25_plus_name, owner_25_plus_ssn.

For other classifications, return fields: [].

Respond with JSON only, no prose, matching this schema exactly:
{
  "classification": "read_only_reference" | "vendor_form" | "vendor_schedule" | "other",
  "confidence": 0.0-1.0,
  "reason": "one short sentence",
  "fields": [
    { "key": "company_name", "label": "Company Name", "required": true, "example": "Colaberry Inc." }
  ]
}`;

// Heuristic shortcut — for unambiguous filenames we can skip the AI call.
// This is a cost optimization for ZIPs with 7-9 files like the CARS bid.
function fastClassifyByName(name) {
  // Normalize: punctuation (incl. underscore — our safeFilename replaces commas
  // with underscores during storage) becomes a space so word boundaries work
  // around phrases like "Statement of Work_ 920-03-53067_ Dated November 2025".
  const n = String(name || '')
    .toLowerCase()
    .replace(/[_,;:]+/g, ' ')
    .replace(/\s+/g, ' ');
  // Read-only references — RFP / SOW / RFO / Q&A / addendum
  if (/\b(rfp|rfo|rfq|sow|statement of work|solicitation|q&a|qna|amendment|addendum|introduction|intro)\b/.test(n)) {
    return { classification: 'read_only_reference', confidence: 0.85, reason: 'Filename indicates agency-authored reference doc.', fields: [] };
  }
  // Vendor schedules — XLSX with schedule / pricing / cost / bid-table indicators
  if (/\.xlsx?$/i.test(n)) {
    return { classification: 'vendor_schedule', confidence: 0.8, reason: 'XLSX file — agencies use spreadsheets for vendor-populated schedules.', fields: [] };
  }
  // Vendor forms — common form-like titles in DOCX or PDF (forms ship in both formats).
  // Includes the actual filenames seen on TxDOT + 207-26 RFQU bids.
  const isFormable = /\.(docx?|pdf)$/i.test(n);
  if (isFormable && /\b(execution of offer|family code|bidder cert|certification|w-?9|w9|exceptions|commitment to perform|immigration|offerors? exceptions|offerors? modifications|checklist|sealed submittal|firm general|qualification|vendor information|anti.?lobbying|debarment)\b/.test(n)) {
    return { classification: 'vendor_form', confidence: 0.8, reason: 'Filename matches a vendor-form template — likely fillable.', fields: [] };
  }
  return null; // fall through to AI
}

function isValidClassification(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (!CLASSIFICATIONS.includes(parsed.classification)) return false;
  return true;
}

function sanitizeFields(rawFields) {
  if (!Array.isArray(rawFields)) return [];
  const out = [];
  for (const f of rawFields) {
    if (!f || typeof f !== 'object') continue;
    const key = String(f.key || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '')   // strip leading/trailing underscores from punctuation runs
      .slice(0, 60);
    if (!key) continue;
    out.push({
      key,
      label: String(f.label || key).slice(0, 120),
      required: !!f.required,
      example: f.example ? String(f.example).slice(0, 120) : null,
    });
    if (out.length >= 30) break; // cap so a hallucinated 200-row response can't bloat the metadata
  }
  return out;
}

// Classify one attachment (must have an id + name + parsedText snapshot).
// Persists the result on metadata.classification / .classification_confidence /
// .classification_reason / .fields. Returns the persisted shape.
async function classifyOne({ attachmentId, useAi = true }) {
  const row = await OpportunityAttachment.findByPk(attachmentId);
  if (!row) {
    const err = new Error('Attachment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  let parsed = null;
  let usedFastPath = false;
  let aiRanSuccessfully = false;
  let aiError = null;

  // Fast path — clear-cut filename match.
  parsed = fastClassifyByName(row.name);
  if (parsed) usedFastPath = true;

  // AI path — for ambiguous filenames OR vendor_form rows where we want field extraction.
  // Skip AI if useAi=false (test harness) OR if no body text available AND fast path was confident.
  if (useAi && (!usedFastPath || parsed.classification === 'vendor_form')) {
    try {
      const ai = getAIClient();
      const userPrompt = buildUserPrompt(row);
      const aiOut = await ai.chat({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        temperature: 0,
        responseFormat: { type: 'json_object' },
      });
      let aiParsed;
      try { aiParsed = JSON.parse(aiOut.content); }
      catch { aiParsed = null; }
      if (isValidClassification(aiParsed)) {
        parsed = {
          classification: aiParsed.classification,
          confidence: Math.max(0, Math.min(1, Number(aiParsed.confidence) || 0)),
          reason: String(aiParsed.reason || '').slice(0, 240),
          fields: sanitizeFields(aiParsed.fields),
        };
        aiRanSuccessfully = true;
      }
    } catch (e) {
      aiError = e.message;
      logger.warn('attachmentClassifier: AI call failed, keeping fast-path or unknown', { id: attachmentId, error: e.message });
    }
  }

  if (!parsed) {
    parsed = { classification: 'other', confidence: 0.3, reason: 'Could not determine — fell back to "other".', fields: [] };
  }

  const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  meta.classification = parsed.classification;
  meta.classification_confidence = parsed.confidence;
  meta.classification_reason = parsed.reason;
  // 'ai' if the AI call succeeded (even if fast path also fired — AI's the
  // source of truth in that case because it enriched fields). 'fast_path'
  // only when the fast path was the sole input.
  meta.classification_via = aiRanSuccessfully ? 'ai' : 'fast_path';
  meta.classified_at = new Date().toISOString();
  if (aiError) meta.classification_error = aiError;
  meta.fields = parsed.fields;
  row.metadata = meta;
  row.changed('metadata', true);
  await row.save();

  return {
    id: row.id,
    name: row.name,
    classification: parsed.classification,
    confidence: parsed.confidence,
    reason: parsed.reason,
    via: meta.classification_via,
    fields: parsed.fields,
  };
}

function buildUserPrompt(row) {
  const text = (row.parsedText || '').slice(0, 3000);
  const lines = [
    `Filename: ${row.name}`,
    `MIME: ${row.mime || '(unknown)'}`,
    `Size: ${row.sizeBytes || 0} bytes`,
    text
      ? `\nFirst ~3000 chars of body text:\n${text}`
      : '\n(No body text available — classify by filename + mime alone.)',
  ];
  return lines.join('\n');
}

// Classify every attachment for an opp. Idempotent — re-classifies even if
// already classified (so admins can re-run after a prompt change). Failures
// per-row are logged but don't abort the whole batch.
async function classifyAllForOpp({ bonfireOpportunityId, useAi = true } = {}) {
  const rows = await OpportunityAttachment.findAll({
    where: { bonfireOpportunityId },
    attributes: ['id', 'name'],
  });
  const results = [];
  for (const r of rows) {
    try {
      const out = await classifyOne({ attachmentId: r.id, useAi });
      results.push(out);
    } catch (e) {
      logger.error('attachmentClassifier: classify failed', { id: r.id, error: e.message });
      results.push({ id: r.id, name: r.name, error: e.message });
    }
  }
  return {
    bonfire_opportunity_id: bonfireOpportunityId,
    classified: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
    by_classification: groupByClassification(results),
    results,
  };
}

function groupByClassification(results) {
  const out = { read_only_reference: 0, vendor_form: 0, vendor_schedule: 0, other: 0 };
  for (const r of results) {
    if (r.classification && out[r.classification] != null) out[r.classification] += 1;
  }
  return out;
}

module.exports = {
  CLASSIFICATIONS,
  classifyOne,
  classifyAllForOpp,
  fastClassifyByName,
  sanitizeFields,
  isValidClassification,
  buildUserPrompt,
};
