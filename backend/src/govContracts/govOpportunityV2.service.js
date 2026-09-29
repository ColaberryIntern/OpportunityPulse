/**
 * Read model for /api/v2/gov-opportunities.
 *
 * READ-ONLY BY CONSTRUCTION. Nothing here creates canonical records, aliases,
 * families or snapshots. When an opportunity has no persisted canonical identity
 * yet (the common case, since Phase 2 ships without a backfill) a deterministic
 * opaque id is DERIVED from the row's primary key. Deriving is stable and
 * repeatable; provisioning on a navigation read is how phantom records get made.
 */

const { Op } = require('sequelize');
const { toGovOpportunityV1 } = require('./govOpportunityV1.mapper');
const { EFFECTIVE_STATE, readDeadlineState } = require('../bonfire/deadlineEvidence.service');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

/**
 * Deadline buckets a consumer can ask for.
 *
 * `legacy_unverified` and `retained_unverified` exist so Enterprise cannot
 * silently lose these records: they are excluded from `verified` but remain
 * addressable, which is the whole point of the bucket.
 */
const DEADLINE_BUCKETS = {
  verified: 'verified',
  unverified: 'unverified', // legacy_unverified + retained_unverified + unknown
  legacy_unverified: 'legacy_unverified',
  retained_unverified: 'retained_unverified',
  unknown: 'unknown',
  not_published: 'not_published',
  all: 'all',
};

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

/**
 * Bucket -> WHERE fragment.
 *
 * NOTE the legacy rule: close_date IS NOT NULL AND close_date_verified_at IS
 * NULL is UNVERIFIED regardless of whether uncertainty is NULL. Absence of a
 * recorded parse failure is not evidence of verification.
 */
function bucketWhere(bucket) {
  switch (bucket) {
    case DEADLINE_BUCKETS.verified:
      return { closeDateVerifiedAt: { [Op.ne]: null }, closeDateUncertainty: null };
    case DEADLINE_BUCKETS.legacy_unverified:
      return { closeDate: { [Op.ne]: null }, closeDateVerifiedAt: null };
    case DEADLINE_BUCKETS.retained_unverified:
      return { closeDateVerifiedAt: { [Op.ne]: null }, closeDateUncertainty: { [Op.ne]: null } };
    case DEADLINE_BUCKETS.not_published:
      return { closeDateSourceState: 'not_published' };
    case DEADLINE_BUCKETS.unknown:
      return { closeDate: null, closeDateVerifiedAt: null };
    case DEADLINE_BUCKETS.unverified:
      return {
        [Op.or]: [
          { closeDate: { [Op.ne]: null }, closeDateVerifiedAt: null },
          { closeDateVerifiedAt: { [Op.ne]: null }, closeDateUncertainty: { [Op.ne]: null } },
          { closeDate: null, closeDateVerifiedAt: null },
        ],
      };
    case DEADLINE_BUCKETS.all:
    default:
      return {};
  }
}

/** Load persisted identity for a set of rows, WITHOUT creating any. */
async function loadIdentities(models, rowIds) {
  const { GovCanonicalOpportunity, GovSourceAlias } = models;
  if (!GovCanonicalOpportunity || !rowIds.length) return new Map();

  const aliases = await GovSourceAlias.findAll({
    where: { idType: 'bonfire_opportunity_id', idValue: { [Op.in]: rowIds.map(String) } },
  });
  if (!aliases.length) return new Map();

  const canonicalIds = [...new Set(aliases.map((a) => a.canonicalId))];
  const canon = await GovCanonicalOpportunity.findAll({ where: { canonicalId: { [Op.in]: canonicalIds } } });
  const canonById = new Map(canon.map((c) => [c.canonicalId, c]));

  const allAliases = await GovSourceAlias.findAll({ where: { canonicalId: { [Op.in]: canonicalIds } } });
  const aliasesByCanonical = new Map();
  for (const a of allAliases) {
    if (!aliasesByCanonical.has(a.canonicalId)) aliasesByCanonical.set(a.canonicalId, []);
    aliasesByCanonical.get(a.canonicalId).push(a);
  }

  const out = new Map();
  for (const a of aliases) {
    const c = canonById.get(a.canonicalId);
    out.set(String(a.idValue), {
      canonicalId: a.canonicalId,
      sourceSnapshotVersion: c ? c.sourceSnapshotVersion : 1,
      aliases: (aliasesByCanonical.get(a.canonicalId) || []).map((x) => ({
        idType: x.idType, idValue: x.idValue, observedAt: x.observedAt, note: x.note,
      })),
    });
  }
  return out;
}

/** Aggregate source availability across the returned page. */
function sourceAvailability(rows) {
  const failed = rows.filter((r) => r.closeDateFetchStatus === 'failed');
  if (!failed.length) return [];
  const oldest = failed
    .map((r) => r.closeDateFetchAttemptedAt)
    .filter(Boolean)
    .sort()[0] || null;
  return [{
    sourceSystem: 'bonfire',
    status: 'degraded',
    since: oldest ? new Date(oldest).toISOString() : null,
    affectedInPage: failed.length,
    note: 'One or more records in this page have a failed last fetch; their stored values are last-known, not current.',
  }];
}

async function listGovOpportunities(models, query = {}) {
  const { BonfireOpportunity } = models;
  const limit = clampLimit(query.limit);
  const bucket = DEADLINE_BUCKETS[query.deadlineState] || DEADLINE_BUCKETS.all;

  const where = { ...bucketWhere(bucket) };
  if (query.agency) where.agency = { [Op.iLike]: `%${query.agency}%` };
  if (query.cursor) {
    const after = decodeCursor(query.cursor);
    if (after) where.id = { [Op.gt]: after };
  }

  // Stable total-order cursor pagination. Offset paging would skip or repeat
  // rows while a scrape is inserting underneath the reader.
  const rows = await BonfireOpportunity.findAll({
    where,
    order: [['id', 'ASC']],
    limit: limit + 1, // one extra to detect hasMore without a second query
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const plain = page.map((r) => (r.get ? r.get({ plain: true }) : r));

  const identities = await loadIdentities(models, plain.map((r) => r.id));

  const data = [];
  const diagnostics = [];
  for (const row of plain) {
    const identity = identities.get(String(row.id)) || {};
    const { envelope, diagnostics: d } = toGovOpportunityV1(row, identity);
    data.push(envelope);
    diagnostics.push(d);
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
      sourceAvailability: sourceAvailability(plain),
    },
  };
}

async function getGovOpportunity(models, canonicalOpportunityId) {
  const { BonfireOpportunity } = models;
  const { canonicalIdFor } = require('./govOpportunityV1.mapper');

  // The public id is an opaque hash, so resolve by scanning candidate rows'
  // derived ids. Phase 2 keeps this simple and correct; a persisted reverse
  // index is a follow-up once identities are backfilled by ingestion.
  const rows = await BonfireOpportunity.findAll({ attributes: ['id'] });
  const match = rows.find((r) => canonicalIdFor(r.id) === canonicalOpportunityId);
  if (!match) return null;

  const full = await BonfireOpportunity.findByPk(match.id);
  if (!full) return null;
  const row = full.get ? full.get({ plain: true }) : full;
  const identities = await loadIdentities(models, [row.id]);
  const { envelope, diagnostics } = toGovOpportunityV1(row, identities.get(String(row.id)) || {});
  return { data: envelope, diagnostics };
}

/** Immutable snapshot history for a canonical record. */
async function listSnapshots(models, canonicalUuid) {
  const { GovSourceSnapshot } = models;
  if (!GovSourceSnapshot) return [];
  const snaps = await GovSourceSnapshot.findAll({
    where: { canonicalId: canonicalUuid },
    order: [['sourceSnapshotVersion', 'ASC']],
    attributes: ['sourceSnapshotVersion', 'observedAt', 'fetchAttemptedAt', 'fetchStatus', 'contentHash', 'createdAt'],
  });
  return snaps.map((s) => ({
    version: s.sourceSnapshotVersion,
    observedAt: s.observedAt ? new Date(s.observedAt).toISOString() : null,
    fetchAttemptedAt: s.fetchAttemptedAt ? new Date(s.fetchAttemptedAt).toISOString() : null,
    fetchStatus: s.fetchStatus,
    contentHash: s.contentHash,
    createdAt: new Date(s.createdAt).toISOString(),
  }));
}

module.exports = {
  listGovOpportunities,
  getGovOpportunity,
  listSnapshots,
  DEADLINE_BUCKETS,
  bucketWhere,
  clampLimit,
  encodeCursor,
  decodeCursor,
  sourceAvailability,
  MAX_LIMIT,
  DEFAULT_LIMIT,
};
