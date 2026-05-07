// OIED v9.7 — Keyword trend compute scheduler.
// Default: 15 5,17 * * *  (05:15 + 17:15 UTC, twice daily).
//
// Both flags must be true for the cron to fire:
//   OIED_KEYWORD_TRENDS_ENABLED  (master kill switch)
//
// Override schedule via OIED_KEYWORD_TRENDS_CRON.

const cron = require('node-cron');
const logger = require('../logging/logger');
const { runKeywordTrendCompute } = require('./keywordTrendCompute.service');

let task = null;

function isEnabled() {
  return String(process.env.OIED_KEYWORD_TRENDS_ENABLED || '').toLowerCase() === 'true';
}

function startKeywordTrendScheduler() {
  if (!isEnabled()) {
    logger.info('OIED keyword trend scheduler not started (OIED_KEYWORD_TRENDS_ENABLED is off)');
    return null;
  }
  const expr = process.env.OIED_KEYWORD_TRENDS_CRON || '15 5,17 * * *';
  if (!cron.validate(expr)) {
    logger.error('Invalid OIED keyword trend cron expression', { cron: expr });
    return null;
  }

  task = cron.schedule(expr, async () => {
    if (!isEnabled()) {
      logger.info('OIED keyword trend cron skipped (flag flipped off mid-run)');
      return;
    }
    try {
      logger.info('Keyword trend cron firing');
      const out = await runKeywordTrendCompute();
      logger.info('Keyword trend cron complete', out);
    } catch (e) {
      logger.error('Keyword trend cron threw', { error: e.message });
    }
  });
  logger.info('OIED keyword trend scheduler started', { cron: expr });
  return task;
}

function stopKeywordTrendScheduler() {
  if (task) { task.stop(); task = null; }
}

module.exports = { startKeywordTrendScheduler, stopKeywordTrendScheduler };
