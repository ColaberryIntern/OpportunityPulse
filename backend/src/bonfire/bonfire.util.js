const crypto = require('crypto');
const { RAW_TEXT_MAX_STORE, ENRICHMENT_VERSION } = require('./bonfire.constants');

// Sensitive attribute names that are nulled for non-admin users.
// Sequelize's toJSON() returns camelCase attribute keys, so redaction targets both
// the camelCase (API-facing) and snake_case (raw-query safety) forms.
const ADMIN_ONLY_FIELDS = ['sourceUrl', 'rawText', 'source_url', 'raw_text'];

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

// Central redaction helper — call for EVERY egress path (list, detail, strategy).
function redactForRole(row, user) {
  if (!row) return row;
  const plain = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
  if (isAdmin(user)) return plain;
  for (const f of ADMIN_ONLY_FIELDS) {
    plain[f] = null;
  }
  return plain;
}

function redactListForRole(rows, user) {
  return (rows || []).map((r) => redactForRole(r, user));
}

// Normalize estimated_value to cents. Accepts:
//   number or numeric string (treated as dollars — multiplied by 100)
//   dollar-formatted string like "$450,000" (treated as dollars)
//   very large integers (>= 1e10) are treated as already being in cents
//   null/undefined/empty string -> null
function normalizeEstimatedValue(input) {
  if (input === null || input === undefined || input === '') return null;
  let asNum;
  if (typeof input === 'number' && Number.isFinite(input)) {
    asNum = input;
  } else {
    const cleaned = String(input).replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    asNum = Number(cleaned);
    if (!Number.isFinite(asNum)) return null;
  }
  // 10 billion is ~the line where numbers "look like cents" rather than dollars.
  return asNum >= 10_000_000_000 ? Math.round(asNum) : Math.round(asNum * 100);
}

function normalizeCloseDate(input) {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function truncateRawText(text) {
  if (!text) return null;
  const s = String(text);
  return s.length > RAW_TEXT_MAX_STORE ? s.slice(0, RAW_TEXT_MAX_STORE) : s;
}

// Validate a single upload row. Returns {ok: true, row} or {ok: false, reason}.
function validateRow(row, index) {
  if (!row || typeof row !== 'object') {
    return { ok: false, reason: `row ${index}: not an object` };
  }
  if (!row.title || String(row.title).trim() === '') {
    return { ok: false, reason: `row ${index}: title required` };
  }
  // Keys in camelCase — Sequelize model attributes are camelCase (mapped to
  // snake_case columns via `field:` in the model definition).
  const normalized = {
    title: String(row.title).trim().slice(0, 500),
    agency: row.agency ? String(row.agency).trim().slice(0, 300) : null,
    description: row.description ? String(row.description) : null,
    categoryRaw: row.category_raw ? String(row.category_raw).trim().slice(0, 200) : null,
    estimatedValue: normalizeEstimatedValue(row.estimated_value),
    closeDate: normalizeCloseDate(row.close_date),
    sourceUrl: row.source_url ? String(row.source_url).trim() : null,
    rawText: truncateRawText(row.raw_text || row.description || row.title),
    externalId: row.external_id ? String(row.external_id).trim().slice(0, 200) : null,
  };
  return { ok: true, row: normalized };
}

// Very small, dependency-free CSV parser. Handles quoted fields and embedded commas.
// NOT a full RFC 4180 implementation — sufficient for hand-curated Bonfire exports.
function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { cur.push(field); field = ''; };
  const pushRow = () => { if (cur.length || field !== '') { pushField(); rows.push(cur); cur = []; } };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\r') {
      // skip, CRLF handled by \n case
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== '' || cur.length) pushRow();
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((f) => f !== '')).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; });
    return obj;
  });
}

function parseJsonArray(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON upload must be an array of objects');
  }
  return parsed;
}

function computeEnrichmentHash(rawText, version = ENRICHMENT_VERSION) {
  return crypto
    .createHash('sha256')
    .update(String(rawText || '') + ':' + String(version))
    .digest('hex');
}

module.exports = {
  ADMIN_ONLY_FIELDS,
  isAdmin,
  redactForRole,
  redactListForRole,
  normalizeEstimatedValue,
  normalizeCloseDate,
  truncateRawText,
  validateRow,
  parseCsv,
  parseJsonArray,
  computeEnrichmentHash,
};
