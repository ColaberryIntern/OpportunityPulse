const cron = require('node-cron');
const logger = require('../logging/logger');
const { runAllEnabled } = require('./ingestion.service');
const { checkSourceHealth } = require('./sourceHealthMonitor');
const { isIngestionPaused } = require('./ingestionPause');

const DEFAULT_SCHEDULE = '0 6 * * *'; // 6:00 AM daily

/**
 * Start the ingestion scheduler.
 * Runs all enabled data source adapters on a cron schedule.
 *
 * @param {string} [schedule] - Cron expression (defaults to INGESTION_SCHEDULE env var or 6 AM daily).
 *
 * OFF SWITCH: set INGESTION_SCHEDULER_ENABLED=false and this returns null without
 * arming any cron. Previously there was no way to disable it — INGESTION_SCHEDULE
 * only CHANGED the expression, and unsetting it fell back to DEFAULT_SCHEDULE, so
 * the scheduler always armed. A release that needs a guaranteed write freeze
 * (migration, rollout) could not obtain one. Default remains enabled, so existing
 * production behaviour is unchanged unless the flag is explicitly 'false'.
 * @returns {import('node-cron').ScheduledTask} The scheduled task (for stopping in tests).
 */
function startScheduler(schedule) {
  // Explicit, validated off switch, shared with every other scheduler that
  // ingests (see ingestionPause.js). Only the exact string 'false' disables, so
  // a typo or an unset variable cannot silently stop ingestion.
  if (isIngestionPaused()) {
    logger.warn('Ingestion scheduler DISABLED by INGESTION_SCHEDULER_ENABLED=false — not started.', {
      event: 'ingestion_scheduler_disabled',
      scheduler: 'ingestion',
    });
    return null;
  }

  const cronExpression = schedule || process.env.INGESTION_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(cronExpression)) {
    logger.error(`Invalid cron expression: "${cronExpression}" — scheduler not started.`);
    return null;
  }

  const task = cron.schedule(cronExpression, async () => {
    logger.info('Scheduled ingestion starting...');
    try {
      const result = await runAllEnabled();
      logger.info('Scheduled ingestion complete.', {
        message: result.message,
        sources: result.results.length,
        results: result.results.map((r) => ({
          dataSource: r.dataSource,
          status: r.status,
          created: r.recordsCreated,
          updated: r.recordsUpdated,
        })),
      });
    } catch (error) {
      logger.error('Scheduled ingestion failed.', { error: error.message });
    }

    // Runs even when the ingestion pass above threw: a source dying is exactly
    // the case the monitor exists to surface. Never let it break the schedule.
    try {
      const health = await checkSourceHealth();
      if (health.alerted.length) {
        logger.warn('Ingestion failure alerts sent.', {
          event: 'ingestion_health_alerts',
          sources: health.alerted,
        });
      }
    } catch (error) {
      logger.error('Ingestion health check failed.', {
        event: 'ingestion_health_check_failed',
        error_class: error.name || 'Error',
        error: error.message,
      });
    }
  });

  logger.info(`Ingestion scheduler started: "${cronExpression}"`);
  return task;
}

module.exports = { startScheduler };
