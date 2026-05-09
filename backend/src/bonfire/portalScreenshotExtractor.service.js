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
You receive one or more screenshots of a Bonfire (or similar) agency procurement portal page (the user may screenshot a long page in chunks; treat them as one continuous document, in the order provided).
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

// Persist a single screenshot to disk so we can re-extract later (e.g. after
// a prompt change) without asking the user to re-upload.
function storeOneScreenshot({ bonfireOpportunityId, buffer, originalName, mime }) {
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

const MAX_SHOTS = 5;
const MAX_BYTES_PER_SHOT = 20 * 1024 * 1024;

// Accepts either a single { buffer, originalName, mime } OR an array of them.
// Long portal pages need multiple screenshots — they're sent to vision in a
// single call so AI can correlate rows across the chunks.
async function extractFromScreenshot({
  bonfireOpportunityId, buffer, originalName, mime, files, uploadedBy = null,
} = {}) {
  // Normalize input.
  const shots = files && files.length
    ? files
    : (buffer ? [{ buffer, originalName, mime }] : []);
  if (!shots.length) {
    const err = new Error('No screenshot provided');
    err.code = 'EMPTY_BUFFER';
    throw err;
  }
  if (shots.length > MAX_SHOTS) {
    const err = new Error(`Too many screenshots (max ${MAX_SHOTS})`);
    err.code = 'TOO_MANY';
    throw err;
  }
  for (const s of shots) {
    if (!Buffer.isBuffer(s.buffer) || s.buffer.length === 0) {
      const err = new Error('Screenshot buffer is empty');
      err.code = 'EMPTY_BUFFER';
      throw err;
    }
    if (s.buffer.length > MAX_BYTES_PER_SHOT) {
      const err = new Error(`Screenshot too large (max ${MAX_BYTES_PER_SHOT / 1024 / 1024} MB per file)`);
      err.code = 'OVERSIZE';
      throw err;
    }
  }

  const opp = await BonfireOpportunity.findByPk(bonfireOpportunityId);
  if (!opp) {
    const err = new Error('Bonfire opportunity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Persist each to disk first so we have a record even if AI fails.
  const stored = shots.map((s) => storeOneScreenshot({
    bonfireOpportunityId,
    buffer: s.buffer,
    originalName: s.originalName,
    mime: s.mime,
  }));

  // Single AI call across all images.
  let parsed = null;
  let aiError = null;
  let tokensUsed = 0;
  try {
    const ai = getAIClient();
    const visionInput = shots.map((s) => ({
      buffer: s.buffer,
      mime: s.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    }));
    const userText = shots.length === 1
      ? USER_TEXT
      : `${USER_TEXT}\n\n(${shots.length} screenshots provided — they are chunks of one long portal page, in order.)`;
    const out = await ai.chatVision(SYSTEM_PROMPT, userText, visionInput, {
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
    screenshot_paths: stored.map((s) => s.fileRel),
    screenshot_count: stored.length,
    screenshot_bytes_total: shots.reduce((a, s) => a + s.buffer.length, 0),
    tokens_used: tokensUsed,
    ai_error: aiError,
  };
  opp.submissionRequirements = sr;
  opp.changed('submissionRequirements', true);
  await opp.save();

  logger.info('portalScreenshotExtractor: complete', {
    bonfireOpportunityId, screenshotCount: stored.length, found, row_count: rows.length, tokensUsed,
  });

  return {
    bonfire_opportunity_id: bonfireOpportunityId,
    found,
    section_label: parsed?.section_label || null,
    reason: parsed?.reason || null,
    rows,
    tokens_used: tokensUsed,
    ai_error: aiError,
    screenshot_paths: stored.map((s) => s.fileRel),
    screenshot_count: stored.length,
  };
}

module.exports = {
  SCREENSHOT_STORAGE_ROOT,
  SYSTEM_PROMPT,
  sanitizeRows,
  extractFromScreenshot,
};
