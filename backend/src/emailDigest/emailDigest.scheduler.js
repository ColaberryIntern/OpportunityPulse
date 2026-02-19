const cron = require('node-cron');
const logger = require('../logging/logger');

let schedulerStarted = false;

/**
 * Start the email digest scheduler.
 * Runs daily at 7 AM UTC to check and send due digests.
 * Idempotent — calling multiple times only starts once.
 */
function startDigestScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const schedule = process.env.DIGEST_SCHEDULE || '0 7 * * *';

  cron.schedule(schedule, async () => {
    logger.info('Scheduled: Email digest processing starting');
    try {
      const { processDigests } = require('./emailDigest.service');
      const result = await processDigests();
      logger.info('Scheduled: Email digest processing complete', result);
    } catch (error) {
      logger.error('Scheduled: Email digest processing failed', {
        error: error.message,
      });
    }
  });

  logger.info(`Email digest scheduler started: "${schedule}"`);
}

module.exports = { startDigestScheduler };
