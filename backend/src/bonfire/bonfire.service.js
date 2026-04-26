const { Op } = require('sequelize');
const {
  sequelize,
  BonfireOpportunity,
  BonfireOpportunityTag,
} = require('../models');
const logger = require('../logging/logger');
const { validateRow, parseCsv, parseJsonArray } = require('./bonfire.util');
const { enrichOpportunity, generateStrategy } = require('./bonfireAI.service');

// -------- queries --------

async function listOpportunities(filters = {}) {
  const {
    agency,
    category,
    minScore,
    maxScore,
    closeBefore,
    highAiFit,
    q,
    limit = 50,
    offset = 0,
    order = 'priority_desc',
  } = filters;

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

  // Tuple-based ORDER BY avoids Sequelize's literal-handling quirks with aliased joins.
  // We accept Postgres' default NULL placement (NULLS FIRST on DESC) for this prototype;
  // it is not user-facing until data is enriched (where priority_score will be non-null).
  let orderClause;
  switch (order) {
    case 'priority_asc': orderClause = [['priorityScore', 'ASC']]; break;
    case 'close_asc':    orderClause = [['closeDate', 'ASC']]; break;
    case 'created_desc': orderClause = [['createdAt', 'DESC']]; break;
    case 'priority_desc':
    default:             orderClause = [['priorityScore', 'DESC'], ['createdAt', 'DESC']];
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
  return { rows, total: count };
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
};
