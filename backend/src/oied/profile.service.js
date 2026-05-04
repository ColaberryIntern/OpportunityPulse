// Per-organization business profile. One row per org (renamed in v4
// from per-user). Used by the fit-scoring engine to personalize matches.
//
// Fall-through: when an org has no profile row, getOrDefault returns the
// global default. This preserves day-1 behavior for any tenant that never
// visits /admin/profile.
//
// Backwards-compat: getProfile / getOrDefault still accept a userId for
// older callers; we resolve to the user's organizationId internally. New
// callers should pass organizationId directly via the *ByOrg variants.

const { OrganizationProfile, User } = require('../models');

const GLOBAL_DEFAULT = {
  services: ['ai-systems', 'data-analytics', 'staffing', 'compliance', 'consulting', 'it-services', 'automation', 'data-science'],
  industries: ['IT Services', 'Data & Analytics', 'Staffing', 'Compliance', 'Consulting'],
  minDealSize: 1000,
  tools: [],
  pastWins: [],
  riskTolerance: 'medium',
  preferences: {
    geoPreference: ['tx', 'texas', 'austin', 'dallas', 'houston'],
    strategicTags: ['ai', 'automation', 'data', 'platform', 'analytics'],
  },
};

const DEFAULT_ORG_ID = 1;

// Resolve a userId → organizationId via the users table. Falls back to
// DEFAULT_ORG_ID when userId is null OR the user has no org_id set.
async function resolveOrgId(userId) {
  if (!userId) return DEFAULT_ORG_ID;
  try {
    const u = await User.findByPk(userId, { attributes: ['id', 'organizationId'] });
    return (u && u.organizationId) || DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

async function getProfileByOrg(organizationId) {
  if (!organizationId) return null;
  const row = await OrganizationProfile.findOne({ where: { organizationId } });
  return row ? row.toJSON() : null;
}

async function getOrDefaultByOrg(organizationId) {
  const orgId = organizationId || DEFAULT_ORG_ID;
  const real = await getProfileByOrg(orgId);
  if (real) return real;
  return { ...GLOBAL_DEFAULT, organizationId: orgId, _isDefault: true };
}

// Legacy entry point — caller passes userId; we resolve org internally.
async function getProfile(userId) {
  const orgId = await resolveOrgId(userId);
  return getProfileByOrg(orgId);
}

async function getOrDefault(userId) {
  const orgId = await resolveOrgId(userId);
  return getOrDefaultByOrg(orgId);
}

const ALLOWED_FIELDS = [
  'services', 'industries', 'minDealSize', 'tools',
  'pastWins', 'riskTolerance', 'preferences',
];

function pick(obj) {
  const out = {};
  for (const k of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj || {}, k)) out[k] = obj[k];
  }
  return out;
}

async function createProfile(userId, body) {
  const orgId = await resolveOrgId(userId);
  // Idempotent: if it exists, treat as update.
  const existing = await OrganizationProfile.findOne({ where: { organizationId: orgId } });
  if (existing) {
    Object.assign(existing, pick(body));
    await existing.save();
    return existing.toJSON();
  }
  const row = await OrganizationProfile.create({
    organizationId: orgId, userId: userId || null, ...pick(body),
  });
  return row.toJSON();
}

async function patchProfile(userId, body) {
  const orgId = await resolveOrgId(userId);
  let row = await OrganizationProfile.findOne({ where: { organizationId: orgId } });
  if (!row) {
    row = await OrganizationProfile.create({
      organizationId: orgId, userId: userId || null, ...pick(body),
    });
    return row.toJSON();
  }
  Object.assign(row, pick(body));
  await row.save();
  return row.toJSON();
}

module.exports = {
  getProfile,
  getOrDefault,
  getProfileByOrg,
  getOrDefaultByOrg,
  resolveOrgId,
  createProfile,
  patchProfile,
  GLOBAL_DEFAULT,
  DEFAULT_ORG_ID,
};
