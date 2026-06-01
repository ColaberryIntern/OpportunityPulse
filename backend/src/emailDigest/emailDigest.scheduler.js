const cron = require('node-cron');
const logger = require('../logging/logger');

let schedulerStarted = false;

/**
 * Start the email digest scheduler.
 * Runs daily at 6 AM Central time (America/Chicago — handles DST so it stays
 * "6 AM as Ali sees it" year-round, whether CST or CDT). Both the schedule
 * expression and the timezone are env-overridable for ops flexibility.
 * Idempotent — calling multiple times only starts once.
 */
function startDigestScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const schedule = process.env.DIGEST_SCHEDULE || '0 6 * * *';
  const timezone = process.env.DIGEST_TIMEZONE || 'America/Chicago';

  cron.schedule(schedule, async () => {
    logger.info('Scheduled: Email digest processing starting', { schedule, timezone });
    try {
      const { processDigests } = require('./emailDigest.service');
      const result = await processDigests();
      logger.info('Scheduled: Email digest processing complete', result);
    } catch (error) {
      logger.error('Scheduled: Email digest processing failed', {
        error: error.message,
      });
    }
  }, { timezone });

  logger.info(`Email digest scheduler started: "${schedule}" (${timezone})`);
}

module.exports = { startDigestScheduler };
