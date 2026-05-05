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
const {
  Bundle, TriggerLog, OpportunityOutput, OpportunityEvent,
} = require('../models');
const myOppsSvc = require('./myOpportunities.service');
const profileSvc = require('./profile.service');
const actions = require('./actionGenerator.service');
const bundler = require('./opportunityBundler.service');
const billing = require('./billing.service');

// v6 confidence thresholds for the auto_submit rule. Conservative on
// purpose — these are auto-shipped proposals, no human review.
const AUTO_SUBMIT_WIN_PROB_MIN     = 0.6;
const AUTO_SUBMIT_EFFORT_MAX       = 35;
const AUTO_SUBMIT_PERSONALIZATION_MIN = 60;

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
  {
    // v6: auto-submit when an existing draft passes ALL three thresholds.
    // Only fires when OIED_AUTO_SUBMIT_ENABLED=true (the runner removes
    // this rule from evaluation otherwise).
    name: 'auto_submit_high_confidence',
    targets: 'opportunity',
    requires_draft: true,
    when: ({ effort, latestDraft }) =>
      !!latestDraft
      && (latestDraft.win_probability || 0) > AUTO_SUBMIT_WIN_PROB_MIN
      && (effort.effort_score || 100) < AUTO_SUBMIT_EFFORT_MAX
      && (latestDraft.personalization_score || 0) > AUTO_SUBMIT_PERSONALIZATION_MIN,
    action: 'auto_submit',
    cooldown_hours: 168,
  },
];

const DEFAULT_MAX_PROPOSALS = 10;
const DEFAULT_MAX_STRATEGIES = 3;
const DEFAULT_MAX_AUTO_SUBMITS = 3;

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
  organizationId, rule, target, status,
  reason = null, outputId = null, confidenceScore = null,
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
    confidenceScore,
  });
}

// Pure: 0–1 confidence score from win_prob, effort, personalization.
// 0.5 weight on win_prob (calibrated against MAX_PROB=0.85), 0.25 on
// inverse-effort, 0.25 on personalization.
function computeConfidenceScore({ winProb, effortScore, personalization }) {
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const w = clamp((Number(winProb) || 0) / 0.85);
  const e = clamp(1 - (Number(effortScore) || 100) / 100);
  const p = clamp((Number(personalization) || 0) / 100);
  return Number((0.5 * w + 0.25 * e + 0.25 * p).toFixed(3));
}

function isAutoSubmitEnabled() {
  return String(process.env.OIED_AUTO_SUBMIT_ENABLED || '').toLowerCase() === 'true';
}

// Per-day cap on auto_submit successes. Counts trigger_logs rows where
// action='auto_submit', status='success', created_at >= start of UTC day.
async function autoSubmitsToday({ organizationId, now }) {
  const startOfDay = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  ));
  try {
    const rows = await TriggerLog.findAll({
      where: {
        action: 'auto_submit',
        status: 'success',
        organizationId: organizationId || null,
        createdAt: { [Op.gte]: startOfDay },
      },
      attributes: ['id'],
    });
    return rows.length;
  } catch (e) {
    logger.warn('autoSubmitsToday: count failed (returning 0)', { error: e.message });
    return 0;
  }
}

// Pull the most-recent draft output for a given opp + look up the
// most-recent win-probability snapshot. Returned shape feeds the
// auto_submit rule's `latestDraft` parameter and the
// computeConfidenceScore call.
async function loadLatestDraft({ opportunityId, winProbability }) {
  try {
    const out = await OpportunityOutput.findOne({
      where: { opportunityId, status: 'draft' },
      order: [['createdAt', 'DESC']],
    });
    if (!out) return null;
    const meta = out.metadata || {};
    return {
      id: out.id,
      type: out.type,
      personalization_score: Number(meta.personalization_score) || 0,
      win_probability: Number(winProbability) || 0,
      created_at: out.createdAt,
    };
  } catch (e) {
    logger.warn('loadLatestDraft: query failed (returning null)', { error: e.message });
    return null;
  }
}

// Pure: assemble the active rule list, optionally including the v6
// auto_submit rule based on the env flag. Lifted for testability —
// the test sets OIED_AUTO_SUBMIT_ENABLED before calling this.
function getActiveRules() {
  if (isAutoSubmitEnabled()) return RULES;
  return RULES.filter((r) => r.name !== 'auto_submit_high_confidence');
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
  maxAutoSubmits = envInt('OIED_AUTO_SUBMIT_MAX_PER_DAY', DEFAULT_MAX_AUTO_SUBMITS),
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
  const counters = { generate_proposal: 0, generate_strategy: 0, auto_submit: 0 };
  // auto_submit cap is enforced PER DAY (counts across all runs in the day),
  // not just per run. Pre-load the day's count.
  const todayAutoSubmitCount = await autoSubmitsToday({ organizationId: orgId, now });
  counters.auto_submit = todayAutoSubmitCount;
  const actionCaps = {
    generate_proposal: maxProposals,
    generate_strategy: maxStrategies,
    auto_submit: maxAutoSubmits,
  };

  const activeRules = getActiveRules();

  // --- Opportunity-targeting rules ---
  const { rows: opps } = await myOppsSvc.listMyOpportunities({
    userId, organizationId: orgId, limit: 100, offset: 0,
  });

  for (const opp of opps) {
    const effort = opp.effortEstimate || { effort_score: 100 };
    // v6: load latestDraft once per opp so the auto_submit rule can
    // evaluate without per-rule queries. Skipped when no opportunity-
    // targeting rule needs it.
    const needsDraft = activeRules.some(
      (r) => r.targets === 'opportunity' && r.requires_draft,
    );
    const latestDraft = needsDraft
      ? await loadLatestDraft({
          opportunityId: opp.id,
          winProbability: opp.winProbability != null ? opp.winProbability : opp.win_probability,
        })
      : null;
    for (const rule of activeRules) {
      // matchOpportunity gets latestDraft via the rule when needed.
      if (rule.targets !== 'opportunity') continue;
      const matched = rule.when
        ? rule.when({ opp, effort, latestDraft })
        : false;
      if (!matched) continue;

      // v6: confidence_score for auto_submit rule fires (logged on every
      // outcome — dry_run / success / skipped — for full audit trail).
      const confidence = rule.action === 'auto_submit' && latestDraft
        ? computeConfidenceScore({
            winProb: latestDraft.win_probability,
            effortScore: effort.effort_score,
            personalization: latestDraft.personalization_score,
          })
        : null;

      // Cap reached?
      if (counters[rule.action] >= actionCaps[rule.action]) {
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: opp,
          status: 'skipped', reason: 'daily_cap',
          confidenceScore: confidence,
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
          confidenceScore: confidence,
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
          confidenceScore: confidence,
        });
        summary.dry_run_count += 1;
        summary.logs.push(log.toJSON());
        continue;
      }

      // Fire.
      try {
        let outputId = null;
        if (rule.action === 'generate_proposal') {
          const out = await actions.generateOutput({
            opportunityId: opp.id,
            type: 'proposal',
            generatedBy: userId,
            userId,
          });
          outputId = out.id;
        } else if (rule.action === 'auto_submit' && latestDraft) {
          // Hard guardrail: never auto_submit unless the draft is still draft.
          const fresh = await OpportunityOutput.findByPk(latestDraft.id);
          if (!fresh || fresh.status !== 'draft') {
            const log = await logTriggerResult({
              organizationId: orgId, rule, target: opp,
              status: 'skipped', reason: 'draft_already_touched',
              confidenceScore: confidence,
            });
            summary.skipped += 1;
            summary.logs.push(log.toJSON());
            continue;
          }
          fresh.status = 'approved';
          fresh.reviewerId = userId || null;
          fresh.reviewedAt = now;
          fresh.reviewNotes = `Auto-submitted by triggerEngine (confidence=${confidence})`;
          await fresh.save();
          outputId = fresh.id;
          // Stamp a 'submitted' event so the velocity service can compute
          // time_to_submit from the auto-submitted row.
          await OpportunityEvent.create({
            opportunityId: opp.id,
            eventType: 'submitted',
            userId: userId || null,
            payload: {
              source: 'auto_submit',
              confidence_score: confidence,
              output_id: fresh.id,
            },
          }).catch((e) => {
            logger.warn('auto_submit: event record failed', { error: e.message });
          });
        }
        const log = await logTriggerResult({
          organizationId: orgId, rule, target: opp,
          status: 'success', reason: 'matched_rule', outputId,
          confidenceScore: confidence,
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
          confidenceScore: confidence,
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
    for (const rule of activeRules) {
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
  // v6
  computeConfidenceScore,
  isAutoSubmitEnabled,
  getActiveRules,
  loadLatestDraft,
  autoSubmitsToday,
  AUTO_SUBMIT_WIN_PROB_MIN,
  AUTO_SUBMIT_EFFORT_MAX,
  AUTO_SUBMIT_PERSONALIZATION_MIN,
  RULES,
  DEFAULT_MAX_PROPOSALS,
  DEFAULT_MAX_STRATEGIES,
  DEFAULT_MAX_AUTO_SUBMITS,
};
