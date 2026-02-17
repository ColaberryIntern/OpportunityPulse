const cron = require('node-cron');
const logger = require('../logging/logger');
const { runAllEnabled } = require('./ingestion.service');

const DEFAULT_SCHEDULE = '0 6 * * *'; // 6:00 AM daily

/**
 * Start the ingestion scheduler.
 * Runs all enabled data source adapters on a cron schedule.
 *
 * @param {string} [schedule] - Cron expression (defaults to INGESTION_SCHEDULE env var or 6 AM daily).
 * @returns {import('node-cron').ScheduledTask} The scheduled task (for stopping in tests).
 */
function startScheduler(schedule) {
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
  });

  logger.info(`Ingestion scheduler started: "${cronExpression}"`);
  return task;
}

module.exports = { startScheduler };
