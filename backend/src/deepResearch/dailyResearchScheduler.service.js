// Deep Research Intelligence Engine — daily automated scan.
//
// FOUNDATION (Phase 1). Once per day, runs a deep research synthesis over a
// configurable list of strategic topics, logs each run as a
// daily_research_scans row, and hands the produced reports to the email
// briefing service.
//
// Conservative by default — the cron is OFF unless DEEP_RESEARCH_SCAN_ENABLED
// is true, mirroring every other opt-in scheduler in this codebase (OIED
// digest, briefing, trigger engine, source-health agent). runDailyScan can
// always be invoked directly (controller / test) regardless of the flag.

const cron = require('node-cron');
const { DailyResearchScan } = require('../models');
const logger = require('../logging/logger');
const deepResearch = require('./deepResearch.service');
const emailBriefing = require('./emailBriefing.service');

let schedulerStarted = false;

// Default strategic scan topics. Overridable via env (comma-separated) so
// the topic list is config, not code.
const DEFAULT_SCAN_TOPICS = [
  'AI agents',
  'government AI procurement',
  'healthcare AI',
  'AI automation for small business',
];

function getScanTopics() {
  const raw = (process.env.DEEP_RESEARCH_SCAN_TOPICS || '').trim();
  if (!raw) return DEFAULT_SCAN_TOPICS;
  const topics = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return topics.length ? topics : DEFAULT_SCAN_TOPICS;
}

// Run one full daily scan pass: a deep research report per topic, each
// logged as a daily_research_scans row. Failure-first — one topic failing
// never aborts the rest; its scan row is marked 'failed' and the loop
// continues. Returns a summary { topics, succeeded, failed, reportIds }.
async function runDailyScan({ topics } = {}) {
  const scanTopics = Array.isArray(topics) && topics.length ? topics : getScanTopics();
  logger.info('dailyResearchScan: starting', { topicCount: scanTopics.length });

  const reports = [];
  const reportIds = [];
  let succeeded = 0;
  let failed = 0;

  for (const topic of scanTopics) {
    // eslint-disable-next-line no-await-in-loop
    const scan = await DailyResearchScan.create({
      scanTopic: topic,
      status: 'running',
      startedAt: new Date(),
    });
    try {
      // eslint-disable-next-line no-await-in-loop
      const report = await deepResearch.runDeepResearch({
        searchTerm: topic,
        origin: 'daily_scan',
      });
      // eslint-disable-next-line no-await-in-loop
      await scan.update({
        status: 'success',
        reportId: report.id,
        completedAt: new Date(),
      });
      reports.push(report);
      reportIds.push(report.id);
      succeeded += 1;
    } catch (e) {
      // eslint-disable-next-line no-await-in-loop
      await scan.update({ status: 'failed', error: e.message, completedAt: new Date() });
      failed += 1;
      logger.warn('dailyResearchScan: topic failed', { topic, error: e.message });
    }
  }

  // Hand the produced reports to the briefing service. It's conservative —
  // only actually emails if a recipient is configured.
  try {
    await emailBriefing.sendDailyBriefing(reports);
  } catch (e) {
    logger.warn('dailyResearchScan: briefing dispatch failed', { error: e.message });
  }

  logger.info('dailyResearchScan: complete', { succeeded, failed });
  return {
    topics: scanTopics.length, succeeded, failed, reportIds,
  };
}

// Register the daily cron. Idempotent + opt-in (default OFF).
function startDailyResearchScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (process.env.DEEP_RESEARCH_SCAN_ENABLED !== 'true') {
    logger.info('Deep Research daily scan scheduler: disabled (set DEEP_RESEARCH_SCAN_ENABLED=true to enable)');
    return;
  }
  const schedule = process.env.DEEP_RESEARCH_SCAN_SCHEDULE || '0 8 * * *';
  cron.schedule(schedule, async () => {
    logger.info('Scheduled: Deep Research daily scan starting');
    try {
      const summary = await runDailyScan();
      logger.info('Scheduled: Deep Research daily scan complete', summary);
    } catch (error) {
      logger.error('Scheduled: Deep Research daily scan failed', { error: error.message });
    }
  });
  logger.info('Deep Research daily scan scheduler started', { schedule });
}

module.exports = {
  DEFAULT_SCAN_TOPICS,
  getScanTopics,
  runDailyScan,
  startDailyResearchScheduler,
};
