const cron = require('node-cron');
const logger = require('../logging/logger');
const { backfillGovContractFit } = require('./govContractScoring.backfill');

// Re-score active SAM.gov solicitations daily, shortly after the 6 AM ingestion,
// so newly-ingested federal opps carry both govFit.fit_score and the comparable
// Bonfire bid_score in time for the same day's digest. The backfill is idempotent
// (content-hash skip) and deterministic (no LLM), so this is cheap to run daily.
const DEFAULT_SCHEDULE = '30 6 * * *'; // 6:30 AM daily, just after ingestion

function startGovScoringScheduler(schedule) {
  const cronExpression = schedule || process.env.GOV_SCORING_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(cronExpression)) {
    logger.error(`Invalid gov-scoring cron expression: "${cronExpression}" — scheduler not started.`);
    return null;
  }

  const task = cron.schedule(cronExpression, async () => {
    logger.info('Scheduled gov-contract scoring starting...');
    try {
      const result = await backfillGovContractFit();
      logger.info('Scheduled gov-contract scoring complete.', result);
    } catch (error) {
      logger.error('Scheduled gov-contract scoring failed.', { error: error.message });
    }
  });

  logger.info(`Gov-scoring scheduler started: "${cronExpression}"`);
  return task;
}

module.exports = { startGovScoringScheduler };
