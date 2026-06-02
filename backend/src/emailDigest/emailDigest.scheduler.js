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
      const svc = require('./emailDigest.service');
      const result = await svc.processDigests();
      logger.info('Scheduled: Email digest processing complete', result);

      // Self-heal heartbeat: if any daily user is STILL missing today's
      // digest after the normal pass (e.g. eligibility rule edge case,
      // transient SMTP failure earlier), retry them with force=true for
      // ONLY the users who missed. Prevents silent zero-send days.
      const missing = await svc.findMissingTodayUsers({ timezone });
      if (missing.length > 0) {
        logger.warn('Digest heartbeat: users missing today — force-sending', {
          count: missing.length,
          userIds: missing.map((m) => m.userId).filter(Boolean),
        });
        for (const pref of missing) {
          // eslint-disable-next-line no-await-in-loop
          await svc.processDigests({ forceSendForUserId: pref.userId });
        }
      } else {
        logger.info('Digest heartbeat: all daily users sent today.');
      }
    } catch (error) {
      logger.error('Scheduled: Email digest processing failed', {
        error: error.message, stack: error.stack,
      });
    }
  }, { timezone });

  logger.info(`Email digest scheduler started: "${schedule}" (${timezone})`);

  // Backup heartbeat: every hour from 6 AM to noon CT, scan for daily users
  // who haven't received today's digest and force-send. Catches: backend
  // crashed during the 6 AM run, SMTP failed at the moment the cron fired,
  // env vars not set when the primary cron tried, eligibility-rule edge
  // case, etc. Idempotent — once today's send is recorded, the next run
  // finds no missing users and does nothing.
  const heartbeatSchedule = process.env.DIGEST_HEARTBEAT_SCHEDULE || '0 7-12 * * *';
  cron.schedule(heartbeatSchedule, async () => {
    try {
      const svc = require('./emailDigest.service');
      const missing = await svc.findMissingTodayUsers({ timezone });
      if (missing.length === 0) return; // happy path — nothing to do
      logger.warn('Digest backup heartbeat: missing users detected', {
        count: missing.length,
        userIds: missing.map((m) => m.userId).filter(Boolean),
      });
      for (const pref of missing) {
        // eslint-disable-next-line no-await-in-loop
        await svc.processDigests({ forceSendForUserId: pref.userId });
      }
    } catch (error) {
      logger.error('Digest backup heartbeat failed', { error: error.message });
    }
  }, { timezone });
  logger.info(`Digest backup heartbeat started: "${heartbeatSchedule}" (${timezone})`);
}

module.exports = { startDigestScheduler };
