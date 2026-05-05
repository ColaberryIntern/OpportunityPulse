// Fast Feedback Loop.
//
// Two pieces of behavior:
//   1. Daily prompt — getPendingOutcomes() returns opportunities with a
//      'submitted' event >7 days ago that have no later 'won' / 'lost' /
//      'response_received' event. Surfaced in the UI as a banner.
//   2. Weekly summary — buildWeeklySummary({since, until}) aggregates
//      wins / losses / insights for the last 7 days and emails it on a
//      cron schedule (default OFF, Friday 5pm).
//
// "Insights" includes:
//   - top performing category (most wins this week)
//   - biggest win (highest-value won opp)
//   - biggest loss (highest-value lost — sanity check on optimism)
//   - predicted-vs-actual: average predicted win_probability for opps
//     that ended up won vs. lost (calibration drift signal)

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const {
  Opportunity,
  OpportunityEvent,
  WinProbabilityHistory,
} = require('../models');
const { sendEmail } = require('../utils/email');
const profileSvc = require('./profile.service');

const PENDING_THRESHOLD_DAYS = 7;
const OUTCOME_TYPES = new Set(['won', 'lost', 'response_received']);

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtUSD(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

// Pure: given the loaded events, return [{opportunity_id, submitted_at,
// days_since}] for submissions that have no later outcome event.
function pickPending(events, { now = new Date(), thresholdDays = PENDING_THRESHOLD_DAYS } = {}) {
  // Bucket by opportunity_id, sort by createdAt asc, find latest submitted
  // whose followups don't include an outcome.
  const byOpp = new Map();
  for (const e of events) {
    if (!byOpp.has(e.opportunityId)) byOpp.set(e.opportunityId, []);
    byOpp.get(e.opportunityId).push(e);
  }
  const out = [];
  for (const [oppId, list] of byOpp) {
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    // Walk forward; mark a "submitted" as pending if no outcome event
    // appears after it.
    let lastSubmitted = null;
    let outcomeAfter = false;
    for (const e of list) {
      if (e.eventType === 'submitted') {
        lastSubmitted = e;
        outcomeAfter = false;
      } else if (lastSubmitted && OUTCOME_TYPES.has(e.eventType)) {
        outcomeAfter = true;
      }
    }
    if (!lastSubmitted || outcomeAfter) continue;
    const submittedAt = new Date(lastSubmitted.createdAt);
    const daysSince = Math.floor((now.getTime() - submittedAt.getTime()) / 86400000);
    if (daysSince >= thresholdDays) {
      out.push({
        opportunity_id: oppId,
        submitted_at: submittedAt.toISOString(),
        days_since: daysSince,
      });
    }
  }
  // Stale-first.
  out.sort((a, b) => b.days_since - a.days_since);
  return out;
}

async function getPendingOutcomes({
  organizationId,
  userId = null,
  thresholdDays = PENDING_THRESHOLD_DAYS,
  now = new Date(),
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  // Pull all submission/outcome events in the last 90 days. The 7-day
  // pending window is small enough that this is cheap.
  const since = new Date(now.getTime() - 90 * 86400000);
  let events = [];
  try {
    events = await OpportunityEvent.findAll({
      where: {
        eventType: { [Op.in]: ['submitted', 'won', 'lost', 'response_received'] },
        createdAt: { [Op.gte]: since },
      },
      order: [['createdAt', 'ASC']],
      limit: 2000,
    });
  } catch (e) {
    logger.warn('feedback.getPendingOutcomes: event lookup failed', { error: e.message });
  }
  const pending = pickPending(events, { now, thresholdDays });
  if (pending.length === 0) {
    return { organization_id: orgId, threshold_days: thresholdDays, pending: [] };
  }
  // Hydrate titles for the banner UI.
  const oppIds = pending.map((p) => p.opportunity_id);
  let oppMap = new Map();
  try {
    const opps = await Opportunity.findAll({
      where: { id: oppIds },
      attributes: ['id', 'title', 'value', 'category'],
    });
    for (const o of opps) oppMap.set(o.id, o.toJSON ? o.toJSON() : o);
  } catch (e) {
    logger.warn('feedback.getPendingOutcomes: opp hydrate failed', { error: e.message });
  }
  return {
    organization_id: orgId,
    threshold_days: thresholdDays,
    pending: pending.map((p) => ({
      ...p,
      title:    (oppMap.get(p.opportunity_id) || {}).title || `Opportunity #${p.opportunity_id}`,
      value:    Number((oppMap.get(p.opportunity_id) || {}).value) || 0,
      category: (oppMap.get(p.opportunity_id) || {}).category || null,
    })),
  };
}

// Pure: weekly aggregation given pre-fetched events + opp lookups.
function aggregateWeekly({ events, oppMap, predictionMap, since, until }) {
  let won = 0; let lost = 0;
  let actualRevenue = 0;
  const wonByCategory = new Map();
  let biggestWin = null;
  let biggestLoss = null;
  const winProbs = []; // for won opps
  const lossProbs = []; // for lost opps

  for (const e of events) {
    const t = new Date(e.createdAt);
    if (t < since || t > until) continue;
    const opp = oppMap.get(e.opportunityId) || {};
    const value = Number(opp.value) || 0;
    if (e.eventType === 'won') {
      won += 1;
      actualRevenue += value;
      const cat = opp.category || 'Unknown';
      wonByCategory.set(cat, (wonByCategory.get(cat) || 0) + 1);
      if (!biggestWin || value > biggestWin.value) {
        biggestWin = { opportunity_id: e.opportunityId, title: opp.title, value, category: opp.category };
      }
      const p = predictionMap.get(e.opportunityId);
      if (p != null) winProbs.push(p);
    } else if (e.eventType === 'lost') {
      lost += 1;
      if (!biggestLoss || value > biggestLoss.value) {
        biggestLoss = { opportunity_id: e.opportunityId, title: opp.title, value, category: opp.category };
      }
      const p = predictionMap.get(e.opportunityId);
      if (p != null) lossProbs.push(p);
    }
  }

  const topCat = [...wonByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const avg = (arr) => (arr.length === 0 ? null : Number((arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(3)));
  return {
    won_count: won,
    lost_count: lost,
    actual_revenue: actualRevenue,
    win_rate: (won + lost) > 0 ? Number((won / (won + lost)).toFixed(4)) : null,
    insights: {
      top_performing_category: topCat ? { category: topCat[0], wins: topCat[1] } : null,
      biggest_win: biggestWin,
      biggest_loss: biggestLoss,
      predicted_vs_actual: {
        avg_predicted_for_wins: avg(winProbs),
        avg_predicted_for_losses: avg(lossProbs),
        sample_size: winProbs.length + lossProbs.length,
      },
    },
  };
}

async function buildWeeklySummary({
  organizationId,
  userId = null,
  weekEndingAt = new Date(),
  now = new Date(),
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  const until = new Date(weekEndingAt);
  const since = new Date(until.getTime() - 7 * 86400000);

  let events = [];
  try {
    events = await OpportunityEvent.findAll({
      where: {
        eventType: { [Op.in]: ['won', 'lost'] },
        createdAt: { [Op.gte]: since, [Op.lte]: until },
      },
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
  } catch (e) {
    logger.warn('feedback.buildWeeklySummary: events query failed', { error: e.message });
  }
  const oppIds = [...new Set(events.map((e) => e.opportunityId))];
  let oppMap = new Map();
  if (oppIds.length > 0) {
    try {
      const opps = await Opportunity.findAll({
        where: { id: oppIds },
        attributes: ['id', 'title', 'value', 'category'],
      });
      for (const o of opps) oppMap.set(o.id, o.toJSON ? o.toJSON() : o);
    } catch (e) {
      logger.warn('feedback.buildWeeklySummary: opp hydrate failed', { error: e.message });
    }
  }
  // Most-recent predicted win_probability per opp (for the calibration delta).
  let predictionMap = new Map();
  try {
    if (oppIds.length > 0) {
      const wpRows = await WinProbabilityHistory.findAll({
        where: { organizationId: orgId, opportunityId: oppIds },
        order: [['createdAt', 'DESC']],
        limit: 5000,
      });
      for (const r of wpRows) {
        if (!predictionMap.has(r.opportunityId)) {
          predictionMap.set(r.opportunityId, Number(r.winProbability));
        }
      }
    }
  } catch (e) {
    logger.warn('feedback.buildWeeklySummary: win-prob lookup failed', { error: e.message });
  }

  const agg = aggregateWeekly({ events, oppMap, predictionMap, since, until });
  return {
    organization_id: orgId,
    period: {
      start: since.toISOString(),
      end:   until.toISOString(),
    },
    ...agg,
    generated_at: now.toISOString(),
  };
}

function buildWeeklySummaryHtml(summary) {
  const insights = summary.insights || {};
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 720px; margin: 0 auto;">
      <h1 style="font-size:22px; color:#0f172a;">📊 Weekly Summary — ${summary.period.start.slice(0, 10)} → ${summary.period.end.slice(0, 10)}</h1>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin: 12px 0;">
        <div style="padding:10px; border:1px solid #e5e7eb; border-radius:8px;">
          <div style="font-size:12px; color:#6b7280;">Wins</div>
          <div style="font-size:22px; font-weight:600; color:#16a34a;">${summary.won_count}</div>
        </div>
        <div style="padding:10px; border:1px solid #e5e7eb; border-radius:8px;">
          <div style="font-size:12px; color:#6b7280;">Losses</div>
          <div style="font-size:22px; font-weight:600; color:#dc2626;">${summary.lost_count}</div>
        </div>
        <div style="padding:10px; border:1px solid #e5e7eb; border-radius:8px;">
          <div style="font-size:12px; color:#6b7280;">Actual revenue</div>
          <div style="font-size:22px; font-weight:600;">${escapeHtml(fmtUSD(summary.actual_revenue))}</div>
        </div>
      </div>
      <h2 style="font-size:16px; margin-top:18px;">🔎 Insights</h2>
      <ul style="font-size:14px; color:#374151;">
        ${insights.top_performing_category
          ? `<li>Top performing category: <strong>${escapeHtml(insights.top_performing_category.category)}</strong> (${insights.top_performing_category.wins} wins)</li>`
          : '<li>No category dominated this week.</li>'}
        ${insights.biggest_win
          ? `<li>Biggest win: ${escapeHtml(insights.biggest_win.title || `#${insights.biggest_win.opportunity_id}`)} — ${escapeHtml(fmtUSD(insights.biggest_win.value))}</li>`
          : '<li>No wins recorded.</li>'}
        ${insights.biggest_loss
          ? `<li>Biggest loss: ${escapeHtml(insights.biggest_loss.title || `#${insights.biggest_loss.opportunity_id}`)} — ${escapeHtml(fmtUSD(insights.biggest_loss.value))}</li>`
          : ''}
        ${insights.predicted_vs_actual && insights.predicted_vs_actual.sample_size > 0
          ? `<li>Predicted-vs-actual: avg predicted ${(insights.predicted_vs_actual.avg_predicted_for_wins || 0).toFixed(2)} for wins,
             ${(insights.predicted_vs_actual.avg_predicted_for_losses || 0).toFixed(2)} for losses
             (n=${insights.predicted_vs_actual.sample_size})</li>`
          : ''}
      </ul>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">
        OIED v5 · weekly summary for org ${summary.organization_id}
      </p>
    </div>
  `;
}

async function deliverWeeklySummary({
  organizationId,
  userId = null,
  to = process.env.OIED_WEEKLY_SUMMARY_TO,
  now = new Date(),
} = {}) {
  if (!to) {
    return { sent: false, reason: 'OIED_WEEKLY_SUMMARY_TO not configured' };
  }
  const summary = await buildWeeklySummary({ organizationId, userId, weekEndingAt: now, now });
  const html = buildWeeklySummaryHtml(summary);
  const result = await sendEmail({
    to,
    subject: `📊 OIED Weekly Summary — ${summary.period.start.slice(0, 10)} → ${summary.period.end.slice(0, 10)}`,
    html,
    text: `Wins: ${summary.won_count} · Losses: ${summary.lost_count} · Actual revenue: ${fmtUSD(summary.actual_revenue)}`,
  });
  logger.info('feedback.deliverWeeklySummary', {
    to, sent: !!result.sent, won: summary.won_count, lost: summary.lost_count,
  });
  return { sent: !!result.sent, summary };
}

module.exports = {
  getPendingOutcomes,
  buildWeeklySummary,
  buildWeeklySummaryHtml,
  deliverWeeklySummary,
  pickPending,
  aggregateWeekly,
  PENDING_THRESHOLD_DAYS,
};
