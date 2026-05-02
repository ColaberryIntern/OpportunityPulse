// Per-user business profile. One row per user, keyed on user_id.
// Used by the fit-scoring engine to personalize matches.
//
// Fall-through: when a user has no profile row, getOrDefault returns a
// "global default" profile so the scorer always has something concrete to
// work with. This preserves day-1 behavior for users who never visit
// /admin/profile.

const { UserProfile } = require('../models');

// The global default. Mirrors the prior hardcoded DEFAULT_PROFILE in
// fitScoring.service.js. Used only when a user has no profile of their own.
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

async function getProfile(userId) {
  if (!userId) return null;
  const row = await UserProfile.findOne({ where: { userId } });
  return row ? row.toJSON() : null;
}

async function getOrDefault(userId) {
  const real = await getProfile(userId);
  if (real) return real;
  return { ...GLOBAL_DEFAULT, userId, _isDefault: true };
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
  if (!userId) throw new Error('userId required');
  // Idempotent: if it exists, treat as update.
  const existing = await UserProfile.findOne({ where: { userId } });
  if (existing) {
    Object.assign(existing, pick(body));
    await existing.save();
    return existing.toJSON();
  }
  const row = await UserProfile.create({ userId, ...pick(body) });
  return row.toJSON();
}

async function patchProfile(userId, body) {
  if (!userId) throw new Error('userId required');
  let row = await UserProfile.findOne({ where: { userId } });
  if (!row) {
    // Create with the patched fields when the user has no profile yet.
    row = await UserProfile.create({ userId, ...pick(body) });
    return row.toJSON();
  }
  Object.assign(row, pick(body));
  await row.save();
  return row.toJSON();
}

module.exports = {
  getProfile,
  getOrDefault,
  createProfile,
  patchProfile,
  GLOBAL_DEFAULT,
};
