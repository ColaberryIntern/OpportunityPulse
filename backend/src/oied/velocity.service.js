// Pipeline Velocity Service.
//
// Aggregates timestamps from opportunity_events to compute three
// metrics per organization over a recent window:
//   - time_to_submit   : first(submitted)         − first(generated)
//   - time_to_response : first(response_received) − first(submitted)
//   - time_to_win      : first(won)               − first(submitted)
//
// Each metric reports count + avg_days + median_days + p90_days. The
// p90 is the load-bearing number when sales cycles are long-tailed.
// All math lifted into pure helpers (computeDurationsFromEvents +
// summarizeDurations) so unit tests don't need a DB.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { OpportunityEvent } = require('../models');
const profileSvc = require('./profile.service');

const DEFAULT_WINDOW_DAYS = 90;

function dayDiff(a, b) {
  // Returns whole-day difference (b − a), rounded.
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// Pure: given a list of events { eventType, opportunityId, createdAt },
// return three arrays of day-durations (one per metric). An opportunity
// only contributes if it has the required event pair; we use the
// FIRST occurrence of each event type per opp.
function computeDurationsFromEvents(events) {
  const byOpp = new Map();
  for (const e of events) {
    if (!byOpp.has(e.opportunityId)) byOpp.set(e.opportunityId, {});
    const seen = byOpp.get(e.opportunityId);
    if (!seen[e.eventType]) seen[e.eventType] = e.createdAt;
  }
  const submit = [];
  const response = [];
  const win = [];
  for (const seen of byOpp.values()) {
    if (seen.generated && seen.submitted) {
      const d = dayDiff(seen.generated, seen.submitted);
      if (d >= 0) submit.push(d);
    }
    if (seen.submitted && seen.response_received) {
      const d = dayDiff(seen.submitted, seen.response_received);
      if (d >= 0) response.push(d);
    }
    if (seen.submitted && seen.won) {
      const d = dayDiff(seen.submitted, seen.won);
      if (d >= 0) win.push(d);
    }
  }
  return { submit, response, win };
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  // Linear interpolation between adjacent ranks.
  return Number((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)).toFixed(2));
}

// Pure: turn an array of day-durations into a count + avg + median + p90.
// Empty arrays return all nulls (so the UI can show "no data yet").
function summarizeDurations(durations) {
  if (!Array.isArray(durations) || durations.length === 0) {
    return { count: 0, avg_days: null, median_days: null, p90_days: null };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  return {
    count: sorted.length,
    avg_days:    Math.round((sum / sorted.length) * 10) / 10,
    median_days: quantile(sorted, 0.5),
    p90_days:    quantile(sorted, 0.9),
  };
}

// Pure: count raw events by type for sample-size hints.
function countSampleSizes(events) {
  const out = { generated: 0, submitted: 0, response_received: 0, won: 0, lost: 0 };
  for (const e of events) {
    if (out[e.eventType] != null) out[e.eventType] += 1;
  }
  return out;
}

async function getVelocity({
  organizationId,
  userId = null,
  windowDays = DEFAULT_WINDOW_DAYS,
  now = new Date(),
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  const since = new Date(now.getTime() - windowDays * 86_400_000);

  let events = [];
  try {
    const rows = await OpportunityEvent.findAll({
      where: {
        eventType: { [Op.in]: ['generated', 'submitted', 'response_received', 'won', 'lost'] },
        createdAt: { [Op.gte]: since },
      },
      order: [['createdAt', 'ASC']],
      limit: 5000,
    });
    events = rows.map((r) => ({
      eventType: r.eventType,
      opportunityId: r.opportunityId,
      createdAt: r.createdAt,
    }));
  } catch (e) {
    logger.warn('velocity.getVelocity: events query failed (returning empty)', {
      error: e.message,
    });
  }

  const durations = computeDurationsFromEvents(events);
  return {
    organization_id: orgId,
    period: {
      start: since.toISOString(),
      end:   now.toISOString(),
      window_days: windowDays,
    },
    time_to_submit:   summarizeDurations(durations.submit),
    time_to_response: summarizeDurations(durations.response),
    time_to_win:      summarizeDurations(durations.win),
    sample_sizes: countSampleSizes(events),
    generated_at: now.toISOString(),
  };
}

module.exports = {
  getVelocity,
  computeDurationsFromEvents,
  summarizeDurations,
  countSampleSizes,
  quantile,
  dayDiff,
  DEFAULT_WINDOW_DAYS,
};
