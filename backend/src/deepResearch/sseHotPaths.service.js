// Deep Research Phase 12 — SSE hot-path publish wiring + metrics.
//
// Wires the Phase 11 observabilityStream.publishers helpers into the
// Phase 10 services that have not been wired yet (worker state, queue
// updates, draft completion, package assembly, failures). Soft-fails
// every publish so the worker can never be broken by an SSE error.
//
// Also captures periodic StreamMetric snapshots so the dashboard can
// chart throughput.

const { StreamMetric } = require('../models');
const observabilityStream = require('./observabilityStream.service');
const logger = require('../logging/logger');

// Per-channel counters reset on snapshot.
const counters = {};

function bumpCounter(channel, key, n = 1) {
  if (!counters[channel]) counters[channel] = { published: 0, throttled: 0 };
  counters[channel][key] = (counters[channel][key] || 0) + n;
}

// Wrappers that count + publish. Use these from Phase 10 services.
const publish = {
  workerState(body, opts) {
    const ok = observabilityStream.publishers.workerState(body, opts);
    bumpCounter('worker.state', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  queueUpdate(body, opts) {
    const ok = observabilityStream.publishers.queueUpdate(body, opts);
    bumpCounter('queue.update', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  draftComplete(body, opts) {
    const ok = observabilityStream.publishers.draftComplete(body, opts);
    bumpCounter('draft.complete', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  packageAssembled(body, opts) {
    const ok = observabilityStream.publishers.packageAssembled(body, opts);
    bumpCounter('package.assembled', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  failure(body, opts) {
    const ok = observabilityStream.publishers.failure(body, opts);
    bumpCounter('failure', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  readinessChange(body, opts) {
    const ok = observabilityStream.publishers.readinessChange(body, opts);
    bumpCounter('readiness.change', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  governanceEvent(body, opts) {
    const ok = observabilityStream.publishers.governanceEvent(body, opts);
    bumpCounter('governance.event', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  workflowTransition(body, opts) {
    const ok = observabilityStream.publishers.workflowTransition(body, opts);
    bumpCounter('workflow.transition', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
  slaAlert(body, opts) {
    const ok = observabilityStream.publishers.slaAlert(body, opts);
    bumpCounter('sla.alert', ok === false ? 'throttled' : 'published', 1);
    return ok;
  },
};

// Snapshot the current counters to stream_metrics. Resets counters
// afterwards. Called periodically by a scheduler or on-demand by the dashboard.
async function snapshotMetrics({ organizationId = null, windowMinutes = 5 } = {}) {
  const summary = observabilityStream.summarize();
  const activeSubscribers = summary.active || 0;
  const rows = [];
  const channels = Object.keys(counters);
  for (const channel of channels) {
    const c = counters[channel];
    try {
      // eslint-disable-next-line no-await-in-loop
      const row = await StreamMetric.create({
        organizationId,
        channel,
        windowMinutes,
        eventsPublished: c.published || 0,
        eventsThrottled: c.throttled || 0,
        activeSubscribers,
        metadata: {},
      });
      rows.push(row.toJSON());
    } catch (e) {
      logger.warn('sseHotPaths.snapshot failed', { channel, error: e.message });
    }
  }
  // Reset counters.
  for (const k of channels) {
    counters[k] = { published: 0, throttled: 0 };
  }
  return { captured: rows.length, snapshots: rows };
}

async function recentMetrics({ organizationId = null, channel = null, limit = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (channel) where.channel = channel;
  const rows = await StreamMetric.findAll({
    where, order: [['captured_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 30),
  });
  return rows.map((r) => r.toJSON());
}

function summarize() {
  const out = {};
  for (const [channel, c] of Object.entries(counters)) {
    out[channel] = { ...c };
  }
  return {
    in_memory: out,
    valid_channels: observabilityStream.VALID_CHANNELS,
  };
}

module.exports = {
  publish, snapshotMetrics, recentMetrics, summarize,
  // for tests:
  _resetCounters: () => { for (const k of Object.keys(counters)) delete counters[k]; },
};
