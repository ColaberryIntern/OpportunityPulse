// Auto-Execution Trigger Engine.
//
// Declarative rules evaluated against a tenant's My Opps + Bundles.
// Each match either:
//   - dry_run: logs a row with status='dry_run', does not call any
//     generator (cheap, observable, the default first-week mode);
//   - success: invokes the generator (proposal/strategy), logs result;
//   - skipped: cooldown active, daily cap hit, or pre-conditions unmet.
//
// Safety belts:
//   - Default OFF in prod (scheduler reads OIED_AUTO_TRIGGERS_ENABLED).
//   - Per-rule cooldown queried from trigger_logs.success rows.
//   - Per-run cap on success rows (env: OIED_AUTO_TRIGGERS_MAX_*).
//   - Org-scoped: only fires for the requested organizationId.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { Bundle, TriggerLog } = require('../models');
const myOppsSvc = require('./myOpportunities.service');
const profileSvc = require('./profile.service');
const actions = require('./actionGenerator.service');
const bundler = require('./opportunityBundler.service');
const billing = require('./billing.service');

// Rule definitions. Adding/removing rules here is the entire surface
// for changing trigger behavior — keep them obviously-readable.
const RULES = [
  {
    name: 'auto_proposal_act_now',
    targets: 'opportunity',
    when: ({ opp, effort }) =>
      opp.bucket === 'act_now'
      && (effort.effort_score || 100) < 30
      && Number(opp.value || 0) > 5000,
    action: 'generate_proposal',
    cooldown_hours: 168, // 7 days
  },
  {
    name: 'auto_strategy_high_value_bundle',
    targets: 'bundle',
    when: ({ bundle }) => Number(bundle.estimatedTotalValue || 0) > 10_000_000,
    action: 'generate_strategy',
    cooldown_hours: 336, // 14 days
  },
];

const DEFAULT_MAX_PROPOSALS = 10;
const DEFAULT_MAX_STRATEGIES = 3;

function envInt(key, fallback) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

async function isOnCooldown({ ruleName, targetType, targetId, cooldownHours, now }) {
  const since = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000);
  const recent = await TriggerLog.findOne({
    where: {
      ruleName, targetType, targetId,
      status: 'success',
      createdAt: { [Op.gte]: since },
    },
  });
  return !!recent;
}

async function logTriggerResult({
  organizationId, rule, target, status, reason = null, outputId = null,
}) {
  return TriggerLog.create({
    organizationId,
    ruleName: rule.name,
    targetType: rule.targets,
    targetId: target.id,
    action: rule.action,
    status,
    reason,
    outputId,
  });
}

// Pure: classify whether a rule matches a target. Used by tests + the
// runtime alike. Lifted so tests can verify without orchestration.
function matchOpportunity(rule, opp, effort) {
  if (rule.targets !== 'opportunity') return false;
  return !!rule.when({ opp, effort });
}
function matchBundle(rule, bundle) {
  if (rule.targets !== 'bundle') return false;
  return !!rule.when({ bundle });
}

async function runTriggers({
  organizationId,
  userId = null,
  dryRun = false,
  now = new Date(),
  maxProposals = envInt('OIED_AUTO_TRIGGERS_MAX_PROPOSALS_PER_RUN', DEFAULT_MAX_PROPOSALS),
  maxStrategies = envInt('OIED_AUTO_TRIGGERS_MAX_STRATEGIES_PER_RUN', DEFAULT_MAX_STRATEGIES),
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  const summary = {
    organization_id: orgId,
    dry_run: dryRun,
    fired: 0,
    skipped: 0,
    failed: 0,
    dry_run_count: 0,
    rule_counts: {},
    logs: [],
  };
  const counters = { generate_proposal: 0, generate_strategy: 0 };
  const actionCaps = { generate_proposal: maxProposals, generate_strategy: maxStrategies };

  // --- Opportunity-targeting rules ---
  const { rows: opps } = await myOppsSvc.listMyOpportunities({
    userId, organizationId: orgId, limit: 100, offset: 0,
  });

  for (const opp of opps) {
    const effort = opp.effortEstimate || { effort_score: 100 };
    for (const rule of RULES) {
      if (!matchOpportunity(rule, opp, effort)) continue;

      // Cap reached?
      if (counters[rule.action] >= actionCaps[rule.action]) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: opp,
          status: 'skipped', reason: 'daily_cap',
        });
        summary.skipped += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      // Cooldown?
      const blocked = await isOnCooldown({
        ruleName: rule.name, targetType: rule.targets, targetId: opp.id,
        cooldownHours: rule.cooldown_hours, now,
      });
      if (blocked) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: opp,
          status: 'skipped', reason: 'cooldown',
        });
        summary.skipped += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      // Dry-run?
      if (dryRun) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: opp,
          status: 'dry_run', reason: 'matched_rule',
        });
        summary.dry_run_count += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      // Fire.
      try {
        const out = await actions.generateOutput({
          opportunityId: opp.id,
          type: 'proposal',
          generatedBy: userId,
          userId,
        });
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: opp,
          status: 'success', reason: 'matched_rule', outputId: out.id,
        });
        counters[rule.action] += 1;
        summary.fired += 1;
        summary.rule_counts[rule.name] = (summary.rule_counts[rule.name] || 0) + 1;
        summary.logs.push(log.toJSON());
        // v5: record billable usage per success.
        await billing.recordUsage({
          organizationId: orgId,
          metric: 'triggers_fired',
          metadata: { rule: rule.name, target_type: rule.targets, target_id: log.targetId },
        }).catch(() => null);
      } catch (e) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: opp,
          status: 'failed', reason: e.message,
        });
        summary.failed += 1;
        summary.logs.push(log.toJSON());
        logger.warn('triggerEngine: opportunity rule failed', {
          rule: rule.name, opportunityId: opp.id, error: e.message,
        });
      }
    }
  }

  // --- Bundle-targeting rules ---
  const bundles = await Bundle.findAll({
    where: { organizationId: orgId },
    order: [['estimatedTotalValue', 'DESC']],
    limit: 200,
  });

  for (const bRow of bundles) {
    const bundle = bRow.toJSON ? bRow.toJSON() : bRow;
    for (const rule of RULES) {
      if (!matchBundle(rule, bundle)) continue;

      if (counters[rule.action] >= actionCaps[rule.action]) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: bundle,
          status: 'skipped', reason: 'daily_cap',
        });
        summary.skipped += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      // Bundle skip-if-cached: when a strategy already exists with the
      // current member set, skip rather than waste a trigger slot.
      if (rule.action === 'generate_strategy' && bundle.strategy && bundle.strategy.what_to_build) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: bundle,
          status: 'skipped', reason: 'strategy_already_cached',
        });
        summary.skipped += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      const blocked = await isOnCooldown({
        ruleName: rule.name, targetType: rule.targets, targetId: bundle.id,
        cooldownHours: rule.cooldown_hours, now,
      });
      if (blocked) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: bundle,
          status: 'skipped', reason: 'cooldown',
        });
        summary.skipped += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      if (dryRun) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: bundle,
          status: 'dry_run', reason: 'matched_rule',
        });
        summary.dry_run_count += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      try {
        const out = await bundler.generateBundleStrategy(bundle.id);
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: bundle,
          status: 'success', reason: out.cached ? 'cached' : 'matched_rule',
        });
        counters[rule.action] += 1;
        summary.fired += 1;
        summary.rule_counts[rule.name] = (summary.rule_counts[rule.name] || 0) + 1;
        summary.logs.push(log.toJSON());
        // v5: record billable usage per success.
        await billing.recordUsage({
          organizationId: orgId,
          metric: 'triggers_fired',
          metadata: { rule: rule.name, target_type: rule.targets, target_id: log.targetId },
        }).catch(() => null);
      } catch (e) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: bundle,
          status: 'failed', reason: e.message,
        });
        summary.failed += 1;
        summary.logs.push(log.toJSON());
        logger.warn('triggerEngine: bundle rule failed', {
          rule: rule.name, bundleId: bundle.id, error: e.message,
        });
      }
    }
  }

  logger.info('triggerEngine: run complete', {
    orgId, dryRun, fired: summary.fired, skipped: summary.skipped,
    failed: summary.failed, dry_run_count: summary.dry_run_count,
  });
  return summary;
}

async function listLogs({ organizationId, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (organizationId) where.organizationId = organizationId;
  const { rows, count } = await TriggerLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(limit) || 50, 500),
    offset: Number(offset) || 0,
  });
  return { rows: rows.map((r) => r.toJSON()), total: count };
}

module.exports = {
  runTriggers,
  listLogs,
  matchOpportunity,
  matchBundle,
  isOnCooldown,
  RULES,
  DEFAULT_MAX_PROPOSALS,
  DEFAULT_MAX_STRATEGIES,
};
