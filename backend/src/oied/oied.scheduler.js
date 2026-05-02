// Cron for the OIED daily digest. Default OFF (env-gated) so the schema +
// code can land safely without sending stray emails. Flip OIED_DIGEST_ENABLED
// to true once OIED_DIGEST_TO is verified.

const cron = require('node-cron');
const logger = require('../logging/logger');
const { runDigest } = require('./digest.service');

let task = null;

function isEnabled() {
  return String(process.env.OIED_DIGEST_ENABLED || '').toLowerCase() === 'true';
}

function startOiedDigestScheduler() {
  if (!isEnabled()) {
    logger.info('OIED digest scheduler not started (OIED_DIGEST_ENABLED is off)');
    return null;
  }
  const expr = process.env.OIED_DIGEST_CRON || '0 8 * * *';
  if (!cron.validate(expr)) {
    logger.error('Invalid OIED digest cron', { cron: expr });
    return null;
  }
  task = cron.schedule(expr, async () => {
    if (!isEnabled()) {
      logger.info('OIED digest cron skipped (flag flipped off)');
      return;
    }
    try {
      const out = await runDigest();
      logger.info('OIED digest cron complete', out);
    } catch (e) {
      logger.error('OIED digest cron failed', { error: e.message });
    }
  });
  logger.info('OIED digest scheduler started', { cron: expr });
  return task;
}

function stopOiedDigestScheduler() {
  if (task) { task.stop(); task = null; }
}

module.exports = { startOiedDigestScheduler, stopOiedDigestScheduler };
