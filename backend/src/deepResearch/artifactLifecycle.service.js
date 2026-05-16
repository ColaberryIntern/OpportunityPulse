// Deep Research Phase 10 — artifact lifecycle automation.
//
// Builds on Phase 9's proposalArtifact.refreshExpirationStatuses by adding
// (a) an append-only artifact_lifecycle_events log so changes are auditable,
// (b) renewal/replacement recommendations, (c) a nightly scheduler hook.
//
// MEASURE-ONLY. Recommends; never auto-deletes or auto-renews artifacts.

const { Op } = require('sequelize');
const {
  ProposalArtifact, ArtifactLifecycleEvent,
} = require('../models');
const logger = require('../logging/logger');

const VALID_EVENT_KINDS = [
  'created', 'used', 'expiring', 'expired', 'renewed', 'archived',
];

const EXPIRING_WINDOW_DAYS = 30;

async function recordEvent({ proposalArtifactId, eventKind, detail = null, metadata = {} }) {
  if (!VALID_EVENT_KINDS.includes(eventKind)) {
    const err = new Error(`Invalid event_kind: ${eventKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await ArtifactLifecycleEvent.create({
    proposalArtifactId, eventKind, detail, metadata,
  });
  return row.toJSON();
}

// Scan artifacts. Flip expiring/expired statuses + record lifecycle events.
async function runNightlyScan() {
  const now = Date.now();
  const soon = now + EXPIRING_WINDOW_DAYS * 86400_000;
  const t0 = Date.now();

  const candidates = await ProposalArtifact.findAll({
    where: {
      status: { [Op.in]: ['active', 'expiring'] },
      expiresAt: { [Op.ne]: null },
    },
  });
  let flippedToExpired = 0;
  let flippedToExpiring = 0;
  for (const a of candidates) {
    const exp = new Date(a.expiresAt).getTime();
    if (exp < now && a.status !== 'expired') {
      // eslint-disable-next-line no-await-in-loop
      await a.update({ status: 'expired' });
      // eslint-disable-next-line no-await-in-loop
      await recordEvent({
        proposalArtifactId: a.id,
        eventKind: 'expired',
        detail: `Artifact "${a.label}" expired on ${a.expiresAt}`,
      });
      flippedToExpired += 1;
    } else if (exp >= now && exp < soon && a.status !== 'expiring') {
      // eslint-disable-next-line no-await-in-loop
      await a.update({ status: 'expiring' });
      // eslint-disable-next-line no-await-in-loop
      await recordEvent({
        proposalArtifactId: a.id,
        eventKind: 'expiring',
        detail: `Artifact "${a.label}" expires within ${EXPIRING_WINDOW_DAYS} days`,
        metadata: { expires_at: a.expiresAt },
      });
      flippedToExpiring += 1;
    }
  }
  logger.info('artifactLifecycle: nightly scan complete', {
    duration_ms: Date.now() - t0,
    flipped_to_expired: flippedToExpired,
    flipped_to_expiring: flippedToExpiring,
  });
  return {
    duration_ms: Date.now() - t0,
    flipped_to_expired: flippedToExpired,
    flipped_to_expiring: flippedToExpiring,
    scanned: candidates.length,
  };
}

// Recommend renewal/replacement for the operator. Doesn't auto-act.
async function recommendRenewals() {
  const now = Date.now();
  const soon = now + EXPIRING_WINDOW_DAYS * 86400_000;
  const expiring = await ProposalArtifact.findAll({
    where: {
      status: { [Op.in]: ['expiring', 'expired'] },
    },
    order: [['expires_at', 'ASC NULLS LAST']],
    limit: 50,
  });
  return expiring.map((a) => {
    const j = a.toJSON();
    const expiresAt = j.expiresAt ? new Date(j.expiresAt).getTime() : null;
    const isExpired = expiresAt != null && expiresAt < now;
    const isExpiringSoon = expiresAt != null && expiresAt >= now && expiresAt < soon;
    return {
      artifact_id: j.id,
      kind: j.artifactKind,
      label: j.label,
      expires_at: j.expiresAt,
      status: j.status,
      recommendation: isExpired
        ? `Replace expired ${j.artifactKind}: "${j.label}".`
        : isExpiringSoon
          ? `Renew ${j.artifactKind}: "${j.label}" (expires ${j.expiresAt}).`
          : `Review ${j.artifactKind}: "${j.label}".`,
      times_used: j.timesUsed,
    };
  });
}

async function listEventsForArtifact(proposalArtifactId, { limit = 50 } = {}) {
  const rows = await ArtifactLifecycleEvent.findAll({
    where: { proposalArtifactId: Number(proposalArtifactId) },
    order: [['created_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 50),
  });
  return rows.map((r) => r.toJSON());
}

async function summarize() {
  const [total, active, expiring, expired, archived] = await Promise.all([
    ProposalArtifact.count(),
    ProposalArtifact.count({ where: { status: 'active' } }),
    ProposalArtifact.count({ where: { status: 'expiring' } }),
    ProposalArtifact.count({ where: { status: 'expired' } }),
    ProposalArtifact.count({ where: { status: 'archived' } }),
  ]);
  const recentEvents = await ArtifactLifecycleEvent.count({
    where: { createdAt: { [Op.gt]: new Date(Date.now() - 7 * 86400_000) } },
  });
  return {
    total, active, expiring, expired, archived,
    events_last_7d: recentEvents,
    health_pct: total > 0 ? Math.round(((active + expiring * 0.5) / total) * 100) : 0,
  };
}

module.exports = {
  VALID_EVENT_KINDS, EXPIRING_WINDOW_DAYS,
  recordEvent, runNightlyScan, recommendRenewals,
  listEventsForArtifact, summarize,
};
