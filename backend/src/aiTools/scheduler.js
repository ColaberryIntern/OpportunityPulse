const cron = require('node-cron');
const logger = require('../logging/logger');

let schedulerStarted = false;

/**
 * Start the AI Tools analysis scheduler.
 *
 * Schedules two recurring jobs:
 * 1. Tool mention extraction — every 6 hours (at minute 0)
 *    Scans recent ai_news opportunities and extracts AI tool mentions.
 *
 * 2. Tool trend analysis — every 6 hours, offset by 1 hour (at hours 1, 7, 13, 19)
 *    Computes trending scores based on aggregated mention data.
 *
 * The offset ensures that extraction completes before trend analysis runs,
 * so trend scoring always uses the most recent mention data.
 *
 * This function is idempotent — calling it multiple times will only
 * start the scheduler once.
 */
function startAiToolsScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Every 6 hours: extract tool mentions from latest ai_news
  cron.schedule('0 */6 * * *', async () => {
    logger.info('Scheduled: AI tool mention extraction starting');
    try {
      const { extractToolMentionsFromNews } = require('./aiToolAnalysis.service');
      const run = await extractToolMentionsFromNews();
      logger.info('Scheduled: AI tool mention extraction complete', {
        status: run.status,
        mentions: run.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: AI tool mention extraction failed', { error: error.message });
    }
  });

  // Every 6 hours (offset by 1 hour): run trend scoring
  cron.schedule('0 1,7,13,19 * * *', async () => {
    logger.info('Scheduled: AI tool trend analysis starting');
    try {
      const { runToolTrendAnalysis } = require('./aiToolAnalysis.service');
      const run = await runToolTrendAnalysis();
      logger.info('Scheduled: AI tool trend analysis complete', {
        status: run.status,
        updated: run.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: AI tool trend analysis failed', { error: error.message });
    }
  });

  // Daily at 3 AM UTC: discover new tools from GitHub + Product Hunt
  cron.schedule('0 3 * * *', async () => {
    logger.info('Scheduled: AI tool discovery pipeline starting');
    try {
      const { runToolDiscoveryPipeline } = require('./aiToolAnalysis.service');
      const results = await runToolDiscoveryPipeline();
      logger.info('Scheduled: AI tool discovery pipeline complete', {
        github: results.github?.status || 'unknown',
        productHunt: results.productHunt?.status || 'unknown',
      });
    } catch (error) {
      logger.error('Scheduled: AI tool discovery pipeline failed', { error: error.message });
    }
  });

  // Daily at 3:30 AM UTC: GitHub acceleration computation
  cron.schedule(process.env.GITHUB_ACCEL_SCHEDULE || '30 3 * * *', async () => {
    logger.info('Scheduled: GitHub acceleration computation starting');
    try {
      const { computeGithubAcceleration } = require('./githubAcceleration.service');
      const run = await computeGithubAcceleration();
      logger.info('Scheduled: GitHub acceleration complete', { status: run.status, output: run.outputCount });
    } catch (error) {
      logger.error('Scheduled: GitHub acceleration failed', { error: error.message });
    }
  });

  // Daily at 3:45 AM UTC: Social velocity computation
  cron.schedule(process.env.SOCIAL_VELOCITY_SCHEDULE || '45 3 * * *', async () => {
    logger.info('Scheduled: Social velocity computation starting');
    try {
      const { computeSocialVelocity } = require('./socialVelocity.service');
      const run = await computeSocialVelocity();
      logger.info('Scheduled: Social velocity complete', { status: run.status, output: run.outputCount });
    } catch (error) {
      logger.error('Scheduled: Social velocity failed', { error: error.message });
    }
  });

  // Daily at 4:00 AM UTC: Funding + enterprise signal scoring
  cron.schedule(process.env.FUNDING_SCORING_SCHEDULE || '0 4 * * *', async () => {
    logger.info('Scheduled: Funding & enterprise scoring starting');
    try {
      const { computeFundingScores, computeEnterpriseSignalScores } = require('./aiToolAnalysis.service');
      await computeFundingScores();
      await computeEnterpriseSignalScores();
      logger.info('Scheduled: Funding & enterprise scoring complete');
    } catch (error) {
      logger.error('Scheduled: Funding & enterprise scoring failed', { error: error.message });
    }
  });

  // Daily at 4:15 AM UTC: Momentum composite scoring
  cron.schedule(process.env.MOMENTUM_SCORING_SCHEDULE || '15 4 * * *', async () => {
    logger.info('Scheduled: Momentum scoring starting');
    try {
      const { computeMomentumScores } = require('./momentumScoring.service');
      const run = await computeMomentumScores();
      logger.info('Scheduled: Momentum scoring complete', { status: run.status, output: run.outputCount });
    } catch (error) {
      logger.error('Scheduled: Momentum scoring failed', { error: error.message });
    }
  });

  logger.info('AI Tools scheduler started (mention extraction: */6h, trend analysis: offset */6h, discovery: daily 3AM UTC, momentum: daily 3:30-4:15AM UTC)');
}

module.exports = { startAiToolsScheduler };
