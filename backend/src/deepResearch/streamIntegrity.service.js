// Deep Research Phase 13 — SSE reliability + stream integrity.
//
// Wraps the Phase 11 observabilityStream summary with persistence to
// stream_integrity. Tracks heartbeats, dropped events, duplicate
// suppression, reconnect counts, peak concurrency, and backpressure %.
//
// IMPORTANT: pure measurement layer. Does not modify the stream itself.

const { Op } = require('sequelize');
const { StreamIntegrity } = require('../models');
const observabilityStream = require('./observabilityStream.service');

// In-memory counters keyed by org, reset on snapshot.
const counters = {};
let peakConcurrent = 0;

function key(orgId) {
  return orgId == null ? '__global__' : String(orgId);
}

function ensure(orgId) {
  const k = key(orgId);
  if (!counters[k]) {
    counters[k] = {
      heartbeats: 0, published: 0, dropped: 0,
      duplicate_suppressed: 0, reconnects: 0,
    };
  }
  return counters[k];
}

function recordHeartbeat({ organizationId = null } = {}) { ensure(organizationId).heartbeats += 1; }
function recordPublished({ organizationId = null, n = 1 } = {}) { ensure(organizationId).published += Number(n) || 1; }
function recordDropped({ organizationId = null, n = 1 } = {}) { ensure(organizationId).dropped += Number(n) || 1; }
function recordDuplicate({ organizationId = null, n = 1 } = {}) { ensure(organizationId).duplicate_suppressed += Number(n) || 1; }
function recordReconnect({ organizationId = null } = {}) { ensure(organizationId).reconnects += 1; }

function trackConcurrent(currentActive) {
  if (Number(currentActive) > peakConcurrent) peakConcurrent = Number(currentActive);
}

async function snapshot({ organizationId = null, windowMinutes = 5 } = {}) {
  const stream = observabilityStream.summarize();
  const active = stream.active || 0;
  trackConcurrent(active);
  const k = key(organizationId);
  const c = counters[k] || { heartbeats: 0, published: 0, dropped: 0, duplicate_suppressed: 0, reconnects: 0 };
  const totalAttempts = c.published + c.dropped;
  const backpressurePct = totalAttempts > 0 ? Math.round((c.dropped / totalAttempts) * 10000) / 100 : 0;
  const row = await StreamIntegrity.create({
    organizationId: organizationId == null ? null : Number(organizationId),
    windowMinutes,
    heartbeatsEmitted: c.heartbeats,
    eventsPublished: c.published,
    eventsDropped: c.dropped,
    duplicateSuppressed: c.duplicate_suppressed,
    reconnectCount: c.reconnects,
    maxConcurrent: peakConcurrent,
    backpressurePct,
    metadata: { active_at_snapshot: active, ring_buffer_size: stream.ring_buffer_size },
  });
  // Reset counters after snapshot.
  counters[k] = { heartbeats: 0, published: 0, dropped: 0, duplicate_suppressed: 0, reconnects: 0 };
  peakConcurrent = active;
  return row.toJSON();
}

async function summarize({ organizationId = null, sinceMinutes = 60 } = {}) {
  const since = new Date(Date.now() - Number(sinceMinutes) * 60_000);
  const where = { capturedAt: { [Op.gte]: since } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await StreamIntegrity.findAll({
    where, order: [['captured_at', 'DESC']], limit: 200,
  });
  const totals = rows.reduce((acc, r) => {
    acc.heartbeats += r.heartbeatsEmitted;
    acc.published += r.eventsPublished;
    acc.dropped += r.eventsDropped;
    acc.duplicate_suppressed += r.duplicateSuppressed;
    acc.reconnects += r.reconnectCount;
    acc.peak_concurrent = Math.max(acc.peak_concurrent, r.maxConcurrent);
    return acc;
  }, { heartbeats: 0, published: 0, dropped: 0, duplicate_suppressed: 0, reconnects: 0, peak_concurrent: 0 });
  // Integrity score: 100 - backpressure penalty - dup penalty.
  const totalAttempts = totals.published + totals.dropped;
  const dropPct = totalAttempts > 0 ? totals.dropped / totalAttempts : 0;
  let score = 100;
  score -= Math.round(dropPct * 100);
  score = Math.max(0, score);
  return {
    window_minutes: sinceMinutes, snapshots: rows.length,
    totals, drop_rate_pct: Math.round(dropPct * 10000) / 100,
    integrity_score: score,
    in_memory: counters[key(organizationId)] || null,
    live: observabilityStream.summarize(),
  };
}

async function recentSnapshots({ organizationId = null, limit = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await StreamIntegrity.findAll({
    where, order: [['captured_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 30),
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  recordHeartbeat, recordPublished, recordDropped, recordDuplicate,
  recordReconnect, trackConcurrent,
  snapshot, summarize, recentSnapshots,
  _resetCounters: () => { for (const k of Object.keys(counters)) delete counters[k]; peakConcurrent = 0; },
};
