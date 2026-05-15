// Deep Research Phase 7 — custom strategic research runs.
//
// User-defined strategic searches (e.g. "AI video generation for defense").
// Save / rerun / compare runs over time. Search runs against the Opportunity
// table using deterministic SQL ILIKE — no AI dependency.
//
// Append-only history is captured on each run for over-time comparison.

const { Op } = require('sequelize');
const { Opportunity, CustomResearchRun } = require('../models');

function tokenize(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[\s,;|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function buildWhereFromTokens(tokens, { types = null } = {}) {
  const where = { status: 'active' };
  if (Array.isArray(types) && types.length) where.type = { [Op.in]: types };
  if (tokens.length === 0) return where;
  // AND across tokens; each token must hit title OR description.
  where[Op.and] = tokens.map((t) => ({
    [Op.or]: [
      { title: { [Op.iLike]: `%${t}%` } },
      { description: { [Op.iLike]: `%${t}%` } },
    ],
  }));
  return where;
}

function summarizeResults(opps) {
  const breakdown = {};
  for (const o of opps) {
    const k = o.type || 'unknown';
    breakdown[k] = (breakdown[k] || 0) + 1;
  }
  return breakdown;
}

async function runQuery({ query, filters = {}, limit = 200 } = {}) {
  const tokens = tokenize(query);
  const types = Array.isArray(filters.types) ? filters.types : null;
  const where = buildWhereFromTokens(tokens, { types });
  const rows = await Opportunity.findAll({
    where, limit: Math.min(500, Number(limit) || 200),
    order: [['published_at', 'DESC']],
  });
  const opps = rows.map((o) => o.toJSON());
  const breakdown = summarizeResults(opps);
  return {
    query, tokens, filters,
    match_count: opps.length,
    breakdown,
    results: opps.map((o) => ({
      id: o.id, title: o.title, type: o.type, source: o.source,
      ai_score: o.aiScore, published_at: o.publishedAt,
      value: o.value, relevance: 60,
    })),
  };
}

async function createRun({ name, query, filters = {}, pinned = false, createdBy = null } = {}) {
  if (!name || !query) {
    const err = new Error('name and query are required'); err.code = 'BAD_INPUT'; throw err;
  }
  const initial = await runQuery({ query, filters });
  const row = await CustomResearchRun.create({
    name, query, filters,
    lastRunAt: new Date(),
    lastMatchCount: initial.match_count,
    lastResults: initial.results,
    lastBreakdown: initial.breakdown,
    history: [{
      run_at: new Date().toISOString(),
      match_count: initial.match_count,
      breakdown: initial.breakdown,
    }],
    pinned: Boolean(pinned),
    createdBy,
  });
  return row.toJSON();
}

async function rerunRun(id) {
  const row = await CustomResearchRun.findByPk(id);
  if (!row) { const err = new Error(`Run ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const result = await runQuery({ query: row.query, filters: row.filters });
  const history = Array.isArray(row.history) ? row.history.slice() : [];
  history.unshift({
    run_at: new Date().toISOString(),
    match_count: result.match_count,
    breakdown: result.breakdown,
  });
  // Cap history at 50 entries.
  await row.update({
    lastRunAt: new Date(),
    lastMatchCount: result.match_count,
    lastResults: result.results,
    lastBreakdown: result.breakdown,
    history: history.slice(0, 50),
  });
  return row.toJSON();
}

async function listRuns({ pinnedFirst = true, limit = 50 } = {}) {
  const order = pinnedFirst
    ? [['pinned', 'DESC'], ['updated_at', 'DESC']]
    : [['updated_at', 'DESC']];
  const rows = await CustomResearchRun.findAll({
    order, limit: Math.min(200, Number(limit) || 50),
  });
  return rows.map((r) => r.toJSON());
}

async function getRun(id) {
  const row = await CustomResearchRun.findByPk(id);
  if (!row) return null;
  return row.toJSON();
}

async function deleteRun(id) {
  const row = await CustomResearchRun.findByPk(id);
  if (!row) { const err = new Error(`Run ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.destroy();
  return { id, deleted: true };
}

async function updateRun(id, { name, query, filters, pinned } = {}) {
  const row = await CustomResearchRun.findByPk(id);
  if (!row) { const err = new Error(`Run ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const updates = {};
  if (name != null) updates.name = name;
  if (query != null) updates.query = query;
  if (filters != null) updates.filters = filters;
  if (pinned != null) updates.pinned = Boolean(pinned);
  await row.update(updates);
  return row.toJSON();
}

// Compare two runs (or two history entries of the same run).
function compareRuns(a, b) {
  const aBucket = a.breakdown || {};
  const bBucket = b.breakdown || {};
  const channels = new Set([...Object.keys(aBucket), ...Object.keys(bBucket)]);
  const diffs = [];
  for (const c of channels) {
    const delta = (bBucket[c] || 0) - (aBucket[c] || 0);
    diffs.push({ channel: c, a: aBucket[c] || 0, b: bBucket[c] || 0, delta });
  }
  return {
    delta_match_count: (b.match_count || 0) - (a.match_count || 0),
    channel_diffs: diffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)),
  };
}

module.exports = {
  tokenize, buildWhereFromTokens, summarizeResults,
  runQuery, createRun, rerunRun, updateRun, listRuns, getRun, deleteRun,
  compareRuns,
};
