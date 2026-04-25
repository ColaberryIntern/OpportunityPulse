// Cron scheduler for the Bonfire scraper. Mirrors the existing ingestion
// scheduler pattern. Stays OFF unless BOTH the master scraper flag AND the
// cron-specific flag are true. The cron callback also re-checks the flags
// on every fire — flipping the env var off instantly disables runs without
// requiring a restart.

const cron = require('node-cron');
const logger = require('../logging/logger');
const { getScraperConfig } = require('./scraper/config');
const { runScrape } = require('./scraper/runner');

let task = null;

function startBonfireScraperScheduler() {
  const cfg = getScraperConfig();
  if (!cfg.enabled) {
    logger.info('Bonfire scraper disabled — scheduler not started');
    return null;
  }
  if (!cfg.cronEnabled) {
    logger.info('Bonfire scraper cron disabled — scheduler not started (manual /run only)');
    return null;
  }
  if (!cron.validate(cfg.cron)) {
    logger.error('Invalid Bonfire scraper cron expression', { cron: cfg.cron });
    return null;
  }

  task = cron.schedule(cfg.cron, async () => {
    // Re-read each fire — env var toggles take effect without restart.
    const live = getScraperConfig();
    if (!live.enabled || !live.cronEnabled) {
      logger.info('Bonfire scraper cron skipped — flag flipped off');
      return;
    }
    try {
      logger.info('Scheduled Bonfire scrape starting');
      const summary = await runScrape({ phase: live.phase });
      logger.info('Scheduled Bonfire scrape complete', {
        phase: summary.phase,
        upserted: summary.opportunitiesUpserted,
        blocked: summary.agenciesBlocked.length,
        escalated: !!summary.escalated,
      });
    } catch (e) {
      logger.error('Scheduled Bonfire scrape threw', { error: e.message });
    }
  });

  logger.info('Bonfire scraper scheduler started', { cron: cfg.cron, phase: cfg.phase });
  return task;
}

function stopBonfireScraperScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { startBonfireScraperScheduler, stopBonfireScraperScheduler };
