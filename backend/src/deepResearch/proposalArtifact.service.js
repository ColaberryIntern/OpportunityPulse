// Deep Research Phase 9 — reusable proposal artifact vault.
//
// Org-wide artifact library — resumes / case studies / past performance /
// certifications / boilerplate / diagrams / capability statements /
// references / templates. Each artifact carries tags + capability_tags +
// agencies (which agencies it's been used with) + a reuse_score + an
// expires_at for time-bound artifacts (certifications, security clearances).
//
// MEASURE-ONLY. No file storage in v1 — content lives in `content` (text)
// or `content_ref` (URL/storage key).

const { Op } = require('sequelize');
const { ProposalArtifact } = require('../models');

const VALID_KINDS = [
  'resume', 'case_study', 'past_performance', 'certification',
  'boilerplate', 'diagram', 'capability_statement', 'reference', 'template',
];
const VALID_STATUSES = ['active', 'expiring', 'expired', 'archived'];

function assertValidKind(kind) {
  if (!VALID_KINDS.includes(kind)) {
    const err = new Error(`Invalid artifact_kind: ${kind}`);
    err.code = 'BAD_INPUT'; throw err;
  }
}

async function addArtifact({
  artifactKind, label, content = null, contentRef = null,
  tags = [], capabilityTags = [], agencies = [],
  reuseScore = 50, expiresAt = null, uploadedBy = null, metadata = {},
} = {}) {
  assertValidKind(artifactKind);
  if (!label) { const err = new Error('label is required'); err.code = 'BAD_INPUT'; throw err; }
  const row = await ProposalArtifact.create({
    artifactKind, label, content, contentRef,
    tags: Array.isArray(tags) ? tags : [],
    capabilityTags: Array.isArray(capabilityTags) ? capabilityTags : [],
    agencies: Array.isArray(agencies) ? agencies : [],
    reuseScore, expiresAt, uploadedBy, metadata,
  });
  return row.toJSON();
}

async function updateArtifact(id, updates = {}) {
  const row = await ProposalArtifact.findByPk(id);
  if (!row) { const err = new Error(`Artifact ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const patch = {};
  for (const k of ['label', 'content', 'contentRef', 'tags', 'capabilityTags',
    'agencies', 'reuseScore', 'expiresAt', 'status', 'metadata']) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }
  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    const err = new Error(`Invalid status: ${updates.status}`); err.code = 'BAD_INPUT'; throw err;
  }
  await row.update(patch);
  return row.toJSON();
}

async function deleteArtifact(id) {
  const row = await ProposalArtifact.findByPk(id);
  if (!row) { const err = new Error(`Artifact ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.destroy();
  return { id, deleted: true };
}

async function listArtifacts({
  artifactKind = null, status = null, q = null, limit = 100,
} = {}) {
  const where = {};
  if (artifactKind) where.artifactKind = artifactKind;
  if (status) where.status = status;
  if (q && q.trim()) {
    const needle = `%${q.trim()}%`;
    where[Op.or] = [
      { label: { [Op.iLike]: needle } },
      { content: { [Op.iLike]: needle } },
    ];
  }
  const rows = await ProposalArtifact.findAll({
    where, order: [['reuse_score', 'DESC'], ['times_used', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

// Detect artifacts whose expires_at is past or within the 30-day window
// and bump their status row accordingly. Idempotent — safe to call repeatedly.
async function refreshExpirationStatuses() {
  const now = Date.now();
  const soon = now + 30 * 86400_000;
  let expiredCount = 0; let expiringCount = 0;
  const candidates = await ProposalArtifact.findAll({
    where: {
      status: { [Op.in]: ['active', 'expiring'] },
      expiresAt: { [Op.ne]: null },
    },
  });
  for (const a of candidates) {
    const exp = new Date(a.expiresAt).getTime();
    if (exp < now && a.status !== 'expired') {
      // eslint-disable-next-line no-await-in-loop
      await a.update({ status: 'expired' });
      expiredCount += 1;
    } else if (exp < soon && a.status !== 'expiring' && exp >= now) {
      // eslint-disable-next-line no-await-in-loop
      await a.update({ status: 'expiring' });
      expiringCount += 1;
    }
  }
  return { expired: expiredCount, expiring: expiringCount };
}

// Suggest artifacts matched to a target context (capability + agency).
// Used by submission package assembler and pursuit-aware proposal context.
async function suggestForContext({
  capabilityTags = [], agencies = [], kinds = null, limit = 12,
} = {}) {
  const where = { status: { [Op.in]: ['active', 'expiring'] } };
  if (Array.isArray(kinds) && kinds.length) where.artifactKind = { [Op.in]: kinds };
  const rows = await ProposalArtifact.findAll({
    where, order: [['reuse_score', 'DESC']], limit: 200,
  });
  const capSet = new Set((capabilityTags || []).map((s) => String(s).toLowerCase()));
  const agencySet = new Set((agencies || []).map((s) => String(s).toLowerCase()));
  const scored = rows.map((r) => {
    const j = r.toJSON();
    let score = Number(j.reuseScore || 0);
    const caps = (j.capabilityTags || []).map((s) => String(s).toLowerCase());
    const ags = (j.agencies || []).map((s) => String(s).toLowerCase());
    for (const c of caps) if (capSet.has(c)) score += 8;
    for (const a of ags) if (agencySet.has(a)) score += 12;
    return { ...j, _match_score: Math.min(100, Math.round(score)) };
  }).sort((a, b) => b._match_score - a._match_score);
  return scored.slice(0, Math.min(100, Number(limit) || 12));
}

// Increment usage counter — called when an artifact is added to a
// submission package.
async function recordUse(id) {
  const row = await ProposalArtifact.findByPk(id);
  if (!row) return null;
  await row.update({ timesUsed: Number(row.timesUsed || 0) + 1 });
  return row.toJSON();
}

module.exports = {
  VALID_KINDS, VALID_STATUSES,
  addArtifact, updateArtifact, deleteArtifact,
  listArtifacts, refreshExpirationStatuses,
  suggestForContext, recordUse,
};
