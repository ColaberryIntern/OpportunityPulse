// Deep Research Phase 12 — RBAC route coverage reporter.
//
// Inspects the Express deepResearch router's stack and reports how many
// routes use the legacy `checkPermissions(ROLES.ADMIN)` vs the new
// `requirePermission(...)` middleware. Output is a snapshot row in
// rbac_coverage so the Phase 12 governance integrity dashboard can show
// migration progress over time.

const { RbacCoverage } = require('../models');
const logger = require('../logging/logger');

// Returns the static analysis of the deepResearch router. Identifies routes
// by the middleware names attached to each layer. Soft-fails for any
// route whose middleware isn't named (anonymous arrow functions).
function analyzeRouter(router) {
  const result = {
    total: 0,
    legacy_admin: 0,
    requires_permission: 0,
    unprotected: 0,
    routes: [],
  };
  if (!router || !router.stack) return result;
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const path = layer.route.path;
    const methods = Object.keys(layer.route.methods || {}).join(',').toUpperCase();
    const stack = layer.route.stack || [];
    let hasVerifyToken = false;
    let hasCheckPermissions = false;
    let hasRequirePermission = false;
    let permName = null;
    for (const s of stack) {
      const name = s.name || (s.handle && s.handle.name) || '';
      if (name === 'verifyToken') hasVerifyToken = true;
      if (name === 'checkPermissions' || name.includes('checkPerm')) hasCheckPermissions = true;
      if (name === 'rbacGuard' || name.includes('rbac')) {
        hasRequirePermission = true;
        if (s.handle && s.handle._permission) permName = s.handle._permission;
      }
    }
    result.total += 1;
    let classification = 'unprotected';
    if (hasRequirePermission) {
      classification = 'requires_permission';
      result.requires_permission += 1;
    } else if (hasCheckPermissions) {
      classification = 'legacy_admin';
      result.legacy_admin += 1;
    } else if (!hasVerifyToken) {
      classification = 'unprotected';
      result.unprotected += 1;
    } else {
      // verifyToken but no RBAC — treat as legacy by default
      classification = 'legacy_admin';
      result.legacy_admin += 1;
    }
    result.routes.push({ methods, path, classification, perm: permName });
  }
  return result;
}

async function snapshotCoverage(router) {
  const analysis = analyzeRouter(router);
  const total = analysis.total;
  const covered = analysis.requires_permission;
  const coveragePct = total > 0 ? Math.round((covered / total) * 10000) / 100 : 0;
  try {
    return await RbacCoverage.create({
      totalRoutes: total,
      legacyAdminRoutes: analysis.legacy_admin,
      requiresPermissionRoutes: covered,
      unprotectedRoutes: analysis.unprotected,
      coveragePct,
      details: { routes: analysis.routes.slice(0, 500) },
    });
  } catch (e) {
    logger.warn('rbacCoverage.snapshot failed', { error: e.message });
    return null;
  }
}

async function latestSnapshot() {
  const row = await RbacCoverage.findOne({
    order: [['snapshot_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

module.exports = {
  analyzeRouter, snapshotCoverage, latestSnapshot,
};
