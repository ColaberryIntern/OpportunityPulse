// v9.10: scheduler for the Source Health Auto-Triage Agent.
//
// Default: 0 7 * * *  (07:00 UTC daily — one hour after the master
// ingestion cron at 06:00 UTC, so by the time we run, every source has
// had its scheduled chance to land fresh data).
//
// Both flags must be true for the cron to fire:
//   OIED_SOURCE_HEALTH_AGENT_ENABLED=true   master kill switch
//   OIED_SOURCE_HEALTH_AGENT_TO=...          recipient (or fall back to OIED_BRIEFING_TO)
//
// Override schedule via OIED_SOURCE_HEALTH_AGENT_CRON.

const cron = require('node-cron');
const logger = require('../logging/logger');
const agent = require('./sourceHealthAgent.service');

let task = null;

function isEnabled() {
  return String(process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED || '').toLowerCase() === 'true';
}

function startSourceHealthAgentScheduler() {
  if (!isEnabled()) {
    logger.info('Source Health Agent scheduler not started (OIED_SOURCE_HEALTH_AGENT_ENABLED is off)');
    return null;
  }
  const expr = process.env.OIED_SOURCE_HEALTH_AGENT_CRON || '0 7 * * *';
  if (!cron.validate(expr)) {
    logger.error('Invalid Source Health Agent cron', { cron: expr });
    return null;
  }
  task = cron.schedule(expr, async () => {
    if (!isEnabled()) {
      logger.info('Source Health Agent cron skipped (flag flipped off mid-run)');
      return;
    }
    try {
      logger.info('Source Health Agent cron firing');
      const out = await agent.runAndEmail();
      logger.info('Source Health Agent cron complete', {
        recovered: out.report.recovered.length,
        still_failing: out.report.still_failing.length,
        zero_yield: out.report.zero_yield.length,
        email_sent: !!out.email.sent,
      });
    } catch (e) {
      logger.error('Source Health Agent cron threw', { error: e.message });
    }
  });
  logger.info('Source Health Agent scheduler started', { cron: expr });
  return task;
}

function stopSourceHealthAgentScheduler() {
  if (task) { task.stop(); task = null; }
}

module.exports = { startSourceHealthAgentScheduler, stopSourceHealthAgentScheduler };
