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
const { isIngestionPaused } = require('../ingestion/ingestionPause');

let task = null;

function isEnabled() {
  return String(process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED || '').toLowerCase() === 'true';
}

function startSourceHealthAgentScheduler() {
  // This agent TRIGGERS INGESTION. sourceHealthAgent.service calls
  // ingestionSvc.runIngestion for each source it probes, so it must honour the
  // same pause as every other ingesting scheduler.
  //
  // It did not, and the gap was not theoretical: on 2026-10-01 it ran 8
  // ingestions at 07:00-07:01Z and wrote rows while INGESTION_SCHEDULER_ENABLED
  // was false and the other three schedulers had reported themselves disabled.
  // "All three pause controls false" did not mean ingestion was held.
  //
  // Health-by-ingestion is meaningless while ingestion is paused, so the pause
  // wins over this agent's own flag.
  if (isIngestionPaused()) {
    logger.warn('Source Health Agent DISABLED by INGESTION_SCHEDULER_ENABLED=false — it triggers ingestion.', {
      event: 'ingestion_scheduler_disabled',
      scheduler: 'source_health_agent',
      reason: 'paused',
    });
    return null;
  }

  if (!isEnabled()) {
    // Emitted with the same event/scheduler pair as the paused path so release
    // verification has uniform evidence however the agent came to be off.
    logger.info('Source Health Agent scheduler not started (OIED_SOURCE_HEALTH_AGENT_ENABLED is off)', {
      event: 'ingestion_scheduler_disabled',
      scheduler: 'source_health_agent',
      reason: 'flag_off',
    });
    return null;
  }
  const expr = process.env.OIED_SOURCE_HEALTH_AGENT_CRON || '0 7 * * *';
  if (!cron.validate(expr)) {
    logger.error('Invalid Source Health Agent cron', { cron: expr });
    return null;
  }
  task = cron.schedule(expr, async () => {
    // Re-checked on every fire, mirroring the existing flag check.
    if (isIngestionPaused()) {
      logger.warn('Source Health Agent cron skipped — ingestion is paused', {
        event: 'ingestion_scheduler_skipped',
        scheduler: 'source_health_agent',
      });
      return;
    }
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
