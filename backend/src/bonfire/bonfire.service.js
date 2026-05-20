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
      orderClause = [
        // Sequelize literal — Postgres CASE expression evaluates inline. Active
        // pursuits (pursuing/submitted) sort to position 0; everything else to 1.
        // Table-qualified because Sequelize wraps the outer SELECT in a
        // subquery (due to the hasMany `tags` include + distinct:true) and the
        // bare column doesn't resolve in that scope.
        [sequelize.literal(`CASE WHEN "BonfireOpportunity"."pursuit_status" IN ('pursuing','submitted') THEN 0 ELSE 1 END`), 'ASC'],
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
  const { rows, count } = await BonfireOpportunity.findAndCountAll({
    where,
    order: orderClause,
    limit: Math.min(Number(limit) || 50, 200),
    offset: Number(offset) || 0,
    include: [{ model: BonfireOpportunityTag, as: 'tags', attributes: ['tag'] }],
    distinct: true,
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

// Scraper-only path: idempotent upsert keyed on external_id.
//
// The partial unique index `idx_bonfire_opps_external_id` (created in migration
// 20260425000001) covers the conflict target. Rows without external_id fall through
// to plain insert (NULLs do not collide under partial unique indexes).
//
// updateOnDuplicate deliberately EXCLUDES enrichment + scoring fields. Re-scraping
// must NOT clobber AI work — `enrichAllUnenriched()` only picks up rows with
// enrichedAt IS NULL, and we preserve that invariant by not touching enrichment columns.
async function upsertJsonArray(arr) {
  if (!Array.isArray(arr)) throw new Error('payload must be an array');
  const errors = [];
  const accepted = [];
  arr.forEach((raw, i) => {
    const check = validateRow(raw, i);
    if (!check.ok) errors.push({ index: i, reason: check.reason });
    else accepted.push(check.row);
  });
  if (!accepted.length) {
    return { processed: 0, inserted: 0, updated: 0, skippedNoExternalId: 0, errors };
  }

  // Split: rows with external_id go through upsert, rows without go through plain insert.
  // Without external_id we can't dedupe — the scraper logs a warning when this happens.
  const withId = accepted.filter((r) => !!r.externalId);
  const withoutId = accepted.filter((r) => !r.externalId);

  let upsertCount = 0;
  if (withId.length) {
    // Postgres ON CONFLICT needs an explicit conflict target. Without
    // conflictAttributes Sequelize falls back to the primary key (id),
    // which forces the duplicate-handling path to fail with a unique-constraint
    // error on external_id. Naming the target lets the partial unique index
    // do its job.
    await BonfireOpportunity.bulkCreate(withId, {
      conflictAttributes: ['externalId'],
      updateOnDuplicate: [
        'title', 'agency', 'description', 'categoryRaw',
        'closeDate', 'sourceUrl', 'rawText', 'updatedAt',
      ],
    });
    upsertCount = withId.length;
  }

  let plainInserted = 0;
  if (withoutId.length) {
    logger.warn('Bonfire upsert: rows missing external_id, inserting without dedupe', {
      count: withoutId.length,
    });
    const created = await BonfireOpportunity.bulkCreate(withoutId, { returning: true });
    plainInserted = created.length;
  }

  logger.info('Bonfire upsert complete', {
    processed: accepted.length,
    upserted: upsertCount,
    insertedNoId: plainInserted,
    errors: errors.length,
  });
  return {
    processed: accepted.length,
    upserted: upsertCount,
    insertedWithoutExternalId: plainInserted,
    errors,
  };
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

module.exports = {
  listOpportunities,
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
