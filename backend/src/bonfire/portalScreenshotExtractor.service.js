// Submission Readiness Engine v0.10 — vision-based portal screenshot extractor.
//
// Cloudflare Super Bot Fight Mode on TxDOT (and most other agency Bonfire
// portals) blocks every automated bypass we tried — stealth plugin, headed
// Chromium under Xvfb, 25-second waits. Confirmed; documented in PROGRESS.
//
// So we embrace the workflow the user is already doing: open the page in
// their real browser, take a screenshot of the "Required Information"
// section, drop the screenshot here. We send it to gpt-4o-mini's vision
// API and get back the structured submission checklist as JSON.
//
// This becomes the canonical readiness model — no more hardcoded baseline
// assumptions about "every government bid needs a COI."

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../logging/logger');
const { BonfireOpportunity } = require('../models');
const { getAIClient } = require('../analysis/ai.client');

const SCREENSHOT_STORAGE_ROOT = process.env.DOCUMENT_STORAGE_ROOT
  ? path.resolve(process.env.DOCUMENT_STORAGE_ROOT, '..', 'portal-screenshots')
  : path.resolve(process.cwd(), 'uploads', 'portal-screenshots');

const SYSTEM_PROMPT = `You are a procurement portal page reader.
You receive a screenshot of a Bonfire (or similar) agency procurement portal page.
Your job is to find the "Required Information" section — the table that lists every document the vendor must submit — and extract it as structured JSON.

Common section titles agencies use: "Required Information" · "Required Documents" · "Submission Requirements" · "Response Submission" · "Required Response".

For each row in that table, capture:
- name: the document/item name as written on the page (verbatim, no paraphrasing)
- file_type: the file format the agency wants (e.g. "pdf", "xlsx", "docx", "BidTable", "Multiple")
- required: true if marked Required (often a green pill or "Required" text); false if Optional
- conditions: any conditional language ("if applicable", "as needed", "use Response Template", etc.) — null if none
- count: how many files the row expects (1, "Multiple", or null if unclear)

IMPORTANT:
- Skip the "Supporting Documentation" section — that's the agency-provided templates we DOWNLOAD. Only extract "Required Information" / submission-side rows.
- If you can't find a Required Information section in the screenshot, return { "found": false, "reason": "..." }.
- Do not invent rows. If a column is unclear, use null instead of guessing.

Respond with JSON only:
{
  "found": true,
  "section_label": "Required Information",
  "rows": [
    { "name": "Pricing Schedule", "file_type": "xlsx", "required": true, "conditions": null, "count": 1 }
  ]
}
OR
{
  "found": false,
  "reason": "Screenshot does not contain a Required Information table — user may need to scroll the portal page and re-capture."
}`;

const USER_TEXT = 'Read the Required Information / submission-requirements section from this portal page screenshot. Extract every row as JSON per the system instructions.';

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function sanitizeRows(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name || '').trim().slice(0, 240);
    if (!name) continue;
    out.push({
      name,
      file_type: r.file_type ? String(r.file_type).trim().slice(0, 60) : null,
      required: r.required === true,
      conditions: r.conditions ? String(r.conditions).trim().slice(0, 240) : null,
      count: typeof r.count === 'number' ? r.count
        : (typeof r.count === 'string' && r.count.trim() ? r.count.trim().slice(0, 30) : null),
    });
    if (out.length >= 50) break; // hard cap on hallucinated giant tables
  }
  return out;
}

// Persist the screenshot to disk so we can re-extract later (e.g. after a
// prompt change) without asking the user to re-upload.
function storeScreenshot({ bonfireOpportunityId, buffer, originalName, mime }) {
  const dirRel = path.posix.join(String(bonfireOpportunityId));
  const dirAbs = path.join(SCREENSHOT_STORAGE_ROOT, dirRel);
  ensureDir(dirAbs);
  const ext = (originalName && originalName.match(/\.(\w{2,5})$/)?.[1])
    || (mime === 'image/jpeg' ? 'jpg' : 'png');
  const fileRel = path.posix.join(dirRel, `${crypto.randomBytes(4).toString('hex')}-portal.${ext}`);
  const fileAbs = path.join(SCREENSHOT_STORAGE_ROOT, fileRel);
  fs.writeFileSync(fileAbs, buffer);
  return { fileRel, fileAbs };
}

async function extractFromScreenshot({ bonfireOpportunityId, buffer, originalName, mime, uploadedBy = null }) {
  const opp = await BonfireOpportunity.findByPk(bonfireOpportunityId);
  if (!opp) {
    const err = new Error('Bonfire opportunity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('Screenshot buffer is empty');
    err.code = 'EMPTY_BUFFER';
    throw err;
  }
  // Cap at 20 MB — gpt-4o-mini vision limit.
  if (buffer.length > 20 * 1024 * 1024) {
    const err = new Error('Screenshot too large (max 20 MB)');
    err.code = 'OVERSIZE';
    throw err;
  }

  // Persist to disk first so we have a record even if AI fails.
  const stored = storeScreenshot({ bonfireOpportunityId, buffer, originalName, mime });

  // Call vision model.
  let parsed = null;
  let aiError = null;
  let tokensUsed = 0;
  try {
    const ai = getAIClient();
    const out = await ai.chatVision(SYSTEM_PROMPT, USER_TEXT, buffer, {
      mime: mime === 'image/jpeg' ? 'image/jpeg' : 'image/png',
      temperature: 0,
      maxTokens: 2500,
    });
    tokensUsed = out.tokensUsed;
    try { parsed = JSON.parse(out.content); }
    catch (e) {
      logger.warn('portalScreenshotExtractor: AI returned non-JSON', { content: String(out.content).slice(0, 200) });
      parsed = null;
    }
  } catch (e) {
    aiError = e.message;
    logger.error('portalScreenshotExtractor: AI call failed', { bonfireOpportunityId, error: e.message });
  }

  const found = parsed && parsed.found === true;
  const rows = found ? sanitizeRows(parsed.rows) : [];

  // Persist on the opp.
  const sr = opp.submissionRequirements && typeof opp.submissionRequirements === 'object'
    ? { ...opp.submissionRequirements }
    : {};
  sr.required_information = {
    found,
    section_label: parsed?.section_label || null,
    reason: parsed?.reason || null,
    rows,
    captured_at: new Date().toISOString(),
    captured_by: uploadedBy,
    screenshot_path: stored.fileRel,
    screenshot_bytes: buffer.length,
    tokens_used: tokensUsed,
    ai_error: aiError,
  };
  opp.submissionRequirements = sr;
  opp.changed('submissionRequirements', true);
  await opp.save();

  logger.info('portalScreenshotExtractor: complete', {
    bonfireOpportunityId, found, row_count: rows.length, tokensUsed,
  });

  return {
    bonfire_opportunity_id: bonfireOpportunityId,
    found,
    section_label: parsed?.section_label || null,
    reason: parsed?.reason || null,
    rows,
    tokens_used: tokensUsed,
    ai_error: aiError,
    screenshot_path: stored.fileRel,
  };
}

module.exports = {
  SCREENSHOT_STORAGE_ROOT,
  SYSTEM_PROMPT,
  sanitizeRows,
  extractFromScreenshot,
};
