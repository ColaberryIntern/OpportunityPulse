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
const dailyTopicRanker = require('./dailyTopicRanker.service');

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

// Build the scan plan: an array of { topic, subscription, autoPicked }.
//   - explicit `topics` override  → run exactly those (manual / test)
//   - DB-driven subscriptions     → enabled subscriptions that are due
//   - data-driven auto-pick       → ALWAYS appended (unless disabled or
//                                   topic already in plan) so the platform
//                                   produces ≥ 1 data-driven Deep Research
//                                   report every day
//   - zero subscriptions + no pick → env-topic fallback
async function buildScanPlan(topics) {
  if (Array.isArray(topics) && topics.length) {
    return topics.map((t) => ({ topic: t, subscription: null, autoPicked: false }));
  }
  const plan = [];
  const subs = await BriefingSubscription.findAll({ where: { enabled: true } });
  const due = subs.filter((s) => briefingSubscription.isDue(s.toJSON()));
  for (const s of due) {
    plan.push({ topic: s.scanTopic, subscription: s, autoPicked: false });
  }

  // Data-driven auto-pick. Opt-out via DEEP_RESEARCH_AUTO_PICK_ENABLED=false.
  if (process.env.DEEP_RESEARCH_AUTO_PICK_ENABLED !== 'false') {
    try {
      const picked = await dailyTopicRanker.pickTodaysTopic();
      if (picked && picked.topic) {
        const lower = String(picked.topic).toLowerCase();
        const alreadyInPlan = plan.some((p) => String(p.topic).toLowerCase() === lower);
        if (!alreadyInPlan) {
          plan.push({
            topic: picked.topic, subscription: null, autoPicked: true,
            pickerMetadata: picked,
          });
        }
      } else if (picked && picked.reason) {
        logger.info('dailyResearchScan: auto-pick skipped', { reason: picked.reason });
      }
    } catch (e) {
      logger.warn('dailyResearchScan: auto-pick failed (continuing without)', { error: e.message });
    }
  }

  // Final fallback: env / default topics when neither subscriptions nor the
  // auto-picker produced anything (e.g. cold-start with no opportunity data).
  if (plan.length === 0) {
    return getScanTopics().map((t) => ({ topic: t, subscription: null, autoPicked: false }));
  }
  return plan;
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

  for (const { topic, subscription, autoPicked, pickerMetadata } of plan) {
    // eslint-disable-next-line no-await-in-loop
    const scan = await DailyResearchScan.create({
      scanTopic: topic, status: 'running', startedAt: new Date(),
    });
    if (autoPicked && pickerMetadata) {
      logger.info('dailyResearchScan: auto-picked topic', {
        topic, composite_score: pickerMetadata.composite_score,
        runners_up: pickerMetadata.runners_up,
      });
    }
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
  // Default: 5 AM Central — runs ~1 hour BEFORE the 6 AM CT digest cron so the
  // freshly-picked report is ready to surface in that morning's email.
  // Timezone is configurable so ops can move the run window without code.
  const schedule = process.env.DEEP_RESEARCH_SCAN_SCHEDULE || '0 5 * * *';
  const timezone = process.env.DEEP_RESEARCH_SCAN_TIMEZONE || 'America/Chicago';
  cron.schedule(schedule, async () => {
    logger.info('Scheduled: Deep Research daily scan starting', { schedule, timezone });
    try {
      const summary = await runDailyScan();
      logger.info('Scheduled: Deep Research daily scan complete', summary);
    } catch (error) {
      logger.error('Scheduled: Deep Research daily scan failed', { error: error.message });
    }
  }, { timezone });
  logger.info('Deep Research daily scan scheduler started', { schedule, timezone });
}

// On-demand: rank topics + run a Deep Research scan against the top pick.
// Returns { topic, reportId, picker } so callers (controller / CLI) can
// see which topic was selected and why. Skips the run when the picker
// returns no usable candidate (cold-start with no data).
async function runAutoPickedScan() {
  const picked = await dailyTopicRanker.pickTodaysTopic();
  if (!picked || !picked.topic) {
    logger.info('runAutoPickedScan: no usable topic', { picked });
    return { ran: false, picked };
  }
  const summary = await runDailyScan({ topics: [picked.topic] });
  return {
    ran: true,
    topic: picked.topic,
    composite_score: picked.composite_score,
    sub_scores: picked.sub_scores,
    runners_up: picked.runners_up,
    summary,
  };
}

module.exports = {
  DEFAULT_SCAN_TOPICS,
  getScanTopics,
  buildScanPlan,
  runDailyScan,
  runAutoPickedScan,
  startDailyResearchScheduler,
};
