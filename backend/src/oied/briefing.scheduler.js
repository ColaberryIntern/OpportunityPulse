// Cron for the OIED daily briefing (replaces v1 digest scheduler).
// Default OFF (env-gated). Flip OIED_BRIEFING_ENABLED=true once
// OIED_BRIEFING_TO is verified.
//
//   OIED_BRIEFING_ENABLED=true to enable the cron.
//   OIED_BRIEFING_CRON='0 7 * * 1-5'  (default: weekdays 7am)
//   OIED_BRIEFING_TO=ali@colaberry.com (recipient)
//   OIED_BRIEFING_ORG_ID=1 (which tenant to brief)

const cron = require('node-cron');
const logger = require('../logging/logger');
const { deliverBriefing } = require('./briefing.service');

let task = null;

function isEnabled() {
  return String(process.env.OIED_BRIEFING_ENABLED || '').toLowerCase() === 'true';
}

function startBriefingScheduler() {
  if (!isEnabled()) {
    logger.info('OIED briefing scheduler not started (OIED_BRIEFING_ENABLED is off)');
    return null;
  }
  const expr = process.env.OIED_BRIEFING_CRON || '0 7 * * 1-5';
  if (!cron.validate(expr)) {
    logger.error('Invalid OIED briefing cron', { cron: expr });
    return null;
  }
  task = cron.schedule(expr, async () => {
    if (!isEnabled()) {
      logger.info('OIED briefing cron skipped (flag flipped off)');
      return;
    }
    try {
      const out = await deliverBriefing({
        organizationId: Number(process.env.OIED_BRIEFING_ORG_ID) || 1,
        to: process.env.OIED_BRIEFING_TO,
      });
      logger.info('OIED briefing cron complete', { sent: out.sent });
    } catch (e) {
      logger.error('OIED briefing cron failed', { error: e.message });
    }
  });
  logger.info('OIED briefing scheduler started', { cron: expr });
  return task;
}

function stopBriefingScheduler() {
  if (task) { task.stop(); task = null; }
}

module.exports = { startBriefingScheduler, stopBriefingScheduler };
