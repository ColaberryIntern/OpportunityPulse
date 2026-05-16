// Deep Research Phase 11 — enterprise role-based access control.
//
// 6 roles, ~30 declared permissions. Permissions are checked by name
// (e.g. 'queue.cancel', 'artifact.upload'); each role has a default set,
// and a per-user OperatorPermission row can override (grant or revoke).
//
// IMPORTANT: this module is intentionally pure-data + deterministic. The
// existing legacy `ROLES.ADMIN` middleware continues to work for routes
// that haven't been migrated yet — Phase 11 RBAC layers on top, it does
// not replace.

const { OperatorPermission } = require('../models');
const { Op } = require('sequelize');
const logger = require('../logging/logger');

// Canonical role ladder. Higher index = broader access.
const ROLE_NAMES = [
  'observer', 'reviewer', 'proposal_writer',
  'capture_manager', 'org_admin', 'super_admin',
];

const ROLE_LEVELS = ROLE_NAMES.reduce((acc, r, i) => { acc[r] = i; return acc; }, {});

// Permission identifiers — additive, names are stable.
const PERMISSIONS = [
  // Read surfaces
  'dashboard.view', 'pursuit.view', 'opportunity.view', 'audit.view',
  'compliance.view', 'sla.view', 'governance.view', 'lineage.view',
  // Pursuit + draft actions
  'pursuit.activate', 'pursuit.deactivate', 'pursuit.edit',
  'draft.generate', 'draft.regenerate',
  // Artifact + storage
  'artifact.upload', 'artifact.download', 'artifact.delete',
  'storage.delete', 'storage.signed_url',
  // Compliance
  'compliance.edit', 'compliance.augment_llm',
  // Queue / worker
  'queue.cancel', 'queue.drain', 'queue.enqueue',
  // Approval
  'approval.acknowledge', 'approval.approve', 'approval.reject',
  // SLA
  'sla.acknowledge', 'sla.assign', 'sla.resolve',
  // Governance
  'tenant.read', 'tenant.write', 'user.permission.grant',
];

// Default role → permission map. Inheritance is by-array-merge, not
// prototype chain, so it's easy to inspect + audit.
const DEFAULT_PERMISSIONS_BY_ROLE = {
  observer: [
    'dashboard.view', 'pursuit.view', 'opportunity.view',
    'compliance.view', 'sla.view', 'audit.view', 'lineage.view',
    'governance.view',
  ],
  reviewer: [
    'dashboard.view', 'pursuit.view', 'opportunity.view',
    'compliance.view', 'sla.view', 'audit.view', 'lineage.view',
    'governance.view',
    'approval.acknowledge', 'sla.acknowledge',
    'artifact.download',
  ],
  proposal_writer: [
    'dashboard.view', 'pursuit.view', 'opportunity.view',
    'compliance.view', 'compliance.edit', 'sla.view', 'sla.acknowledge',
    'audit.view', 'lineage.view', 'governance.view',
    'draft.generate', 'draft.regenerate',
    'artifact.upload', 'artifact.download',
    'approval.acknowledge',
  ],
  capture_manager: [
    'dashboard.view', 'pursuit.view', 'pursuit.activate', 'pursuit.deactivate',
    'pursuit.edit', 'opportunity.view',
    'compliance.view', 'compliance.edit', 'compliance.augment_llm',
    'sla.view', 'sla.acknowledge', 'sla.assign', 'sla.resolve',
    'audit.view', 'lineage.view', 'governance.view',
    'draft.generate', 'draft.regenerate',
    'artifact.upload', 'artifact.download', 'artifact.delete',
    'storage.signed_url',
    'approval.acknowledge', 'approval.approve', 'approval.reject',
    'queue.cancel', 'queue.enqueue',
  ],
  org_admin: [
    ...new Set([
      'dashboard.view', 'pursuit.view', 'pursuit.activate', 'pursuit.deactivate',
      'pursuit.edit', 'opportunity.view',
      'compliance.view', 'compliance.edit', 'compliance.augment_llm',
      'sla.view', 'sla.acknowledge', 'sla.assign', 'sla.resolve',
      'audit.view', 'lineage.view', 'governance.view',
      'draft.generate', 'draft.regenerate',
      'artifact.upload', 'artifact.download', 'artifact.delete',
      'storage.delete', 'storage.signed_url',
      'approval.acknowledge', 'approval.approve', 'approval.reject',
      'queue.cancel', 'queue.enqueue', 'queue.drain',
      'tenant.read', 'tenant.write', 'user.permission.grant',
    ]),
  ],
  super_admin: PERMISSIONS.slice(),
};

function knownRole(role) {
  return ROLE_NAMES.includes(role);
}

function levelOf(role) {
  return ROLE_LEVELS[role] != null ? ROLE_LEVELS[role] : -1;
}

// Map the legacy ROLES.ADMIN claim onto Phase 11 super_admin so existing
// admin-gated routes keep working without changes.
function normalizeLegacyRole(legacyRole) {
  if (!legacyRole) return 'observer';
  if (legacyRole === 'admin') return 'super_admin';
  if (knownRole(legacyRole)) return legacyRole;
  return 'observer';
}

// Deterministic permission check. Pure function over an inputs object.
function isAllowed({ role, permissions, permission }) {
  const normalized = normalizeLegacyRole(role);
  if (!knownRole(normalized)) return false;
  const granted = Array.isArray(permissions) ? permissions
    : DEFAULT_PERMISSIONS_BY_ROLE[normalized] || [];
  return granted.includes(permission);
}

// Live check that consults OperatorPermission overrides + the role's default.
async function checkPermission({ userId, role, permission }) {
  // 1) Check for any explicit per-user override.
  if (userId != null) {
    try {
      const override = await OperatorPermission.findOne({
        where: { userId: Number(userId), revokedAt: null },
        order: [['grantedAt', 'DESC']],
      });
      if (override && override.permissions && override.permissions[permission] !== undefined) {
        return Boolean(override.permissions[permission]);
      }
      if (override && override.roleName) {
        return isAllowed({ role: override.roleName, permission });
      }
    } catch (e) {
      logger.warn('rbac: override lookup failed', { error: e.message });
    }
  }
  // 2) Fall back to the legacy role on req.user.role.
  return isAllowed({ role, permission });
}

// Express middleware. Use *after* verifyToken.
function requirePermission(permission) {
  async function rbacGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Auth required' } });
    }
    const ok = await checkPermission({
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      permission,
    });
    if (!ok) {
      return res.status(403).json({
        error: { message: `Forbidden: permission "${permission}" required` },
      });
    }
    next();
  }
  // Stamp the permission name so the rbacCoverage analyzer can inspect it.
  rbacGuard._permission = permission;
  return rbacGuard;
}

// One-call read of a user's effective permission set + role.
async function describePermissions(userId, fallbackRole) {
  let role = normalizeLegacyRole(fallbackRole);
  let overridePerms = null;
  if (userId != null) {
    const override = await OperatorPermission.findOne({
      where: { userId: Number(userId), revokedAt: null },
      order: [['grantedAt', 'DESC']],
    });
    if (override) {
      role = override.roleName;
      if (override.permissions && Object.keys(override.permissions).length > 0) {
        overridePerms = override.permissions;
      }
    }
  }
  const base = DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE.observer;
  let effective = base.slice();
  if (overridePerms) {
    for (const [k, v] of Object.entries(overridePerms)) {
      if (v && !effective.includes(k)) effective.push(k);
      if (!v) effective = effective.filter((p) => p !== k);
    }
  }
  return { role, role_level: levelOf(role), permissions: effective };
}

// Grant a role + optional permission overlay to a user.
async function grantRole(userId, { roleName, permissions = {}, grantedBy, organizationId }) {
  if (!knownRole(roleName)) {
    const err = new Error(`Unknown role: ${roleName}`); err.code = 'BAD_INPUT'; throw err;
  }
  // Revoke any prior active grants for this user — append-only history.
  await OperatorPermission.update(
    { revokedAt: new Date() },
    { where: { userId: Number(userId), revokedAt: null } },
  );
  return OperatorPermission.create({
    userId: Number(userId), roleName, permissions,
    grantedBy: grantedBy || null,
    organizationId: organizationId == null ? null : Number(organizationId),
  });
}

async function revokeAll(userId, { revokedBy } = {}) {
  await OperatorPermission.update(
    { revokedAt: new Date() },
    { where: { userId: Number(userId), revokedAt: null } },
  );
  return { user_id: Number(userId), revoked_by: revokedBy || null };
}

async function listGrants({ userId = null, organizationId = null, activeOnly = true } = {}) {
  const where = {};
  if (userId != null) where.userId = Number(userId);
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (activeOnly) where.revokedAt = null;
  const rows = await OperatorPermission.findAll({
    where, order: [['grantedAt', 'DESC']], limit: 500,
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  ROLE_NAMES, ROLE_LEVELS, PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE,
  knownRole, levelOf, normalizeLegacyRole,
  isAllowed, checkPermission, requirePermission, describePermissions,
  grantRole, revokeAll, listGrants,
};
