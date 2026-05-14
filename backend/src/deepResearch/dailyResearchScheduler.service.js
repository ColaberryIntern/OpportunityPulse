// Deep Research Intelligence Engine — daily automated scan.
//
// Phase 1 ran a fixed env-configured topic list. Phase 2 makes it
// DB-driven: the scan plan comes from the briefing_subscriptions table
// (managed in the briefing center UI), each with its own frequency and
// recipient list. Env topics remain as a zero-config fallback when no
// subscriptions exist at all.
//
// Conservative by default — the cron is OFF unless DEEP_RESEARCH_SCAN_ENABLED
// is true. runDailyScan can always be invoked directly (controller / test)
// regardless of the flag.

const cron = require('node-cron');
const { DailyResearchScan, BriefingSubscription } = require('../models');
const logger = require('../logging/logger');
const deepResearch = require('./deepResearch.service');
const emailBriefing = require('./emailBriefing.service');
const briefingSubscription = require('./briefingSubscription.service');

let schedulerStarted = false;

// Zero-config fallback topics — used only when no briefing_subscriptions
// rows exist at all. Overridable via env (comma-separated).
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

// Build the scan plan: an array of { topic, subscription }.
//   - explicit `topics` override  → run exactly those (manual / test)
//   - DB-driven                   → enabled subscriptions that are due
//   - zero subscriptions at all   → env-topic fallback
async function buildScanPlan(topics) {
  if (Array.isArray(topics) && topics.length) {
    return topics.map((t) => ({ topic: t, subscription: null }));
  }
  const subs = await BriefingSubscription.findAll({ where: { enabled: true } });
  if (subs.length === 0) {
    return getScanTopics().map((t) => ({ topic: t, subscription: null }));
  }
  return subs
    .filter((s) => briefingSubscription.isDue(s.toJSON()))
    .map((s) => ({ topic: s.scanTopic, subscription: s }));
}

// Run one full daily scan pass. Failure-first — one topic failing never
// aborts the rest; its scan row is marked 'failed' and the loop continues.
// Returns a summary { topics, succeeded, failed, reportIds }.
async function runDailyScan({ topics } = {}) {
  const plan = await buildScanPlan(topics);
  logger.info('dailyResearchScan: starting', { plannedTopics: plan.length });

  const succeededReports = []; // { report, subscription }
  const reportIds = [];
  let succeeded = 0;
  let failed = 0;

  for (const { topic, subscription } of plan) {
    // eslint-disable-next-line no-await-in-loop
    const scan = await DailyResearchScan.create({
      scanTopic: topic, status: 'running', startedAt: new Date(),
    });
    try {
      // eslint-disable-next-line no-await-in-loop
      const report = await deepResearch.runDeepResearch({
        searchTerm: topic, origin: 'daily_scan',
      });
      // eslint-disable-next-line no-await-in-loop
      await scan.update({ status: 'success', reportId: report.id, completedAt: new Date() });
      if (subscription) {
        // eslint-disable-next-line no-await-in-loop
        await subscription.update({ lastScanAt: new Date() });
      }
      succeededReports.push({ report, subscription });
      reportIds.push(report.id);
      succeeded += 1;
    } catch (e) {
      // eslint-disable-next-line no-await-in-loop
      await scan.update({ status: 'failed', error: e.message, completedAt: new Date() });
      failed += 1;
      logger.warn('dailyResearchScan: topic failed', { topic, error: e.message });
    }
  }

  // Dispatch briefings. Subscription-bound reports go to that subscription's
  // recipients; env-fallback reports go to the global default recipient.
  try {
    const globalReports = [];
    for (const { report, subscription } of succeededReports) {
      if (subscription && Array.isArray(subscription.recipients) && subscription.recipients.length) {
        // eslint-disable-next-line no-await-in-loop
        await emailBriefing.sendDailyBriefing([report], {
          to: subscription.recipients.join(','),
        });
      } else {
        globalReports.push(report);
      }
    }
    if (globalReports.length) {
      await emailBriefing.sendDailyBriefing(globalReports);
    }
  } catch (e) {
    logger.warn('dailyResearchScan: briefing dispatch failed', { error: e.message });
  }

  logger.info('dailyResearchScan: complete', { succeeded, failed });
  return {
    topics: plan.length, succeeded, failed, reportIds,
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
  buildScanPlan,
  runDailyScan,
  startDailyResearchScheduler,
};
