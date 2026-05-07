const cron = require('node-cron');
const logger = require('../logging/logger');

let schedulerStarted = false;

/**
 * Start the Action Engine schedulers.
 * Idempotent — calling multiple times only starts once.
 *
 * Jobs:
 * 1. Classification: every 2h at :15 — classify unclassified opportunities
 * 2. Saturation: daily 5 AM UTC — recompute saturation indexes
 * 3. Action Recommendations: daily 5:30 AM UTC — generate action plans
 * 4. Executive Brief: daily 6 AM UTC — generate fresh daily brief
 */
function startActionEngineScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const trendDetectionSchedule = process.env.TREND_DETECTION_SCHEDULE || '30 4 * * *';
  const classificationSchedule = process.env.CLASSIFICATION_SCHEDULE || '15 */2 * * *';
  const saturationSchedule = process.env.SATURATION_SCHEDULE || '0 5 * * *';
  const actionRecSchedule = process.env.ACTION_REC_SCHEDULE || '30 5 * * *';
  const execBriefSchedule = process.env.EXEC_BRIEF_SCHEDULE || '0 6 * * *';

  // Trend Detection: daily at 4:30 AM UTC — detect trends for all opportunity types
  cron.schedule(trendDetectionSchedule, async () => {
    logger.info('Scheduled: Trend detection starting');
    try {
      const { detectTrends } = require('../analysis/analysis.service');
      const types = [
        'gov_contract', 'ai_job', 'investment', 'grant', 'ai_news', 'freelance',
        'bonfire', 'bonfire_strategic',
      ];
      for (const type of types) {
        try {
          const result = await detectTrends(type);
          logger.info(`Scheduled: Trend detection complete for ${type}`, {
            input: result.inputCount,
            output: result.outputCount,
          });
        } catch (err) {
          logger.error(`Scheduled: Trend detection failed for ${type}`, { error: err.message });
        }
      }
    } catch (error) {
      logger.error('Scheduled: Trend detection failed', { error: error.message });
    }
  });

  // Classification: every 2 hours
  cron.schedule(classificationSchedule, async () => {
    logger.info('Scheduled: Classification starting');
    try {
      const { classifyOpportunities } = require('./classification.service');
      const result = await classifyOpportunities({ useLLM: false });
      logger.info('Scheduled: Classification complete', {
        input: result.inputCount,
        output: result.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Classification failed', { error: error.message });
    }
  });

  // Saturation: daily at 5 AM UTC
  cron.schedule(saturationSchedule, async () => {
    logger.info('Scheduled: Saturation computation starting');
    try {
      const { computeSaturationIndex } = require('./saturation.service');
      const result = await computeSaturationIndex();
      logger.info('Scheduled: Saturation computation complete', {
        input: result.inputCount,
        output: result.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Saturation computation failed', { error: error.message });
    }
  });

  // Action Recommendations: daily at 5:30 AM UTC
  cron.schedule(actionRecSchedule, async () => {
    logger.info('Scheduled: Action recommendations starting');
    try {
      const { generateActionRecommendations } = require('./actionRecommendation.service');
      const result = await generateActionRecommendations({ useLLM: true });
      logger.info('Scheduled: Action recommendations complete', {
        input: result.inputCount,
        output: result.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Action recommendations failed', { error: error.message });
    }
  });

  // Executive Brief: daily at 6 AM UTC
  cron.schedule(execBriefSchedule, async () => {
    logger.info('Scheduled: Executive brief generation starting');
    try {
      const { generateExecutiveBrief } = require('./executiveBrief.service');
      await generateExecutiveBrief();
      logger.info('Scheduled: Executive brief generated');
    } catch (error) {
      logger.error('Scheduled: Executive brief generation failed', { error: error.message });
    }
  });

  logger.info('Action Engine scheduler started — 5 jobs registered');
}

module.exports = { startActionEngineScheduler };
