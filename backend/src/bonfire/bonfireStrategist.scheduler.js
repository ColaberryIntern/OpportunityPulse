// Cron scheduler for the Strategic Curation Agent.
// Default: 0 8 * * 1,3,5  (08:00 Mon/Wed/Fri — one hour after the scraper).
//
// Both flags must be true for the cron to fire:
//   BONFIRE_ENGINE_ENABLED          (master engine flag)
//   BONFIRE_STRATEGIST_CRON_ENABLED (this scheduler's own kill switch)

const cron = require('node-cron');
const logger = require('../logging/logger');
const { runStrategist } = require('./bonfireStrategist.service');
const { syncStrategicBonfireToOpportunities } = require('./bonfireStrategicSync.service');

let task = null;

function isEnabled() {
  const engine = String(process.env.BONFIRE_ENGINE_ENABLED || '').toLowerCase() === 'true';
  const cronOn = String(process.env.BONFIRE_STRATEGIST_CRON_ENABLED || '').toLowerCase() === 'true';
  return engine && cronOn;
}

function startBonfireStrategistScheduler() {
  if (!isEnabled()) {
    logger.info('Bonfire strategist scheduler not started (flags off)');
    return null;
  }
  const expr = process.env.BONFIRE_STRATEGIST_CRON || '0 8 * * 1,3,5';
  if (!cron.validate(expr)) {
    logger.error('Invalid Bonfire strategist cron expression', { cron: expr });
    return null;
  }

  task = cron.schedule(expr, async () => {
    if (!isEnabled()) {
      logger.info('Bonfire strategist cron skipped (flag flipped off mid-run)');
      return;
    }
    try {
      logger.info('Strategist cron firing');
      const out = await runStrategist();
      logger.info('Strategist cron complete', out);
      // Mirror freshly-generated strategic rows into the unified
      // Opportunity table so they appear in My Opportunities, the
      // OIED dashboard, and recommendations alongside individual
      // Bonfire opps. Best-effort: a sync failure does not roll back
      // the strategist run.
      try {
        const syncOut = await syncStrategicBonfireToOpportunities();
        logger.info('Strategic Bonfire → Opportunity sync complete', syncOut);
      } catch (se) {
        logger.error('Strategic Bonfire sync threw', { error: se.message });
      }
    } catch (e) {
      logger.error('Strategist cron threw', { error: e.message });
    }
  });
  logger.info('Bonfire strategist scheduler started', { cron: expr });
  return task;
}

function stopBonfireStrategistScheduler() {
  if (task) { task.stop(); task = null; }
}

module.exports = { startBonfireStrategistScheduler, stopBonfireStrategistScheduler };
