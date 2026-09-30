const { Op } = require('sequelize');
const {
  sequelize,
  BonfireOpportunity,
  BonfireOpportunityTag,
  BonfireStrategicOpportunity,
} = require('../models');
const logger = require('../logging/logger');
const { validateRow, parseCsv, parseJsonArray } = require('./bonfire.util');
const { enrichOpportunity, generateStrategy } = require('./bonfireAI.service');

// Value brackets MUST mirror bonfireStrategist.service.valueBracket() exactly,
// so the matching key we derive here lines up with how clusters were formed.
// cents -> { bracket, range } where range is the inclusive lower bound and
// exclusive upper bound in CENTS, or null for unbounded sides.
function valueBracketBoundsFromCents(cents) {
  if (cents == null) return { bracket: 'unknown', lo: null, hi: null };
  const usd = cents / 100;
  if (usd < 250_000)   return { bracket: 'sub-250k', lo: 0,            hi: 25_000_000 };
  if (usd < 1_000_000) return { bracket: '250k-1m',  lo: 25_000_000,   hi: 100_000_000 };
  if (usd < 5_000_000) return { bracket: '1m-5m',    lo: 100_000_000,  hi: 500_000_000 };
  return                       { bracket: '5m+',     lo: 500_000_000,  hi: null };
}

// -------- queries --------

// Resolve the (aiCategory, value-bracket) signature that a strategic
// recommendation was built from. Returns { sourceIds, aiCategory, bracket }
// or null when the rec / its source opps cannot be located.
//
// All opps inside a cluster share the same key by construction (see
// bonfireStrategist.clusterCandidates), so reading the first surviving
// source opp is sufficient.
async function resolveClusterMatchKey(strategicRecId) {
  if (!strategicRecId || !BonfireStrategicOpportunity) return null;
  const rec = await BonfireStrategicOpportunity.findByPk(strategicRecId);
  if (!rec) return null;
  const sourceIds = Array.isArray(rec.sourceOpportunityIds) ? rec.sourceOpportunityIds : [];
  if (!sourceIds.length) {
    return {
      rec, sourceIds: [],
      aiCategory: null, bracket: 'unknown', lo: null, hi: null,
    };
  }
  // Find ANY surviving source opp — closed/deleted ones get skipped.
  const seed = await BonfireOpportunity.findOne({
    where: { id: { [Op.in]: sourceIds } },
    attributes: ['id', 'aiCategory', 'estimatedValue'],
    order: [['createdAt', 'DESC']],
  });
  if (!seed) {
    return { rec, sourceIds, aiCategory: null, bracket: 'unknown', lo: null, hi: null };
  }
  const { bracket, lo, hi } = valueBracketBoundsFromCents(seed.estimatedValue);
  return {
    rec, sourceIds,
    aiCategory: seed.aiCategory || 'Other',
    bracket, lo, hi,
  };
}

async function listOpportunities(filters = {}) {
  const {
    agency,
    category,
    minScore,
    maxScore,
    closeBefore,
    highAiFit,
    q,
    // Drilldown from the Strategic Opportunities cluster drawer:
    // load all opps that built this strategic recommendation PLUS any newly-
    // ingested opps that match the same (aiCategory, value-bracket) signature.
    // Closed/awarded opps drop unless the user is actively pursuing them
    // (existing includeExpired=false default does this).
    fromCluster,
    limit = 50,
    offset = 0,
    order = 'priority_desc',
    // v0.11 — by default, hide opps whose close_date is in the past UNLESS
    // the user is actively pursuing them. Ali's request: "don't show me
    // expired contracts unless I've already started working on them."
    // Pass includeExpired=true to opt in to the full historical list.
    includeExpired = false,
  } = filters;

  // fromCluster path: resolve sourceIds + match key BEFORE building the where,
  // so we can OR them into the same clause. Sourced and matched ids both go
  // through the normal active-filter so closed bids drop off as expected.
  let clusterContext = null;
  if (fromCluster) {
    clusterContext = await resolveClusterMatchKey(fromCluster);
    if (!clusterContext) {
      // Unknown cluster id — degrade gracefully: empty result, no crash.
      return {
        rows: [],
        total: 0,
        clusterContext: { error: 'not_found', strategicRecId: fromCluster },
      };
    }
  }

  const where = {};
  if (agency) where.agency = { [Op.iLike]: `%${agency}%` };
  if (category) where.aiCategory = category;
  if (minScore != null) where.priorityScore = { ...(where.priorityScore || {}), [Op.gte]: Number(minScore) };
  if (maxScore != null) where.priorityScore = { ...(where.priorityScore || {}), [Op.lte]: Number(maxScore) };
  if (closeBefore) where.closeDate = { [Op.lte]: new Date(closeBefore) };
  if (String(highAiFit) === 'true') where.fitScore = { [Op.gte]: 75 };
  if (q) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${q}%` } },
      { description: { [Op.iLike]: `%${q}%` } },
      { agency: { [Op.iLike]: `%${q}%` } },
    ];
  }

  // fromCluster filter is an OR of (original source ids) UNION (rows that
  // match the same aiCategory + value-bracket signature). Either branch is
  // valid evidence that an opp belongs in this cluster's universe.
  if (clusterContext) {
    const matchClause = clusterContext.aiCategory
      ? {
          [Op.and]: [
            { aiCategory: clusterContext.aiCategory },
            clusterContext.lo == null && clusterContext.hi == null
              ? { estimatedValue: null }
              : {
                  estimatedValue: {
                    ...(clusterContext.lo != null ? { [Op.gte]: clusterContext.lo } : {}),
                    ...(clusterContext.hi != null ? { [Op.lt]: clusterContext.hi } : {}),
                  },
                },
          ],
        }
      : null;
    const orBranches = [];
    if (clusterContext.sourceIds.length) {
      orBranches.push({ id: { [Op.in]: clusterContext.sourceIds } });
    }
    if (matchClause) orBranches.push(matchClause);
    if (!orBranches.length) {
      // No source ids AND no resolvable match key — short-circuit.
      return { rows: [], total: 0, clusterContext: { ...clusterContext, rec: undefined } };
    }
    where[Op.and] = [...(where[Op.and] || []), { [Op.or]: orBranches }];
  }
  // v0.11 — hide expired opps unless pursued/submitted. Always show opps
  // with no close_date set (we don't know they're expired).
  if (String(includeExpired) !== 'true') {
    where[Op.and] = [
      ...(where[Op.and] || []),
      {
        [Op.or]: [
          { closeDate: null },
          { closeDate: { [Op.gte]: new Date() } },
          { pursuitStatus: { [Op.in]: ['pursuing', 'submitted'] } },
        ],
      },
    ];
  }

  // Tuple-based ORDER BY avoids Sequelize's literal-handling quirks with aliased joins.
  // We accept Postgres' default NULL placement (NULLS FIRST on DESC) for this prototype;
  // it is not user-facing until data is enriched (where priority_score will be non-null).
  // When drilling from a cluster we default to a cluster-aware order: actively-
  // pursued bids first (so already-decided work stays at the top), then by
  // priority. Caller can override with order=... as usual.
  const effectiveOrder = (clusterContext && order === 'priority_desc') ? 'cluster_default' : order;
  let orderClause;
  switch (effectiveOrder) {
    case 'priority_asc':    orderClause = [['priorityScore', 'ASC']]; break;
    case 'close_asc':       orderClause = [['closeDate', 'ASC']]; break;
    case 'created_desc':    orderClause = [['createdAt', 'DESC']]; break;
    case 'cluster_default':
      // Active pursuits (pursuing/submitted) sort to position 0; everything
      // else to 1. The hasMany `tags` include + distinct:true forces Sequelize
      // to wrap the outer SELECT in a subquery, so a bare CASE expression in
      // ORDER BY can't resolve `pursuit_status`. Workaround: project the CASE
      // value into the inner SELECT as a virtual `_pursuitOrder` column, then
      // order by that name in the outer scope.
      orderClause = [
        [sequelize.literal('"_pursuitOrder"'), 'ASC'],
        ['priorityScore', 'DESC'],
        ['createdAt', 'DESC'],
      ];
      break;
    case 'priority_desc':
    default:                orderClause = [['priorityScore', 'DESC'], ['createdAt', 'DESC']];
  }

  // NOTE: with a hasMany tag include, Sequelize's default behavior wraps the
  // outer SELECT in a subquery so LIMIT/OFFSET apply to distinct opportunities,
  // not to the post-JOIN cartesian. The previous `subQuery: false` was breaking
  // pagination — a request for 25 rows was returning ~5 distinct opportunities
  // because LIMIT applied to (opportunity × tag) JOIN rows. Removing the flag
  // lets Sequelize do the right thing; `distinct: true` keeps the count clean.
  // When the cluster_default sort is in play, project the CASE value as a
  // virtual `_pursuitOrder` column so the ORDER BY can reference it across
  // Sequelize's subquery wrapper. Other sort modes don't pay this cost.
  const baseAttrs = effectiveOrder === 'cluster_default'
    ? {
        include: [[
          sequelize.literal(`(CASE WHEN "BonfireOpportunity"."pursuit_status" IN ('pursuing','submitted') THEN 0 ELSE 1 END)`),
          '_pursuitOrder',
        ]],
      }
    : undefined;

  const { rows, count } = await BonfireOpportunity.findAndCountAll({
    where,
    order: orderClause,
    limit: Math.min(Number(limit) || 50, 200),
    offset: Number(offset) || 0,
    include: [{ model: BonfireOpportunityTag, as: 'tags', attributes: ['tag'] }],
    distinct: true,
    ...(baseAttrs ? { attributes: baseAttrs } : {}),
  });

  // Tag each row with its origin relative to the cluster, so the UI can
  // visually distinguish "this was a source bid that built the cluster" from
  // "this was ingested after — it's a new candidate the cluster's product
  // could now also serve."
  if (clusterContext) {
    const sourceIdSet = new Set(clusterContext.sourceIds.map(String));
    rows.forEach((r) => {
      const isSource = sourceIdSet.has(String(r.id));
      // We set a non-Sequelize property on the instance; dataValues makes it
      // visible to JSON.stringify (which is what the controller serializes).
      r.dataValues._origin = isSource ? 'source' : 'matched';
    });
  }

  const result = { rows, total: count };
  if (clusterContext) {
    const sourceIdSet = new Set(clusterContext.sourceIds.map(String));
    const sourceShown = rows.filter((r) => sourceIdSet.has(String(r.id))).length;
    result.clusterContext = {
      strategicRecId: clusterContext.rec.id,
      title: clusterContext.rec.title,
      patternType: clusterContext.rec.patternType,
      aiCategory: clusterContext.aiCategory,
      valueBracket: clusterContext.bracket,
      originalSourceCount: clusterContext.sourceIds.length,
      sourceShownInPage: sourceShown,
      matchedShownInPage: rows.length - sourceShown,
    };
  }
  return result;
}

async function getOpportunity(id) {
  return BonfireOpportunity.findByPk(id, {
    include: [{ model: BonfireOpportunityTag, as: 'tags', attributes: ['tag'] }],
  });
}

// -------- ingest --------

async function insertNormalizedRows(rows) {
  const errors = [];
  const accepted = [];
  rows.forEach((raw, i) => {
    const check = validateRow(raw, i);
    if (!check.ok) {
      errors.push({ index: i, reason: check.reason });
    } else {
      accepted.push(check.row);
    }
  });
  if (!accepted.length) return { inserted: 0, skipped: rows.length, errors };

  const created = await BonfireOpportunity.bulkCreate(accepted, { returning: true });
  logger.info('Bonfire upload inserted rows', { count: created.length });
  return { inserted: created.length, skipped: errors.length, errors };
}

async function ingestJsonArray(arr) {
  if (!Array.isArray(arr)) throw new Error('payload must be an array');
  return insertNormalizedRows(arr);
}

// Phase 2 capability, probed ONCE against the database.
//
// Deliberately not "are the models registered": the models ship with the code,
// the TABLES arrive with a migration, and prod currently runs the code without
// the migration. Gating on model presence there would switch this path into
// evidence-only publication while every evidence write failed on a missing
// relation — deadlines would silently stop updating. Gating on a real query
// means an unmigrated database keeps the legacy path exactly.
let govEvidenceCapability = null;

async function govEvidenceEnabled() {
  if (govEvidenceCapability !== null) return govEvidenceCapability;
  const models = require('../models');
  if (!models.GovCanonicalOpportunity || !models.GovSourceSnapshot) {
    govEvidenceCapability = false;
    return false;
  }
  try {
    await models.GovCanonicalOpportunity.findOne({ attributes: ['canonicalId'] });
    govEvidenceCapability = true;
  } catch (e) {
    logger.warn('Bonfire upsert: gov evidence tables unavailable, using legacy publication', {
      error: e.message,
    });
    govEvidenceCapability = false;
  }
  return govEvidenceCapability;
}

// Tests build and drop schemas inside one process; the probe result must not
// outlive the schema it was taken against.
function resetGovEvidenceCapability() { govEvidenceCapability = null; }

/**
 * The bulk half of the scraper upsert: INSERT new rows, and refresh whichever
 * columns the active publication mode allows on an existing one.
 *
 * Two publication modes, and the difference is the whole point:
 *
 * LEGACY (no Phase 2 tables) — the bulk statement refreshes the source columns
 * and, for rows whose deadline we actually resolved, closeDate.
 *
 * PHASE 2 — the bulk statement inserts new rows and, on conflict, touches
 * nothing but updatedAt. Every source column of an existing row AND its deadline
 * decision are applied together by the per-row evidence transaction. Publishing
 * closeDate here as well ran it in a DIFFERENT transaction from the evidence
 * write, which produced two defects:
 *   * an evidence failure left a CHANGED closeDate beside an untouched
 *     verified_at and observation id, so a deadline nobody verified read back
 *     as verified;
 *   * on success the evidence write read the ALREADY-OVERWRITTEN closeDate, so
 *     the superseded history recorded the new value as if it were the old one.
 *
 * updateOnDuplicate deliberately EXCLUDES enrichment + scoring fields in both
 * modes. Re-scraping must NOT clobber AI work — `enrichAllUnenriched()` only
 * picks up rows with enrichedAt IS NULL, and we preserve that invariant by not
 * touching enrichment columns.
 */
async function writeUpsertBatches(withId, withoutId, phase2) {
  // Base columns refreshed on every upsert in legacy mode.
  const UPDATE_COLUMNS = [
    'title', 'agency', 'description', 'categoryRaw',
    'sourceUrl', 'rawText', 'updatedAt',
  ];
  const ON_CONFLICT = phase2 ? ['updatedAt'] : UPDATE_COLUMNS;

  // closeDate is refreshed ONLY when we actually know it.
  //
  // deadlineParser deliberately returns null when a portal string has no
  // resolvable timezone ("deadline unknown", not "no deadline"). Including
  // closeDate in updateOnDuplicate for those rows would overwrite a previously
  // known deadline with NULL, and a NULL close_date silently drops the row out
  // of /best-fit (which requires close_date >= cutoff). That is data loss on a
  // re-scrape, so uncertain rows are upserted WITHOUT touching closeDate.
  const withKnownClose = withId.filter((r) => r.closeDate != null);
  const withUnknownClose = withId.filter((r) => r.closeDate == null);

  let upsertCount = 0;
  // Postgres ON CONFLICT needs an explicit conflict target. Without
  // conflictAttributes Sequelize falls back to the primary key (id), which
  // forces the duplicate-handling path to fail with a unique-constraint error
  // on external_id. Naming the target lets the partial unique index do its job.
  if (withKnownClose.length) {
    await BonfireOpportunity.bulkCreate(withKnownClose, {
      conflictAttributes: ['externalId'],
      updateOnDuplicate: phase2 ? ON_CONFLICT : [...UPDATE_COLUMNS, 'closeDate'],
    });
    upsertCount += withKnownClose.length;
  }
  if (withUnknownClose.length) {
    logger.warn('Bonfire upsert: rows with an unresolved deadline; preserving any existing close_date', {
      count: withUnknownClose.length,
    });
    await BonfireOpportunity.bulkCreate(withUnknownClose, {
      conflictAttributes: ['externalId'],
      updateOnDuplicate: ON_CONFLICT,
    });
    upsertCount += withUnknownClose.length;
  }

  let plainInserted = 0;
  if (withoutId.length) {
    logger.warn('Bonfire upsert: rows missing external_id, inserting without dedupe', {
      count: withoutId.length,
    });
    const created = await BonfireOpportunity.bulkCreate(withoutId, { returning: true });
    plainInserted = created.length;
  }

  return { upsertCount, plainInserted };
}

// Scraper-only path: idempotent upsert keyed on external_id.
//
// The partial unique index `idx_bonfire_opps_external_id` (created in migration
// 20260425000001) covers the conflict target. Rows without external_id fall through
// to plain insert (NULLs do not collide under partial unique indexes).
//
// The bulk write itself, and which columns each publication mode is allowed to
// refresh, live in writeUpsertBatches above.
async function upsertJsonArray(arr) {
  if (!Array.isArray(arr)) throw new Error('payload must be an array');
  const errors = [];
  const accepted = [];
  // Accepted rows are paired with the RAW input they came from. validateRow's
  // allow-list strips deadline provenance, and evidence recording must only
  // ever see inputs that passed validation — previously the whole raw array,
  // including rejected rows, was handed to it.
  const acceptedPairs = [];
  arr.forEach((raw, i) => {
    const check = validateRow(raw, i);
    if (!check.ok) { errors.push({ index: i, reason: check.reason }); return; }
    accepted.push(check.row);
    acceptedPairs.push({ raw, row: check.row });
  });
  if (!accepted.length) {
    // Same shape as the success return. It used to differ (`inserted` /
    // `updated` / `skippedNoExternalId`, and no `evidence` at all), so a caller
    // reading `out.evidence.recorded` crashed on an all-rejected batch and the
    // runner's counters silently read `undefined || 0`.
    return {
      processed: 0,
      upserted: 0,
      insertedWithoutExternalId: 0,
      errors,
      evidence: {
        recorded: 0, skipped: 0, failed: 0, snapshotsWritten: 0, verified: 0,
      },
    };
  }

  // Split: rows with external_id go through upsert, rows without go through plain insert.
  // Without external_id we can't dedupe — the scraper logs a warning when this happens.
  const withId = accepted.filter((r) => !!r.externalId);
  const withoutId = accepted.filter((r) => !r.externalId);

  // Phase 2 present: the EVIDENCE PATH is the sole publisher of closeDate, and
  // of every other source column on an existing row. See writeUpsertBatches.
  const phase2 = await govEvidenceEnabled();
  const { upsertCount, plainInserted } = await writeUpsertBatches(withId, withoutId, phase2);

  // ---- Phase 2 source evidence ------------------------------------------
  // The real ingestion path records canonical identity, aliases, an immutable
  // source snapshot and the deadline observation. It runs from the RAW input
  // because validateRow() strips deadline provenance via its allow-list, so the
  // accepted rows no longer carry close_date_raw / timezone / confidence.
  const evidence = await recordGovEvidence(acceptedPairs);

  logger.info('Bonfire upsert complete', {
    processed: accepted.length,
    upserted: upsertCount,
    insertedNoId: plainInserted,
    errors: errors.length,
    evidenceRecorded: evidence.recorded,
    evidenceSkipped: evidence.skipped,
    snapshotsWritten: evidence.snapshotsWritten,
  });
  return {
    processed: accepted.length,
    upserted: upsertCount,
    insertedWithoutExternalId: plainInserted,
    errors,
    evidence,
  };
}

/**
 * Record Phase 2 source evidence for accepted rows.
 *
 * Takes PAIRS of {raw, row}: the raw scraped input, which still carries the
 * deadline provenance validateRow's allow-list strips, and the validated row
 * that is actually allowed to reach the database. A rejected input therefore
 * cannot reach this function at all — it used to receive the whole raw array,
 * so a row the validator refused could still mint identity, write a snapshot
 * and move an existing row's deadline state.
 *
 * Deliberately NON-FATAL PER ROW. Scraping is the product's lifeline; an
 * evidence-write problem must degrade to "this row keeps its last consistent
 * state" rather than abort the scrape or half-apply the row. Every failure is
 * logged with its external_id so the gap is visible.
 *
 * @param {Array<{raw: object, row: object}>} pairs accepted rows with their inputs
 */
async function recordGovEvidence(pairs) {
  const out = {
    recorded: 0, skipped: 0, failed: 0, snapshotsWritten: 0, verified: 0,
  };
  if (!Array.isArray(pairs) || !pairs.length) return out;

  const models = require('../models');
  if (!models.GovCanonicalOpportunity || !models.GovSourceSnapshot) {
    out.skipped = pairs.length;
    return out;
  }

  const { ingestObservation, classifySourceAuthority } = require('../govContracts/govIngestion.service');
  const { parseDeadline } = require('./scraper/deadlineParser');

  for (const pair of pairs) {
    const raw = pair && pair.raw ? pair.raw : pair;
    const validated = pair && pair.row ? pair.row : null;
    const externalId = raw && raw.external_id ? String(raw.external_id).trim() : null;
    if (!externalId) { out.skipped += 1; continue; }

    try {
      const row = await BonfireOpportunity.findOne({
        where: { externalId }, attributes: ['id'],
      });
      if (!row) { out.skipped += 1; continue; }

      const rawText = raw.close_date_raw || null;
      // Re-parse rather than trusting the fields normalize() carried: this
      // guarantees the observation reflects the CURRENT parser, including its
      // candidate set, rather than whatever shape an older scrape produced.
      const parse = rawText ? parseDeadline(rawText) : null;

      // Authority is DETERMINED from what we observed, not assumed. The old
      // hardcoded basis string asserted publisher-of-record for every portal
      // row, including courtesy re-posts of another body's solicitation.
      const authority = classifySourceAuthority({
        title: raw.title || null,
        sourceUrl: raw.source_url || null,
        externalId,
      });

      const res = await ingestObservation({
        opportunityId: row.id,
        sourceSystem: 'bonfire',
        aliases: raw.source_url
          ? [{ idType: 'portal_url', idValue: raw.source_url, note: 'Portal URL observed during scrape.' }]
          : [],
        sourceFacts: {
          deadlineText: rawText,
          title: raw.title || null,
          agency: raw.agency || null,
          sourceUrl: raw.source_url || null,
          externalId,
        },
        // The validated row's source columns, applied in the SAME transaction
        // as the deadline decision and the snapshot.
        sourceColumns: validated,
        fetch: { status: 'success', attemptedAt: new Date() },
        parse,
        rawPresent: !!rawText,
        // NOT asserted. An empty close-date cell is missing capture, not the
        // buyer affirming there is no deadline — that distinction is defect B.
        absentConfirmed: undefined,
        candidates: parse && parse.candidates ? parse.candidates : null,
        provenance: {
          source: 'bonfire_portal_scrape',
          authority: authority.authority,
          authorityEvidence: authority.evidence,
          basis: authority.authority,
          sourceRef: raw.source_url || null,
        },
      }, { models, sequelize });

      if (res && res.applied) {
        out.recorded += 1;
        if (res.snapshotWritten) out.snapshotsWritten += 1;
        if (res.decision && res.decision.verified) out.verified += 1;
      } else {
        out.skipped += 1;
      }
    } catch (e) {
      out.failed += 1;
      logger.warn('Bonfire gov-evidence record failed', { externalId, error: e.message });
    }
  }
  return out;
}

async function ingestCsvBuffer(buffer) {
  const text = buffer.toString('utf8');
  const rows = parseCsv(text);
  return insertNormalizedRows(rows);
}

async function ingestJsonBuffer(buffer) {
  const rows = parseJsonArray(buffer.toString('utf8'));
  return insertNormalizedRows(rows);
}

// -------- enrichment orchestration --------

// Very small concurrency limiter — avoids pulling p-limit into deps.
function createLimiter(maxConcurrent) {
  const queue = [];
  let active = 0;
  const next = () => {
    if (active >= maxConcurrent || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then((v) => { active--; resolve(v); next(); })
      .catch((e) => { active--; reject(e); next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

async function enrichOne(id, { force = false } = {}) {
  const op = await BonfireOpportunity.findByPk(id);
  if (!op) return { id, ok: false, reason: 'not_found' };
  try {
    const result = await enrichOpportunity(op, { force });
    if (!result.updated) {
      return { id, ok: true, skipped: true, reason: result.reason };
    }
    await op.update(result.fields);
    if (Array.isArray(result.tags) && result.tags.length) {
      await BonfireOpportunityTag.destroy({ where: { opportunityId: id } });
      const tagRows = result.tags.map((t) => ({ opportunityId: id, tag: t }));
      await BonfireOpportunityTag.bulkCreate(tagRows, { ignoreDuplicates: true });
    }
    return { id, ok: true };
  } catch (e) {
    logger.error('Bonfire enrich failed', { id, error: e.message });
    return { id, ok: false, reason: e.message };
  }
}

async function enrichAllUnenriched({ force = false, concurrency = 2, maxRows = 200 } = {}) {
  const where = force ? {} : { enrichedAt: null };
  const rows = await BonfireOpportunity.findAll({
    where,
    attributes: ['id'],
    limit: maxRows,
  });
  if (!rows.length) return { processed: 0, succeeded: 0, failed: 0, skipped: 0, results: [] };

  const limit = createLimiter(concurrency);
  const results = await Promise.all(rows.map((r) => limit(() => enrichOne(r.id, { force }))));
  const succeeded = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.ok && r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  return { processed: results.length, succeeded, skipped, failed, results };
}

// -------- strategy --------

async function generateStrategyForId(id) {
  const op = await BonfireOpportunity.findByPk(id);
  if (!op) return { ok: false, reason: 'not_found' };
  try {
    const strategy = await generateStrategy(op);
    await op.update({ strategy });
    return { ok: true, strategy };
  } catch (e) {
    logger.error('Bonfire strategy failed', { id, error: e.message });
    return { ok: false, reason: e.message };
  }
}

// -------- best-fit (digest parity) --------

// Hard ceiling on ?limit for the best-fit endpoint. The digest itself asks for
// 10; allow headroom without letting a caller pull the whole table.
const BEST_FIT_MAX_LIMIT = 50;
const BEST_FIT_DEFAULT_LIMIT = 10;

// Digest-parity ranking for external consumers (the Accelerator's Factory
// Command Center renders this as "Top 10 Bonfire Contracts to Bid").
//
// This DELEGATES to richDigest.topBonfire — the exact function the daily
// "Your Opportunity Pulse" email calls — so the API and the email cannot
// drift. Do NOT reimplement the ranking here: a second copy is a guaranteed
// future mismatch, which is the whole problem this endpoint exists to solve.
// The require is function-local to keep the module-load graph acyclic
// (emailDigest -> models only; bonfire -> emailDigest only at call time).
//
// Failure modes: throws only if the DB is unreachable; the controller maps
// that to a 500. Read-only, no partial state, safe to call repeatedly.
async function listBestFitOpportunities({ limit } = {}) {
  // eslint-disable-next-line global-require
  const richDigest = require('../emailDigest/richDigest.service');

  const asNum = Number(limit);
  const effectiveLimit = Number.isFinite(asNum) && asNum >= 1
    ? Math.min(Math.floor(asNum), BEST_FIT_MAX_LIMIT)
    : BEST_FIT_DEFAULT_LIMIT;

  const rows = await richDigest.topBonfire(effectiveLimit);

  return {
    rows,
    // Self-describing ranking metadata so a consumer can explain the order it
    // rendered without hardcoding our thresholds on their side.
    ranking: {
      parityWith: 'daily_digest.topBonfire',
      limit: effectiveLimit,
      minCloseDays: richDigest.BONFIRE_DIGEST_MIN_CLOSE_DAYS,
      // These verdict statuses are DEMOTED to the bottom bucket, not removed.
      demotedVerdictStatuses: richDigest.HIDDEN_VERDICTS,
      sort: [
        'biddable_first (verdict not demoted AND title matches domain regex) ASC',
        'priorityScore DESC NULLS LAST',
        'fitScore DESC NULLS LAST',
        'createdAt DESC',
      ],
    },
  };
}

module.exports = {
  listOpportunities,
  recordGovEvidence,
  resetGovEvidenceCapability,
  listBestFitOpportunities,
  getOpportunity,
  ingestJsonArray,
  upsertJsonArray,
  ingestCsvBuffer,
  ingestJsonBuffer,
  enrichOne,
  enrichAllUnenriched,
  generateStrategyForId,
  // Exported for unit tests + cross-service callers.
  resolveClusterMatchKey,
  valueBracketBoundsFromCents,
};
