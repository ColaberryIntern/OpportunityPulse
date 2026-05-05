// Cron for the weekly summary email. Default OFF.
//
//   OIED_WEEKLY_SUMMARY_ENABLED=true to enable
//   OIED_WEEKLY_SUMMARY_CRON='0 17 * * 5'  (Friday 5pm)
//   OIED_WEEKLY_SUMMARY_TO=ali@colaberry.com
//   OIED_WEEKLY_SUMMARY_ORG_ID=1

const cron = require('node-cron');
const logger = require('../logging/logger');
const { deliverWeeklySummary } = require('./feedback.service');

let task = null;

function isEnabled() {
  return String(process.env.OIED_WEEKLY_SUMMARY_ENABLED || '').toLowerCase() === 'true';
}

function startWeeklySummaryScheduler() {
  if (!isEnabled()) {
    logger.info('OIED weekly summary scheduler not started (OIED_WEEKLY_SUMMARY_ENABLED is off)');
    return null;
  }
  const expr = process.env.OIED_WEEKLY_SUMMARY_CRON || '0 17 * * 5';
  if (!cron.validate(expr)) {
    logger.error('Invalid OIED weekly summary cron', { cron: expr });
    return null;
  }
  task = cron.schedule(expr, async () => {
    if (!isEnabled()) {
      logger.info('OIED weekly summary cron skipped (flag flipped off)');
      return;
    }
    try {
      const out = await deliverWeeklySummary({
        organizationId: Number(process.env.OIED_WEEKLY_SUMMARY_ORG_ID) || 1,
        to: process.env.OIED_WEEKLY_SUMMARY_TO,
      });
      logger.info('OIED weekly summary cron complete', { sent: out.sent });
    } catch (e) {
      logger.error('OIED weekly summary cron failed', { error: e.message });
    }
  });
  logger.info('OIED weekly summary scheduler started', { cron: expr });
  return task;
}

function stopWeeklySummaryScheduler() {
  if (task) { task.stop(); task = null; }
}

module.exports = { startWeeklySummaryScheduler, stopWeeklySummaryScheduler };
