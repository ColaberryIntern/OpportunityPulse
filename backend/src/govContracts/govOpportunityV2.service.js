/**
 * Read model for /api/v2/gov-opportunities.
 *
 * READ-ONLY BY CONSTRUCTION. Nothing here creates canonical records, aliases,
 * families or snapshots — provisioning on a navigation read is how phantom
 * records get made. The ingestion writer owns all of that.
 *
 * ONE STATE DEFINITION
 * The SQL buckets below implement the SAME predicate as
 * deadlineEvidence.isVerificationCurrent:
 *
 *   verified  <=>  verified_at IS NOT NULL
 *                  AND (observed_at IS NULL OR observed_at <= verified_at)
 *
 * A divergence between query and mapper would let a verified-only page return
 * records the mapper then reports as unverified. A test asserts they agree row
 * for row.
 */

const { Op, literal } = require('sequelize');
const { toGovOpportunityV1, canonicalIdFor } = require('./govOpportunityV1.mapper');
const { readDeadlineState, OBSERVATION_OUTCOME } = require('../bonfire/deadlineEvidence.service');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

const DEADLINE_BUCKETS = {
  verified: 'verified',
  unverified: 'unverified',
  legacy_unverified: 'legacy_unverified',
  retained_unverified: 'retained_unverified',
  unknown: 'unknown',
  not_published: 'not_published',
  all: 'all',
};

/** Every query parameter this endpoint understands. Anything else is a 400. */
const SUPPORTED_LIST_PARAMS = ['limit', 'cursor', 'deadlineState', 'agency', 'updatedSince'];
const SUPPORTED_DETAIL_PARAMS = ['snapshotVersion'];

const encodeCursor = (id) => Buffer.from(String(id), 'utf8').toString('base64url');
const decodeCursor = (c) => {
  try {
    const v = Buffer.from(String(c), 'base64url').toString('utf8');
    return v || null;
  } catch (e) { return null; }
};

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

// Column-level expression of "the stored verification is still current".
const VERIFICATION_CURRENT = literal(
  '(close_date_observed_at IS NULL OR close_date_observed_at <= close_date_verified_at)',
);
const VERIFICATION_SUPERSEDED = literal(
  '(close_date_observed_at IS NOT NULL AND close_date_observed_at > close_date_verified_at)',
);

function bucketWhere(bucket) {
  switch (bucket) {
    case DEADLINE_BUCKETS.verified:
      return { closeDate: { [Op.ne]: null }, closeDateVerifiedAt: { [Op.ne]: null }, [Op.and]: [VERIFICATION_CURRENT] };
    case DEADLINE_BUCKETS.retained_unverified:
      return { closeDate: { [Op.ne]: null }, closeDateVerifiedAt: { [Op.ne]: null }, [Op.and]: [VERIFICATION_SUPERSEDED] };
    case DEADLINE_BUCKETS.legacy_unverified:
      return { closeDate: { [Op.ne]: null }, closeDateVerifiedAt: null };
    case DEADLINE_BUCKETS.not_published:
      // ONLY an affirmed absence. Unknown capture is not absence.
      return { closeDateObservationOutcome: OBSERVATION_OUTCOME.ABSENT_CONFIRMED };
    case DEADLINE_BUCKETS.unknown:
      return {
        closeDate: null,
        closeDateVerifiedAt: null,
        closeDateObservationOutcome: { [Op.or]: [null, { [Op.ne]: OBSERVATION_OUTCOME.ABSENT_CONFIRMED }] },
      };
    case DEADLINE_BUCKETS.unverified:
      return {
        [Op.or]: [
          { closeDate: { [Op.ne]: null }, closeDateVerifiedAt: null },
          { closeDate: { [Op.ne]: null }, closeDateVerifiedAt: { [Op.ne]: null }, [Op.and]: [VERIFICATION_SUPERSEDED] },
          { closeDate: null, closeDateVerifiedAt: null },
        ],
      };
    case DEADLINE_BUCKETS.all:
    default:
      return {};
  }
}

/** Load persisted identity, WITHOUT creating any. */
async function loadIdentities(models, rowIds) {
  const { GovCanonicalOpportunity, GovSourceAlias } = models;
  if (!GovCanonicalOpportunity || !GovSourceAlias || !rowIds.length) return new Map();

  const aliases = await GovSourceAlias.findAll({
    where: { idType: 'bonfire_opportunity_id', idValue: { [Op.in]: rowIds.map(String) } },
  });
  if (!aliases.length) return new Map();

  const canonicalIds = [...new Set(aliases.map((a) => a.canonicalId))];
  const canon = await GovCanonicalOpportunity.findAll({ where: { canonicalId: { [Op.in]: canonicalIds } } });
  const canonById = new Map(canon.map((c) => [c.canonicalId, c]));

  const allAliases = await GovSourceAlias.findAll({ where: { canonicalId: { [Op.in]: canonicalIds } } });
  const byCanonical = new Map();
  for (const a of allAliases) {
    if (!byCanonical.has(a.canonicalId)) byCanonical.set(a.canonicalId, []);
    byCanonical.get(a.canonicalId).push(a);
  }

  const out = new Map();
  for (const a of aliases) {
    const c = canonById.get(a.canonicalId);
    out.set(String(a.idValue), {
      canonicalId: a.canonicalId,
      canonicalPublicId: c ? c.canonicalPublicId : null,
      sourceSnapshotVersion: c ? c.sourceSnapshotVersion : 1,
      aliases: (byCanonical.get(a.canonicalId) || []).map((x) => ({
        idType: x.idType, idValue: x.idValue, observedAt: x.observedAt, note: x.note,
      })),
    });
  }
  return out;
}

/**
 * Source availability across the WHOLE corpus, not the page.
 *
 * A filtered page can be empty while a source is down; reporting health from
 * page-local rows would then say "all well" precisely when it is not.
 */
async function sourceAvailability(models) {
  const { BonfireOpportunity } = models;
  if (!BonfireOpportunity || typeof BonfireOpportunity.findAll !== 'function') return [];

  const failing = await BonfireOpportunity.findAll({
    where: { closeDateFetchStatus: 'failed' },
    attributes: ['closeDateFetchAttemptedAt', 'closeDateFetchError'],
    order: [['closeDateFetchAttemptedAt', 'ASC']],
    limit: 500,
  });
  if (!failing.length) {
    return [{
      sourceSystem: 'bonfire', status: 'available', since: null, affectedRecords: 0, note: null,
    }];
  }
  const first = failing[0].closeDateFetchAttemptedAt || null;
  return [{
    sourceSystem: 'bonfire',
    status: 'degraded',
    since: first ? new Date(first).toISOString() : null,
    affectedRecords: failing.length,
    note: 'Records with a failed last fetch hold last-known values, not current ones. '
      + 'This is corpus-wide and is reported even when the current page is empty.',
  }];
}

async function listGovOpportunities(models, query = {}) {
  const { BonfireOpportunity } = models;
  const limit = clampLimit(query.limit);
  const bucket = DEADLINE_BUCKETS[query.deadlineState] || DEADLINE_BUCKETS.all;

  const base = bucketWhere(bucket);
  const where = { ...base };
  const extraAnd = Array.isArray(base[Op.and]) ? [...base[Op.and]] : [];

  if (query.agency) where.agency = { [Op.iLike]: `%${query.agency}%` };
  if (query.updatedSince) {
    const since = new Date(query.updatedSince);
    if (!Number.isNaN(since.getTime())) where.updatedAt = { [Op.gte]: since };
  }
  if (query.cursor) {
    const after = decodeCursor(query.cursor);
    if (after) where.id = { [Op.gt]: after };
  }
  if (extraAnd.length) where[Op.and] = extraAnd;

  const rows = await BonfireOpportunity.findAll({
    where, order: [['id', 'ASC']], limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const plain = page.map((r) => (r.get ? r.get({ plain: true }) : r));
  const identities = await loadIdentities(models, plain.map((r) => r.id));

  const data = [];
  const diagnostics = [];
  for (const row of plain) {
    const identity = identities.get(String(row.id)) || {};
    const { envelope, diagnostics: dg } = toGovOpportunityV1(row, identity);
    data.push(envelope);
    diagnostics.push(dg);
  }

  return {
    data,
    diagnostics,
    pagination: {
      cursor: hasMore && page.length ? encodeCursor(page[page.length - 1].id) : null,
      hasMore,
      limit,
    },
    meta: {
      schemaVersion: 'gov-opportunity.v1',
      generatedAt: new Date().toISOString(),
      deadlineState: bucket,
      // Corpus-wide, deliberately independent of what this page contains.
      sourceAvailability: await sourceAvailability(models),
    },
  };
}

/**
 * Resolve by INDEX where identity is persisted, falling back to the derived id
 * only for rows ingestion has not reached yet. The derived and persisted ids
 * are equal by construction (see govIngestion.resolveOrCreateIdentity), so an
 * id handed out before ingestion still resolves after it.
 */
async function resolveCanonical(models, canonicalPublicId) {
  const { BonfireOpportunity, GovCanonicalOpportunity, GovSourceAlias } = models;

  if (GovCanonicalOpportunity && GovSourceAlias) {
    const canonical = await GovCanonicalOpportunity.findOne({
      where: { canonicalPublicId }, // unique index
    });
    if (canonical) {
      const primary = await GovSourceAlias.findOne({
        where: { canonicalId: canonical.canonicalId, idType: 'bonfire_opportunity_id' },
      });
      if (primary) {
        const row = await BonfireOpportunity.findByPk(primary.idValue);
        if (row) return { row, canonical };
      }
    }
  }

  // Not yet ingested: fall back to the deterministic derivation.
  const ids = await BonfireOpportunity.findAll({ attributes: ['id'] });
  const match = ids.find((r) => canonicalIdFor(r.id) === canonicalPublicId);
  if (!match) return null;
  const row = await BonfireOpportunity.findByPk(match.id);
  return row ? { row, canonical: null } : null;
}

async function getGovOpportunity(models, canonicalPublicId) {
  const found = await resolveCanonical(models, canonicalPublicId);
  if (!found) return null;
  const row = found.row.get ? found.row.get({ plain: true }) : found.row;
  const identities = await loadIdentities(models, [row.id]);
  const { envelope, diagnostics } = toGovOpportunityV1(row, identities.get(String(row.id)) || {});
  return { data: envelope, diagnostics, canonical: found.canonical };
}

/** Snapshot history (metadata only). */
async function listSnapshots(models, canonicalUuid) {
  const { GovSourceSnapshot } = models;
  if (!GovSourceSnapshot || !canonicalUuid) return [];
  const snaps = await GovSourceSnapshot.findAll({
    where: { canonicalId: canonicalUuid },
    order: [['sourceSnapshotVersion', 'ASC']],
  });
  return snaps.map((s) => ({
    version: s.sourceSnapshotVersion,
    observedAt: s.observedAt ? new Date(s.observedAt).toISOString() : null,
    fetchAttemptedAt: s.fetchAttemptedAt ? new Date(s.fetchAttemptedAt).toISOString() : null,
    fetchStatus: s.fetchStatus,
    contentHash: s.contentHash,
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
  }));
}

/** EXACT version retrieval, including the immutable payload. */
async function getSnapshot(models, canonicalUuid, version) {
  const { GovSourceSnapshot } = models;
  if (!GovSourceSnapshot || !canonicalUuid) return null;
  const snap = await GovSourceSnapshot.findOne({
    where: { canonicalId: canonicalUuid, sourceSnapshotVersion: version },
  });
  if (!snap) return null;
  return {
    version: snap.sourceSnapshotVersion,
    observedAt: snap.observedAt ? new Date(snap.observedAt).toISOString() : null,
    fetchAttemptedAt: snap.fetchAttemptedAt ? new Date(snap.fetchAttemptedAt).toISOString() : null,
    fetchStatus: snap.fetchStatus,
    fetchError: snap.fetchError || null,
    contentHash: snap.contentHash,
    payload: snap.payload,
    createdAt: snap.createdAt ? new Date(snap.createdAt).toISOString() : null,
  };
}

module.exports = {
  listGovOpportunities,
  getGovOpportunity,
  resolveCanonical,
  listSnapshots,
  getSnapshot,
  loadIdentities,
  DEADLINE_BUCKETS,
  SUPPORTED_LIST_PARAMS,
  SUPPORTED_DETAIL_PARAMS,
  bucketWhere,
  clampLimit,
  encodeCursor,
  decodeCursor,
  sourceAvailability,
  readDeadlineState,
  MAX_LIMIT,
  DEFAULT_LIMIT,
};
