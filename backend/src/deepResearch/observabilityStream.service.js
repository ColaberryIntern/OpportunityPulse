// Deep Research Phase 11 — real-time operational observability stream.
//
// Server-Sent Events (SSE) bus for pushing live state changes to the
// Governance Dashboard. Tenant-isolated, permission-aware, throttled.
//
// Architecture: a single in-process Set of active subscriber objects. Each
// subscriber has its own res, orgId, channels[], and last-event-id. The
// publish() entry point fans out to every subscriber that matches.
//
// Reconnect-safe: clients can include `?lastEventId=<n>` to replay events
// they missed during a brief disconnect (in-memory ring buffer; not
// durable across restarts — that's by design).

const crypto = require('crypto');
const { ObservabilityStream } = require('../models');
const logger = require('../logging/logger');

const VALID_CHANNELS = [
  'worker.state', 'queue.update', 'sla.alert',
  'readiness.change', 'draft.complete', 'package.assembled',
  'failure', 'governance.event', 'workflow.transition',
];

const MAX_SUBSCRIBERS = Number(process.env.DEEP_RESEARCH_SSE_MAX_SUBSCRIBERS) || 200;
const HEARTBEAT_INTERVAL_MS = 25_000;
const RING_BUFFER_SIZE = 100;
const MIN_EMIT_INTERVAL_MS = 250;  // basic per-channel throttle

const subscribers = new Set();
const ringBuffer = [];
let ringCounter = 0;
const lastEmitAt = {};
let heartbeatHandle = null;

function shortToken() {
  return crypto.randomBytes(12).toString('hex');
}

function ensureHeartbeat() {
  if (heartbeatHandle) return;
  heartbeatHandle = setInterval(() => {
    for (const sub of subscribers) {
      try {
        sub.res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      } catch (e) {
        // ignore — disconnect handler will clean up
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  if (heartbeatHandle.unref) heartbeatHandle.unref();
}

// Subscribe an Express response to the stream. Returns a teardown fn.
async function subscribe(req, res, {
  channels = [], organizationId = null, userId = null, userEmail = null,
  lastEventId = null,
} = {}) {
  if (subscribers.size >= MAX_SUBSCRIBERS) {
    res.status(503).json({ error: { message: 'Too many active streams' } });
    return null;
  }
  const channelSet = new Set(
    (Array.isArray(channels) && channels.length > 0
      ? channels.filter((c) => VALID_CHANNELS.includes(c))
      : VALID_CHANNELS.slice()),
  );

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders && res.flushHeaders();
  res.write('retry: 5000\n\n');

  const token = shortToken();
  const sub = {
    token, res, organizationId, channels: channelSet, lastEventId: Number(lastEventId) || 0,
    userId, userEmail, eventsSent: 0,
  };
  subscribers.add(sub);
  ensureHeartbeat();

  // Replay events the client missed.
  if (lastEventId != null) {
    const lastId = Number(lastEventId) || 0;
    for (const ev of ringBuffer) {
      if (ev.id > lastId && (organizationId == null || ev.organizationId === organizationId)
        && channelSet.has(ev.channel)) {
        try {
          sub.res.write(formatEvent(ev));
          sub.eventsSent += 1;
        } catch (e) { /* ignore */ }
      }
    }
  }

  // Register in DB for audit + observability.
  let streamRow = null;
  try {
    streamRow = await ObservabilityStream.create({
      organizationId, streamToken: token, userId, userEmail,
      channels: Array.from(channelSet),
      ipAddress: req.ip || (req.connection && req.connection.remoteAddress) || null,
    });
  } catch (e) { logger.warn('observabilityStream: db register failed', { error: e.message }); }

  const close = async () => {
    subscribers.delete(sub);
    try { sub.res.end(); } catch (e) { /* */ }
    if (streamRow) {
      try {
        streamRow.disconnectedAt = new Date();
        streamRow.eventsSent = sub.eventsSent;
        streamRow.lastEventAt = new Date();
        await streamRow.save();
      } catch (e) { /* */ }
    }
  };

  req.on('close', close);
  req.on('aborted', close);
  return close;
}

function formatEvent(ev) {
  const payload = JSON.stringify({
    id: ev.id,
    channel: ev.channel,
    organization_id: ev.organizationId,
    at: ev.at,
    body: ev.body,
  });
  return `id: ${ev.id}\nevent: ${ev.channel}\ndata: ${payload}\n\n`;
}

// Publish an event. Tenant-tagged. Throttled per channel.
function publish(channel, body, { organizationId = null } = {}) {
  if (!VALID_CHANNELS.includes(channel)) return false;
  const key = `${channel}:${organizationId || 'global'}`;
  const now = Date.now();
  if (lastEmitAt[key] && now - lastEmitAt[key] < MIN_EMIT_INTERVAL_MS) {
    return false;
  }
  lastEmitAt[key] = now;

  ringCounter += 1;
  const ev = {
    id: ringCounter,
    channel,
    organizationId,
    at: new Date().toISOString(),
    body,
  };
  ringBuffer.push(ev);
  if (ringBuffer.length > RING_BUFFER_SIZE) ringBuffer.shift();

  let delivered = 0;
  for (const sub of subscribers) {
    if (sub.organizationId != null && organizationId != null
      && sub.organizationId !== organizationId) continue;
    if (!sub.channels.has(channel)) continue;
    try {
      sub.res.write(formatEvent(ev));
      sub.eventsSent += 1;
      delivered += 1;
    } catch (e) {
      // dead socket — let the close handler clean up
    }
  }
  return delivered;
}

function activeStreams() {
  return Array.from(subscribers).map((s) => ({
    token: s.token, organization_id: s.organizationId,
    user_email: s.userEmail, channels: Array.from(s.channels),
    events_sent: s.eventsSent,
  }));
}

function summarize() {
  return {
    active: subscribers.size,
    max: MAX_SUBSCRIBERS,
    ring_buffer_size: ringBuffer.length,
    ring_buffer_max: RING_BUFFER_SIZE,
    heartbeat_ms: HEARTBEAT_INTERVAL_MS,
    valid_channels: VALID_CHANNELS,
  };
}

// Convenience publishers used by other Phase 10/11 services.
const publishers = {
  workerState: (body, opts) => publish('worker.state', body, opts),
  queueUpdate: (body, opts) => publish('queue.update', body, opts),
  slaAlert: (body, opts) => publish('sla.alert', body, opts),
  readinessChange: (body, opts) => publish('readiness.change', body, opts),
  draftComplete: (body, opts) => publish('draft.complete', body, opts),
  packageAssembled: (body, opts) => publish('package.assembled', body, opts),
  failure: (body, opts) => publish('failure', body, opts),
  governanceEvent: (body, opts) => publish('governance.event', body, opts),
  workflowTransition: (body, opts) => publish('workflow.transition', body, opts),
};

module.exports = {
  VALID_CHANNELS, MAX_SUBSCRIBERS, HEARTBEAT_INTERVAL_MS, RING_BUFFER_SIZE,
  subscribe, publish, publishers, activeStreams, summarize,
  // For tests only:
  _resetForTests: () => {
    subscribers.clear();
    ringBuffer.length = 0;
    ringCounter = 0;
    for (const k of Object.keys(lastEmitAt)) delete lastEmitAt[k];
    if (heartbeatHandle) { clearInterval(heartbeatHandle); heartbeatHandle = null; }
  },
};
