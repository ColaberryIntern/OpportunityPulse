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
  // Research Intelligence Phase 2.1 — AI research summaries, daily after
  // ingestion (which runs ~6 AM) so fresh papers get summarized same-day.
  const researchSummarySchedule = process.env.RESEARCH_SUMMARY_SCHEDULE || '45 6 * * *';
  // Phase 2.2 — cross-channel matching, daily right after the summaries.
  const crossChannelSchedule = process.env.CROSS_CHANNEL_SCHEDULE || '0 7 * * *';
  // Phase 2.3 — author + topic aggregation rebuild, daily after matching.
  const researchAggSchedule = process.env.RESEARCH_AGG_SCHEDULE || '15 7 * * *';
  // Phase 3 — embedding generation for semantic search, daily before
  // aggregation so new research is searchable same-day.
  const embeddingSchedule = process.env.EMBEDDING_SCHEDULE || '30 6 * * *';
  // Phase 3c — research graph build, daily after cross-channel + aggregation.
  const researchGraphSchedule = process.env.RESEARCH_GRAPH_SCHEDULE || '30 7 * * *';

  // Trend Detection: daily at 4:30 AM UTC — detect trends for all opportunity types
  cron.schedule(trendDetectionSchedule, async () => {
    logger.info('Scheduled: Trend detection starting');
    try {
      const { detectTrends } = require('../analysis/analysis.service');
      const types = [
        'gov_contract', 'ai_job', 'investment', 'grant', 'ai_news', 'freelance',
        'bonfire', 'bonfire_strategic', 'research',
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

  // Research Summaries: daily at 6:45 AM UTC — business-oriented summaries
  // for freshly-ingested research papers (exec summary / build rec / market
  // timing / competitive insight).
  cron.schedule(researchSummarySchedule, async () => {
    logger.info('Scheduled: Research summary generation starting');
    try {
      const { summarizeResearchBatch } = require('../oied/researchSummary.service');
      const run = await summarizeResearchBatch({ limit: 40 });
      logger.info('Scheduled: Research summaries complete', {
        input: run.inputCount,
        output: run.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Research summary generation failed', { error: error.message });
    }
  });

  // Cross-Channel Matching: daily at 7:00 AM UTC — link research opps to
  // gov/talent/capital/freelance opps via keyword overlap. force=true so
  // matches refresh as new opps land in other channels.
  cron.schedule(crossChannelSchedule, async () => {
    logger.info('Scheduled: Cross-channel matching starting');
    try {
      const { matchResearchBatch } = require('../oied/crossChannelMatch.service');
      const run = await matchResearchBatch({ limit: 60, force: true });
      logger.info('Scheduled: Cross-channel matching complete', {
        input: run.inputCount,
        output: run.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Cross-channel matching failed', { error: error.message });
    }
  });

  // Embedding Generation: daily at 6:30 AM UTC — embed research opps that
  // don't have a vector yet, so semantic search stays current.
  cron.schedule(embeddingSchedule, async () => {
    logger.info('Scheduled: Embedding generation starting');
    try {
      const { embedOpportunities } = require('../oied/semanticSearch.service');
      const run = await embedOpportunities({ type: 'research', limit: 200 });
      logger.info('Scheduled: Embedding generation complete', {
        input: run.inputCount,
        output: run.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Embedding generation failed', { error: error.message });
    }
  });

  // Research Aggregation: daily at 7:15 AM UTC — rebuild research_authors +
  // research_topics from the research opps (who's publishing, what's hot).
  cron.schedule(researchAggSchedule, async () => {
    logger.info('Scheduled: Research aggregation starting');
    try {
      const { rebuildResearchAggregates } = require('../oied/researchAggregation.service');
      const run = await rebuildResearchAggregates();
      logger.info('Scheduled: Research aggregation complete', {
        input: run.inputCount,
        output: run.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Research aggregation failed', { error: error.message });
    }
  });

  // Research Graph Build: daily at 7:30 AM UTC — materialize the Phase 2.2
  // cross-channel matches into the research_relationships edge table (runs
  // after cross-channel matching at 7:00 + aggregation at 7:15).
  cron.schedule(researchGraphSchedule, async () => {
    logger.info('Scheduled: Research graph build starting');
    try {
      const { buildRelationships } = require('../oied/researchGraph.service');
      const run = await buildRelationships();
      logger.info('Scheduled: Research graph build complete', {
        input: run.inputCount,
        output: run.outputCount,
      });
    } catch (error) {
      logger.error('Scheduled: Research graph build failed', { error: error.message });
    }
  });

  logger.info('Action Engine scheduler started — 10 jobs registered');
}

module.exports = { startActionEngineScheduler };
