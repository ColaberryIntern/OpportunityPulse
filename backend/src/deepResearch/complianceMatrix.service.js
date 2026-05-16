// Deep Research Phase 9 — compliance matrix generator.
//
// Parses RFP requirements (from a structured template or free text) and
// builds a matrix of (item_kind, label, status, severity). Computes
// roll-up counts + completion %. DETERMINISTIC parser — no AI dependency;
// it recognizes well-known phrasing patterns and a default template.
//
// MEASURE-ONLY. Operators can edit any item's status; the matrix never
// auto-approves or auto-submits.

const { Op } = require('sequelize');
const {
  ComplianceMatrix, ComplianceMatrixItem, RfpAttachment,
} = require('../models');

const ITEM_KINDS = [
  'requirement', 'form', 'certification', 'attachment',
  'staffing', 'instruction', 'due_date',
];
const STATUSES = ['satisfied', 'partial', 'missing', 'na'];
const SEVERITIES = ['normal', 'high', 'critical'];

// Default federal/state-style matrix template. Used when no RFP text is
// provided so the operator has a punch-list to start from.
const DEFAULT_TEMPLATE = [
  { itemKind: 'form', label: 'SF-33 / SF-1449 cover form', severity: 'critical' },
  { itemKind: 'certification', label: 'SAM.gov active registration', severity: 'critical' },
  { itemKind: 'certification', label: 'Representations & Certifications (current)', severity: 'high' },
  { itemKind: 'attachment', label: 'Capability statement (2-pager)', severity: 'high' },
  { itemKind: 'attachment', label: 'Past performance (3-5 refs)', severity: 'high' },
  { itemKind: 'staffing', label: 'Key personnel resumes + bench plan', severity: 'high' },
  { itemKind: 'requirement', label: 'Technical approach narrative', severity: 'critical' },
  { itemKind: 'requirement', label: 'Pricing / cost narrative', severity: 'critical' },
  { itemKind: 'instruction', label: 'Page limit + format check', severity: 'normal' },
  { itemKind: 'due_date', label: 'Submission deadline + delivery method', severity: 'critical' },
];

// Heuristic phrase patterns for RFP-text parsing.
const PATTERNS = [
  { regex: /\b(SF[-\s]?(?:33|1449|330))\b/gi, kind: 'form', severity: 'critical', label: (m) => `Form ${m[1].toUpperCase()}` },
  { regex: /\b(NAICS\s*\d{6})\b/gi, kind: 'certification', severity: 'high', label: (m) => `${m[1]} eligibility` },
  { regex: /\bcage\s*code\b/gi, kind: 'certification', severity: 'high', label: () => 'CAGE code on file' },
  { regex: /\bsam\s*\.?\s*gov\b/gi, kind: 'certification', severity: 'critical', label: () => 'SAM.gov active registration' },
  { regex: /\bcapability\s+statement\b/gi, kind: 'attachment', severity: 'high', label: () => 'Capability statement' },
  { regex: /\bpast\s+performance\b/gi, kind: 'attachment', severity: 'high', label: () => 'Past performance references' },
  { regex: /\bkey\s+personnel\b/gi, kind: 'staffing', severity: 'high', label: () => 'Key personnel resumes' },
  { regex: /\bdue\s+(?:by|on|date)\b[^.\n]{0,40}/gi, kind: 'due_date', severity: 'critical', label: (m) => m[0].trim().slice(0, 120) },
  { regex: /\bpage\s+limit\b[^.\n]{0,30}/gi, kind: 'instruction', severity: 'normal', label: (m) => m[0].trim().slice(0, 120) },
  { regex: /\bsecurity\s+clearance\b/gi, kind: 'certification', severity: 'high', label: () => 'Security clearance required' },
  { regex: /\b(8\(a\)|HUBZone|WOSB|SDVOSB|small\s+business)\b/gi, kind: 'certification', severity: 'high', label: (m) => `${m[1]} set-aside eligibility` },
];

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((i) => {
    const key = `${i.itemKind}|${(i.label || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Parse a chunk of RFP text into compliance matrix items. Returns the items
// (not yet persisted) plus the recognized submission constraints.
function parseRfpText(text) {
  const out = [];
  const constraints = {};
  if (!text || !String(text).trim()) {
    return { items: dedupeItems(DEFAULT_TEMPLATE.map((t) => ({ ...t }))), constraints };
  }
  for (const p of PATTERNS) {
    let m;
    p.regex.lastIndex = 0;
    while ((m = p.regex.exec(text)) !== null) {
      const label = typeof p.label === 'function' ? p.label(m) : p.label;
      out.push({ itemKind: p.kind, label, severity: p.severity, requirementText: m[0] });
      if (p.kind === 'due_date') constraints.due_date_text = m[0].trim().slice(0, 200);
      if (p.kind === 'instruction' && /page\s+limit/i.test(m[0])) constraints.page_limit_text = m[0].trim().slice(0, 200);
    }
  }
  // Fold in the default template kinds that weren't already detected so the
  // operator always sees the standard punch-list.
  const have = new Set(out.map((i) => `${i.itemKind}|${(i.label || '').toLowerCase()}`));
  for (const t of DEFAULT_TEMPLATE) {
    const key = `${t.itemKind}|${(t.label || '').toLowerCase()}`;
    if (!have.has(key)) out.push({ ...t });
  }
  return { items: dedupeItems(out), constraints };
}

function rollUp(items) {
  const total = items.length;
  let satisfied = 0; let partial = 0; let missing = 0;
  for (const i of items) {
    if (i.status === 'satisfied') satisfied += 1;
    else if (i.status === 'partial') partial += 1;
    else if (i.status === 'missing' || !i.status) missing += 1;
  }
  const completionPct = total > 0 ? Math.round(((satisfied + partial * 0.5) / total) * 100) : 0;
  return { totalCount: total, satisfiedCount: satisfied, partialCount: partial, missingCount: missing, completionPct };
}

async function buildForPursuit(pursuitId, { rfpText = null, sourceAttachmentId = null } = {}) {
  const { items, constraints } = parseRfpText(rfpText);
  const initialItems = items.map((i) => ({ ...i, status: 'missing' }));
  const counts = rollUp(initialItems);
  // Idempotent rewrite — one current matrix per (pursuit, source); legacy
  // rows stay for audit but we don't compound them.
  await ComplianceMatrix.destroy({
    where: { pursuitId: Number(pursuitId), source: rfpText ? 'rfp_text' : 'manual' },
  });
  const matrix = await ComplianceMatrix.create({
    pursuitId: Number(pursuitId),
    source: rfpText ? 'rfp_text' : 'manual',
    sourceAttachmentId,
    submissionConstraints: constraints,
    rationale: `Generated ${initialItems.length} compliance items from ${rfpText ? 'RFP text parse' : 'default template'}.`,
    ...counts,
  });
  for (const item of initialItems) {
    // eslint-disable-next-line no-await-in-loop
    await ComplianceMatrixItem.create({
      complianceMatrixId: matrix.id,
      itemKind: item.itemKind,
      label: item.label,
      requirementText: item.requirementText || null,
      severity: item.severity || 'normal',
      status: 'missing',
    });
  }
  return getMatrixForPursuit(pursuitId);
}

async function getMatrixForPursuit(pursuitId) {
  const matrix = await ComplianceMatrix.findOne({
    where: { pursuitId: Number(pursuitId) },
    order: [['computed_at', 'DESC']],
  });
  if (!matrix) return null;
  const items = await ComplianceMatrixItem.findAll({
    where: { complianceMatrixId: matrix.id },
    order: [['item_kind', 'ASC'], ['id', 'ASC']],
  });
  return { matrix: matrix.toJSON(), items: items.map((i) => i.toJSON()) };
}

async function updateMatrixItem(itemId, { status, notes, severity, satisfiedBy } = {}) {
  const item = await ComplianceMatrixItem.findByPk(itemId);
  if (!item) { const err = new Error(`Matrix item ${itemId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const patch = {};
  if (status) {
    if (!STATUSES.includes(status)) {
      const err = new Error(`Invalid status: ${status}`); err.code = 'BAD_INPUT'; throw err;
    }
    patch.status = status;
  }
  if (notes !== undefined) patch.notes = notes;
  if (severity) {
    if (!SEVERITIES.includes(severity)) {
      const err = new Error(`Invalid severity: ${severity}`); err.code = 'BAD_INPUT'; throw err;
    }
    patch.severity = severity;
  }
  if (satisfiedBy !== undefined) patch.satisfiedBy = satisfiedBy || {};
  await item.update(patch);
  // Re-roll-up the parent matrix.
  await rerollMatrix(item.complianceMatrixId);
  return item.toJSON();
}

async function rerollMatrix(matrixId) {
  const items = await ComplianceMatrixItem.findAll({ where: { complianceMatrixId: matrixId } });
  const counts = rollUp(items.map((i) => i.toJSON()));
  await ComplianceMatrix.update(counts, { where: { id: matrixId } });
  return counts;
}

module.exports = {
  ITEM_KINDS, STATUSES, SEVERITIES, DEFAULT_TEMPLATE, PATTERNS,
  parseRfpText, rollUp,
  buildForPursuit, getMatrixForPursuit, updateMatrixItem, rerollMatrix,
};
