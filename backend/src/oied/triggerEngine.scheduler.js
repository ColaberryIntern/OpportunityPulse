// Cron for the auto-execution trigger engine. Default OFF.
//
//   OIED_AUTO_TRIGGERS_ENABLED=true to enable the cron.
//   OIED_AUTO_TRIGGERS_CRON='0 6 * * 1-5' (weekdays 6am, default)
//   OIED_AUTO_TRIGGERS_DRY_RUN=true to log only (no AI calls).
//   OIED_AUTO_TRIGGERS_MAX_PROPOSALS_PER_RUN=10 (per cap docs)
//   OIED_AUTO_TRIGGERS_MAX_STRATEGIES_PER_RUN=3
//   OIED_AUTO_TRIGGERS_ORG_ID=1 (which org to scope the run to)

const cron = require('node-cron');
const logger = require('../logging/logger');
const { runTriggers } = require('./triggerEngine.service');

let task = null;

function isEnabled() {
  return String(process.env.OIED_AUTO_TRIGGERS_ENABLED || '').toLowerCase() === 'true';
}
function isDryRun() {
  return String(process.env.OIED_AUTO_TRIGGERS_DRY_RUN || 'true').toLowerCase() !== 'false';
}

function startTriggerEngineScheduler() {
  if (!isEnabled()) {
    logger.info('OIED trigger engine scheduler not started (OIED_AUTO_TRIGGERS_ENABLED is off)');
    return null;
  }
  const expr = process.env.OIED_AUTO_TRIGGERS_CRON || '0 6 * * 1-5';
  if (!cron.validate(expr)) {
    logger.error('Invalid trigger engine cron', { cron: expr });
    return null;
  }
  task = cron.schedule(expr, async () => {
    if (!isEnabled()) {
      logger.info('OIED trigger engine cron skipped (flag flipped off)');
      return;
    }
    try {
      const out = await runTriggers({
        organizationId: Number(process.env.OIED_AUTO_TRIGGERS_ORG_ID) || 1,
        dryRun: isDryRun(),
      });
      logger.info('OIED trigger engine cron complete', {
        fired: out.fired, skipped: out.skipped, dry_run: out.dry_run_count,
        failed: out.failed,
      });
    } catch (e) {
      logger.error('OIED trigger engine cron failed', { error: e.message });
    }
  });
  logger.info('OIED trigger engine scheduler started', { cron: expr, dryRun: isDryRun() });
  return task;
}

function stopTriggerEngineScheduler() {
  if (task) { task.stop(); task = null; }
}

module.exports = { startTriggerEngineScheduler, stopTriggerEngineScheduler };
