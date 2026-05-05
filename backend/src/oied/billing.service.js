// SaaS Billing — usage tracking + plan-tier limits.
//
// Two responsibilities:
//   1. recordUsage(...) — append a row to usage_metrics every time a
//      billable action succeeds. Best-effort: a logging failure must
//      NEVER fail the underlying business action, so every call site
//      wraps in try/catch and we additionally swallow + log here.
//   2. checkPlanLimit(...) — read the current tier + monthly usage and
//      return { used, limit, remaining, exceeded }. Enforcement is
//      gated on OIED_BILLING_ENFORCE (default false), so v5 ships
//      collecting data while leaving every existing flow open.
//
// Plan limits are intentionally conservative on basic so the upgrade
// path is obvious; enterprise is unlimited (-1) for our own org.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { Organization, UsageMetric } = require('../models');

const PLAN_LIMITS = {
  basic: {
    proposals_generated:    50,
    strategies_generated:   10,
    blueprints_generated:   10,
    briefings_sent:         30,
    triggers_fired:          0,
  },
  pro: {
    proposals_generated:   500,
    strategies_generated:  100,
    blueprints_generated:  100,
    briefings_sent:        100,
    triggers_fired:       1000,
  },
  enterprise: {
    proposals_generated:    -1,
    strategies_generated:   -1,
    blueprints_generated:   -1,
    briefings_sent:         -1,
    triggers_fired:         -1,
  },
};

const VALID_METRICS = new Set(Object.keys(PLAN_LIMITS.basic));

class PlanLimitExceededError extends Error {
  constructor({ metric, used, limit, tier }) {
    super(`plan limit exceeded for ${metric}: ${used}/${limit} on ${tier}`);
    this.name = 'PlanLimitExceededError';
    this.statusCode = 402;
    this.metric = metric;
    this.used = used;
    this.limit = limit;
    this.tier = tier;
  }
}

function isEnforcing() {
  return String(process.env.OIED_BILLING_ENFORCE || '').toLowerCase() === 'true';
}

function getPlanLimits(tier) {
  return PLAN_LIMITS[tier] || PLAN_LIMITS.basic;
}

function startOfThisMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function recordUsage({ organizationId, metric, count = 1, metadata = {} }) {
  if (!metric) {
    logger.warn('billing.recordUsage: no metric supplied — skipping');
    return null;
  }
  try {
    const row = await UsageMetric.create({
      organizationId: organizationId || null,
      metricName: metric,
      count: Number(count) || 1,
      metadata: metadata || {},
    });
    return row.toJSON ? row.toJSON() : row;
  } catch (e) {
    // Instrumentation must not break the underlying flow.
    logger.warn('billing.recordUsage: failed to persist (continuing)', {
      metric, organizationId, error: e.message,
    });
    return null;
  }
}

async function getUsageThisMonth({ organizationId, metric, now = new Date() }) {
  if (!metric) return 0;
  const since = startOfThisMonth(now);
  try {
    const rows = await UsageMetric.findAll({
      where: {
        organizationId: organizationId || null,
        metricName: metric,
        createdAt: { [Op.gte]: since },
      },
      attributes: ['count'],
    });
    return rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
  } catch (e) {
    logger.warn('billing.getUsageThisMonth: query failed (returning 0)', {
      error: e.message,
    });
    return 0;
  }
}

async function getOrgTier(organizationId) {
  if (!organizationId) return 'basic';
  try {
    const org = await Organization.findByPk(organizationId, { attributes: ['planTier'] });
    return (org && org.planTier) || 'basic';
  } catch {
    return 'basic';
  }
}

// Returns:
//   { used, limit, remaining, exceeded, tier, enforcing, metric }
// limit = -1 means unlimited; remaining = Infinity in that case;
// exceeded only meaningful when limit > 0.
async function checkPlanLimit({ organizationId, metric, now = new Date() }) {
  const tier = await getOrgTier(organizationId);
  const limits = getPlanLimits(tier);
  const limit = limits[metric] != null ? limits[metric] : 0;
  const used = await getUsageThisMonth({ organizationId, metric, now });
  const exceeded = limit >= 0 && used >= limit;
  const remaining = limit < 0 ? Infinity : Math.max(0, limit - used);
  return {
    metric, tier, used, limit, remaining, exceeded,
    enforcing: isEnforcing(),
  };
}

// Pre-action gate: throws PlanLimitExceededError when (a) enforcement
// is on AND (b) the org is at or over its limit. Otherwise returns the
// same shape as checkPlanLimit so the caller can log the snapshot.
async function enforceOrThrow({ organizationId, metric, now = new Date() }) {
  const status = await checkPlanLimit({ organizationId, metric, now });
  if (status.enforcing && status.exceeded) {
    throw new PlanLimitExceededError({
      metric, used: status.used, limit: status.limit, tier: status.tier,
    });
  }
  return status;
}

async function getUsageSummary({ organizationId, now = new Date() }) {
  const tier = await getOrgTier(organizationId);
  const limits = getPlanLimits(tier);
  const out = { organization_id: organizationId, tier, period_start: startOfThisMonth(now), metrics: {} };
  for (const metric of VALID_METRICS) {
    // eslint-disable-next-line no-await-in-loop
    const used = await getUsageThisMonth({ organizationId, metric, now });
    const limit = limits[metric];
    out.metrics[metric] = {
      used,
      limit,
      remaining: limit < 0 ? null : Math.max(0, limit - used),
    };
  }
  return out;
}

async function changePlanTier({ organizationId, tier }) {
  if (!PLAN_LIMITS[tier]) {
    throw new Error(`unknown tier: ${tier} (valid: ${Object.keys(PLAN_LIMITS).join(', ')})`);
  }
  const org = await Organization.findByPk(organizationId);
  if (!org) throw new Error(`organization ${organizationId} not found`);
  org.planTier = tier;
  await org.save();
  logger.info('billing.changePlanTier', { organizationId, tier });
  return org.toJSON();
}

module.exports = {
  recordUsage,
  getUsageThisMonth,
  checkPlanLimit,
  enforceOrThrow,
  getOrgTier,
  getPlanLimits,
  getUsageSummary,
  changePlanTier,
  isEnforcing,
  PlanLimitExceededError,
  PLAN_LIMITS,
  VALID_METRICS,
};
