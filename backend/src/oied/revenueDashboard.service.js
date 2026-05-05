// Revenue Dashboard — top-level money picture for the org.
//
//   pipeline_value      = Σ value of opps with a draft output
//   expected_revenue    = Σ value × win_probability across the queue
//                         (uses most-recent win_probability_history per opp;
//                         falls back to baseline 0.20 when none exists)
//   actual_revenue      = Σ value of opps with a `won` event
//   conversion_rate     = won / (won + lost)            (null when denom=0)
//   submit_to_win_rate  = won / submitted               (null when denom=0)
//   pipeline_by_bucket  = aggregation grouped by act_now/high_value/quick_win/standard
//   weekly_trend        = [{week_start, won_count, won_value}] last 12 weeks

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const {
  Opportunity,
  OpportunityOutput,
  OpportunityEvent,
  WinProbabilityHistory,
} = require('../models');
const myOppsSvc = require('./myOpportunities.service');
const profileSvc = require('./profile.service');

const BASELINE_WIN_PROB = 0.20;

function startOfDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function startOfWeekSunday(d) {
  const x = startOfDay(d);
  x.setUTCDate(x.getUTCDate() - x.getUTCDay()); // Sunday = 0
  return x;
}

function safeRate(num, denom) {
  if (!denom) return null;
  return Number((num / denom).toFixed(4));
}

// Pure: given the loaded inputs, compute the dashboard payload.
// Lifted so the math is unit-testable without mocking the whole DB.
function computeDashboard({
  draftOpps,            // [{id, value, bucket}]
  wpByOppId,            // Map<oppId, win_probability>
  conversionEvents,     // [{event_type, opportunity:{value}, created_at}]
  organizationId,
  now = new Date(),
}) {
  // Pipeline value + expected revenue, plus pipeline-by-bucket.
  const buckets = { act_now: 0, high_value: 0, quick_win: 0, standard: 0 };
  const bucketCounts = { act_now: 0, high_value: 0, quick_win: 0, standard: 0 };
  let pipelineValue = 0;
  let expectedRevenue = 0;
  for (const opp of draftOpps) {
    const v = Number(opp.value) || 0;
    const wp = wpByOppId.get(opp.id) != null ? wpByOppId.get(opp.id) : BASELINE_WIN_PROB;
    pipelineValue += v;
    expectedRevenue += v * wp;
    const bk = opp.bucket && buckets[opp.bucket] != null ? opp.bucket : 'standard';
    buckets[bk] += v;
    bucketCounts[bk] += 1;
  }

  // Outcome counts.
  let submittedCount = 0;
  let respondedCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let actualRevenue = 0;

  // Weekly trend buckets (last 12 weeks).
  const weeks = new Map();
  for (let i = 11; i >= 0; i -= 1) {
    const start = startOfWeekSunday(new Date(now.getTime() - i * 7 * 86400000));
    weeks.set(start.toISOString(), { week_start: start.toISOString().slice(0, 10), won_count: 0, won_value: 0 });
  }

  for (const e of conversionEvents) {
    const v = Number(e.opportunity && e.opportunity.value) || 0;
    if (e.eventType === 'submitted') submittedCount += 1;
    else if (e.eventType === 'response_received') respondedCount += 1;
    else if (e.eventType === 'won') {
      wonCount += 1;
      actualRevenue += v;
      const wkStart = startOfWeekSunday(new Date(e.createdAt));
      const key = wkStart.toISOString();
      if (weeks.has(key)) {
        const w = weeks.get(key);
        w.won_count += 1;
        w.won_value += v;
      }
    } else if (e.eventType === 'lost') {
      lostCount += 1;
    }
  }

  return {
    organization_id: organizationId,
    pipeline_value: Math.round(pipelineValue),
    expected_revenue: Math.round(expectedRevenue),
    actual_revenue: Math.round(actualRevenue),
    submitted_count: submittedCount,
    response_count: respondedCount,
    won_count: wonCount,
    lost_count: lostCount,
    conversion_rate: safeRate(wonCount, wonCount + lostCount),
    submit_to_win_rate: safeRate(wonCount, submittedCount),
    pipeline_by_bucket: Object.entries(buckets).map(([bucket, value]) => ({
      bucket, value: Math.round(value), count: bucketCounts[bucket],
    })),
    weekly_trend: [...weeks.values()],
    generated_at: now.toISOString(),
  };
}

async function getDashboard({ organizationId, userId = null, now = new Date() } = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));

  // 1. Draft outputs → distinct parent opp ids → opportunities (with bucket).
  let draftOpps = [];
  try {
    const drafts = await OpportunityOutput.findAll({
      where: { status: 'draft' },
      attributes: ['opportunityId'],
      limit: 1000,
    });
    if (drafts.length > 0) {
      const oppIds = [...new Set(drafts.map((d) => d.opportunityId))];
      // Load opps + run the priority engine to attach bucket. Reusing
      // myOpportunities here would be heavy; pull just what we need.
      const opps = await Opportunity.findAll({
        where: { id: oppIds },
        attributes: ['id', 'value', 'category', 'expiresAt', 'aiAnalysis'],
      });
      // Compute bucket via the priority engine, scoped to this org's profile.
      // Cheap because it's pure (no DB).
      // eslint-disable-next-line global-require
      const { calculatePriorityScore } = require('./priorityScoring.service');
      // eslint-disable-next-line global-require
      const { estimateEffort } = require('./effortEstimator.service');
      draftOpps = opps.map((o) => {
        const opp = o.toJSON ? o.toJSON() : o;
        const effort = estimateEffort(opp);
        const fit = (opp.aiAnalysis && opp.aiAnalysis.fit_score) || 0;
        const breakdown = {
          revenue_weight: 0, automation_score: 0, ease_of_entry: 0,
        };
        const { bucket } = calculatePriorityScore({
          opportunity: opp, fitScore: fit, breakdown, now,
        });
        return { id: opp.id, value: opp.value, bucket };
      });
    }
  } catch (e) {
    logger.warn('revenueDashboard: draft pipeline lookup failed', { error: e.message });
  }

  // 2. Most-recent win_probability per opp (cheaper than re-computing).
  const wpByOppId = new Map();
  try {
    if (draftOpps.length > 0) {
      const rows = await WinProbabilityHistory.findAll({
        where: {
          organizationId: orgId,
          opportunityId: draftOpps.map((o) => o.id),
        },
        order: [['createdAt', 'DESC']],
        limit: 5000,
      });
      for (const r of rows) {
        if (!wpByOppId.has(r.opportunityId)) {
          wpByOppId.set(r.opportunityId, Number(r.winProbability) || BASELINE_WIN_PROB);
        }
      }
    }
  } catch (e) {
    logger.warn('revenueDashboard: win-probability history lookup failed', {
      error: e.message,
    });
  }

  // 3. Conversion events → for outcome counts, actual revenue, weekly trend.
  // Hydrate parent opportunity values in one query.
  let conversionEvents = [];
  try {
    const events = await OpportunityEvent.findAll({
      where: {
        eventType: { [Op.in]: ['submitted', 'response_received', 'won', 'lost'] },
      },
      order: [['createdAt', 'DESC']],
      limit: 1000,
    });
    if (events.length > 0) {
      const ids = [...new Set(events.map((e) => e.opportunityId))];
      const opps = await Opportunity.findAll({
        where: { id: ids },
        attributes: ['id', 'value'],
      });
      const oppMap = new Map();
      for (const o of opps) oppMap.set(o.id, o.toJSON ? o.toJSON() : o);
      conversionEvents = events.map((e) => ({
        eventType: e.eventType,
        createdAt: e.createdAt,
        opportunity: oppMap.get(e.opportunityId) || {},
      }));
    }
  } catch (e) {
    logger.warn('revenueDashboard: conversion events lookup failed', {
      error: e.message,
    });
  }

  return computeDashboard({
    draftOpps,
    wpByOppId,
    conversionEvents,
    organizationId: orgId,
    now,
  });
}

module.exports = {
  getDashboard,
  computeDashboard,
  BASELINE_WIN_PROB,
};

// Suppress unused-import ESLint for myOppsSvc (kept for future enhancements).
// eslint-disable-next-line no-unused-expressions
myOppsSvc;
