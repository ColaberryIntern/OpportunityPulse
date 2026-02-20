const cron = require('node-cron');
const { runIngestion } = require('../ingestion/ingestion.service');
const { classifyFreelanceOpportunities } = require('./freelanceClassification.service');
const { scoreFreelanceOpportunities } = require('./freelanceScoring.service');
const { generateDailySnapshot } = require('./freelanceTrend.service');
const logger = require('../logging/logger');

const FREELANCE_DATA_SOURCES = ['upwork_rss', 'freelancer_api', 'generic_freelance_rss'];

/**
 * Run freelance ingestion for all configured data sources.
 */
async function runFreelanceIngestion() {
  logger.info('Freelance ingestion scheduler started');

  for (const sourceName of FREELANCE_DATA_SOURCES) {
    try {
      await runIngestion(sourceName);
    } catch (error) {
      // Data source may be disabled or not yet seeded — log and continue
      logger.warn(`Freelance ingestion for "${sourceName}" skipped: ${error.message}`);
    }
  }

  logger.info('Freelance ingestion scheduler complete');
}

/**
 * Run freelance classification then scoring pipeline.
 */
async function runFreelanceEnrichment() {
  logger.info('Freelance enrichment scheduler started');

  try {
    await classifyFreelanceOpportunities();
    logger.info('Freelance classification complete');
  } catch (error) {
    logger.error('Freelance classification failed in scheduler', { error: error.message });
  }

  try {
    await scoreFreelanceOpportunities();
    logger.info('Freelance scoring complete');
  } catch (error) {
    logger.error('Freelance scoring failed in scheduler', { error: error.message });
  }

  logger.info('Freelance enrichment scheduler complete');
}

/**
 * Start all freelance cron jobs.
 */
function startFreelanceScheduler() {
  // Freelance ingestion — every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    try {
      await runFreelanceIngestion();
    } catch (error) {
      logger.error('Freelance ingestion scheduler error', { error: error.message });
    }
  });

  // Freelance classification + scoring — every 6 hours (offset by 30 min)
  cron.schedule('30 */6 * * *', async () => {
    try {
      await runFreelanceEnrichment();
    } catch (error) {
      logger.error('Freelance enrichment scheduler error', { error: error.message });
    }
  });

  // Daily trend snapshot — 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    try {
      await generateDailySnapshot();
    } catch (error) {
      logger.error('Freelance trend snapshot scheduler error', { error: error.message });
    }
  });

  logger.info('Freelance scheduler started: ingestion (*/4h), enrichment (*/6h+30m), trends (2am)');
}

module.exports = { startFreelanceScheduler };
