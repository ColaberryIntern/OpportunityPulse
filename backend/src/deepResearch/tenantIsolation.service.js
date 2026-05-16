// Deep Research Phase 11 — multi-tenant isolation.
//
// Resolves the active organization_id from the authenticated user (looking
// it up on the User row when the JWT doesn't carry it), and exposes:
//   - resolveTenantForRequest(req) → orgId (or null when single-tenant mode)
//   - applyTenantScope(where, orgId) → mutates a Sequelize where-clause to
//     restrict to a given organization
//   - tenantMiddleware → attaches req.tenantId before any controller runs
//
// IMPORTANT: this is the single chokepoint for cross-tenant safety. Every
// org-scoped read/write must go through one of the helpers below. When
// orgId is null (e.g. the seeded default org, or a user with no org), the
// helper falls back to DEFAULT_ORG_ID so existing single-tenant deployments
// don't break.

const { User, TenantSettings } = require('../models');
const logger = require('../logging/logger');

const DEFAULT_ORG_ID = Number(process.env.DEEP_RESEARCH_DEFAULT_ORG_ID) || 1;
const STRICT_ISOLATION_ENV = 'DEEP_RESEARCH_STRICT_TENANT_ISOLATION';

function isStrict() {
  return process.env[STRICT_ISOLATION_ENV] === 'true';
}

// Resolve the org-id for the request. Prefers the JWT claim, falls back to
// a User lookup. Returns DEFAULT_ORG_ID when no value can be resolved.
async function resolveTenantForRequest(req) {
  if (req.tenantId) return req.tenantId;
  if (req.user) {
    if (req.user.organizationId) return Number(req.user.organizationId);
    if (req.user.userId || req.user.id) {
      try {
        const u = await User.findByPk(Number(req.user.userId || req.user.id));
        if (u && u.organizationId) return Number(u.organizationId);
      } catch (e) {
        logger.warn('tenantIsolation: User lookup failed', { error: e.message });
      }
    }
  }
  return DEFAULT_ORG_ID;
}

// Express middleware: stamps req.tenantId once per request. Cheap.
function tenantMiddleware(req, res, next) {
  resolveTenantForRequest(req)
    .then((orgId) => { req.tenantId = orgId; next(); })
    .catch((e) => {
      logger.warn('tenantIsolation: middleware failed', { error: e.message });
      req.tenantId = DEFAULT_ORG_ID;
      next();
    });
}

// Mutate-and-return a Sequelize where-clause to scope to one tenant.
// Pass null to opt out (super_admin reads only).
function applyTenantScope(where, orgId) {
  const w = where || {};
  if (orgId == null) return w;
  w.organizationId = Number(orgId);
  return w;
}

// Equivalent for snake_case raw-where filters.
function applyTenantScopeRaw(where, orgId) {
  const w = where || {};
  if (orgId == null) return w;
  w.organization_id = Number(orgId);
  return w;
}

// Verify a candidate row (must have organizationId) belongs to the
// requesting tenant. Returns the row if OK, throws TENANT_DENIED otherwise.
function assertOwnership(row, orgId, { allowMissing = false } = {}) {
  if (!row) {
    if (allowMissing) return null;
    const err = new Error('Not found'); err.code = 'NOT_FOUND'; throw err;
  }
  if (orgId == null) return row;
  const rowOrg = row.organizationId != null ? Number(row.organizationId) : null;
  if (rowOrg != null && rowOrg !== Number(orgId)) {
    if (isStrict()) {
      const err = new Error('Cross-tenant access denied'); err.code = 'TENANT_DENIED'; err.status = 403; throw err;
    }
    logger.warn('tenantIsolation: cross-tenant access (loose mode)', {
      row_org: rowOrg, request_org: orgId,
    });
  }
  return row;
}

// Load (or upsert) the TenantSettings row for an org. Stable defaults.
async function getOrCreateSettings(orgId) {
  const id = Number(orgId);
  let row = await TenantSettings.findOne({ where: { organizationId: id } });
  if (!row) {
    row = await TenantSettings.create({
      organizationId: id,
      governanceMode: 'standard',
      slaThresholds: {},
      approvalRequiredFor: [],
      featureFlags: {},
    });
  }
  return row;
}

async function updateSettings(orgId, patch = {}) {
  const row = await getOrCreateSettings(orgId);
  const allowed = ['displayName', 'governanceMode', 'slaThresholds',
    'approvalRequiredFor', 'storageProvider', 'featureFlags', 'retentionDays'];
  for (const k of allowed) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  await row.save();
  return row;
}

// Audit-friendly summary for the dashboard.
async function summarizeTenant(orgId) {
  const settings = await getOrCreateSettings(orgId);
  return {
    organization_id: Number(orgId),
    display_name: settings.displayName || `Organization ${orgId}`,
    governance_mode: settings.governanceMode,
    storage_provider: settings.storageProvider || 'url_only',
    strict_isolation: isStrict(),
    approval_required_for: settings.approvalRequiredFor || [],
    sla_threshold_overrides: settings.slaThresholds || {},
    feature_flags: settings.featureFlags || {},
    retention_days: settings.retentionDays,
  };
}

module.exports = {
  DEFAULT_ORG_ID, STRICT_ISOLATION_ENV,
  isStrict, resolveTenantForRequest, tenantMiddleware,
  applyTenantScope, applyTenantScopeRaw, assertOwnership,
  getOrCreateSettings, updateSettings, summarizeTenant,
};
