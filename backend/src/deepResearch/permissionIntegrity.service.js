// Deep Research Phase 13 — permission integrity audit.
//
// Periodic point-in-time audit: how many users vs. how many have an
// active OperatorPermission grant, who is over-permissioned, who has
// orphaned grants (revoked role with active permissions cached), who
// has stale grants (older than retention window).

const { Op } = require('sequelize');
const {
  User, OperatorPermission, PermissionIntegrity,
} = require('../models');
const rbac = require('./rbac.service');
const logger = require('../logging/logger');

const STALE_DAYS = Number(process.env.DEEP_RESEARCH_RBAC_STALE_DAYS) || 90;
const OVER_PERMISSION_THRESHOLD = 0.9;  // 90%+ of all perms granted = "over-permissioned"

async function evaluateUser(user, totalPerms) {
  const role = rbac.normalizeLegacyRole(user.role && user.role.roleName ? user.role.roleName : null);
  const description = await rbac.describePermissions(user.id, role);
  const grantPct = totalPerms > 0 ? description.permissions.length / totalPerms : 0;
  return {
    user_id: user.id, email: user.email,
    role: description.role, role_level: description.role_level,
    permission_count: description.permissions.length,
    over_permissioned: grantPct >= OVER_PERMISSION_THRESHOLD && role !== 'super_admin',
  };
}

async function computeIntegrity({ organizationId = null } = {}) {
  const userWhere = organizationId != null ? { organizationId: Number(organizationId) } : {};
  const users = await User.findAll({
    where: userWhere, limit: 500,
    include: [{ association: 'role', required: false }],
  });
  const totalPerms = rbac.PERMISSIONS.length;
  const evaluations = [];
  let mapped = 0;
  let overPerm = 0;
  for (const u of users) {
    // eslint-disable-next-line no-await-in-loop
    const evaluation = await evaluateUser(u, totalPerms);
    if (evaluation.permission_count > 0) mapped += 1;
    if (evaluation.over_permissioned) overPerm += 1;
    evaluations.push(evaluation);
  }
  // Orphan grants: OperatorPermission rows whose user_id no longer exists.
  const userIds = new Set(users.map((u) => u.id));
  const grantsWhere = organizationId != null
    ? { organizationId: Number(organizationId), revokedAt: null }
    : { revokedAt: null };
  const activeGrants = await OperatorPermission.findAll({ where: grantsWhere, limit: 1000 });
  const orphanGrants = activeGrants.filter((g) => !userIds.has(g.userId)).length;
  // Stale grants: granted_at older than STALE_DAYS.
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400_000);
  const staleGrants = activeGrants.filter((g) => new Date(g.grantedAt) < staleCutoff).length;

  // Integrity score: penalize orphan + over-permissioned + stale.
  let score = 100;
  score -= Math.min(40, orphanGrants * 5);
  score -= Math.min(30, overPerm * 4);
  score -= Math.min(20, staleGrants * 2);
  if (users.length > 0 && mapped === 0) score = Math.min(score, 50);
  score = Math.max(0, Math.min(100, score));

  return {
    organization_id: organizationId,
    total_users: users.length,
    mapped_users: mapped,
    over_permissioned_users: overPerm,
    orphan_grants: orphanGrants,
    stale_grants: staleGrants,
    integrity_score: score,
    sample_over_permissioned: evaluations.filter((e) => e.over_permissioned).slice(0, 10),
  };
}

async function snapshot({ organizationId = null } = {}) {
  const data = await computeIntegrity({ organizationId });
  try {
    return await PermissionIntegrity.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      totalUsers: data.total_users,
      mappedUsers: data.mapped_users,
      overPermissionedUsers: data.over_permissioned_users,
      orphanGrants: data.orphan_grants,
      staleGrants: data.stale_grants,
      integrityScore: data.integrity_score,
      details: data,
    });
  } catch (e) {
    logger.warn('permissionIntegrity.snapshot failed', { error: e.message });
    return null;
  }
}

async function recentSnapshots({ organizationId = null, limit = 20 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await PermissionIntegrity.findAll({
    where, order: [['snapshot_at', 'DESC']],
    limit: Math.min(100, Number(limit) || 20),
  });
  return rows.map((r) => r.toJSON());
}

async function mismatchReport({ organizationId = null } = {}) {
  const data = await computeIntegrity({ organizationId });
  const findings = [];
  if (data.orphan_grants > 0) findings.push({ severity: 80, kind: 'orphan_grants', count: data.orphan_grants, recommendation: 'Revoke OperatorPermission rows whose user no longer exists.' });
  if (data.over_permissioned_users > 0) findings.push({ severity: 60, kind: 'over_permissioned', count: data.over_permissioned_users, recommendation: 'Review the over-permissioned users; downgrade roles where not warranted.' });
  if (data.stale_grants > 0) findings.push({ severity: 30, kind: 'stale_grants', count: data.stale_grants, recommendation: `Grants older than ${STALE_DAYS} days should be re-confirmed.` });
  return { organization_id: organizationId, findings, computed: data };
}

module.exports = {
  STALE_DAYS, OVER_PERMISSION_THRESHOLD,
  evaluateUser, computeIntegrity, snapshot,
  recentSnapshots, mismatchReport,
};
