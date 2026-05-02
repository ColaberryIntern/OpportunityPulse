// Opportunity Bundler — clusters active opportunities into themed groups
// so admins can see "5 housing-authority compliance bids in TX" as one
// bundle instead of individual rows. Output persisted to `bundles`.
//
// Clustering keys (cheap + deterministic):
//   primary: ai_category from aiAnalysis (else opp.category)
//   secondary: recommended_product from aiAnalysis when present
//   tie-breaker: keyword overlap (shared 4+ char tokens in title)
//
// A cluster needs >= 3 opportunities to be persisted as a bundle.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { Opportunity, Bundle } = require('../models');

const MIN_BUNDLE_SIZE = 3;
const MAX_BUNDLE_SIZE = 50;

function readAi(opp, key) {
  const ai = (opp && opp.aiAnalysis) || {};
  return ai[key] != null ? ai[key] : null;
}

function clusterKey(opp) {
  const cat = String(readAi(opp, 'ai_category') || opp.category || 'Other').trim();
  const product = String(readAi(opp, 'recommended_product') || '').trim();
  // Keep the key short — used as a column/index value.
  return product ? `${cat}|${product}` : cat;
}

// Tokens shared by N+ titles in the cluster — used to name the bundle.
function topKeywords(opps, n = 3) {
  const counts = new Map();
  for (const o of opps) {
    const seen = new Set();
    for (const tok of String(o.title || '').toLowerCase().split(/\W+/)) {
      if (tok.length < 4) continue;
      if (STOP.has(tok)) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      counts.set(tok, (counts.get(tok) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .filter(([, c]) => c >= 2)
    .map(([t]) => t);
}

const STOP = new Set([
  'services', 'service', 'system', 'systems', 'support', 'project',
  'program', 'agreement', 'contract', 'request', 'proposal', 'rfp',
  'rfq', 'bid', 'opportunity', 'department', 'office', 'agency',
]);

// Theme = "<Category>: <kw1>, <kw2>" or "<Category>: <Product>".
function buildTheme(key, opps) {
  const [cat, product] = key.split('|');
  if (product) return `${cat}: ${product}`;
  const kws = topKeywords(opps);
  return kws.length ? `${cat}: ${kws.join(', ')}` : cat;
}

async function buildBundles({ now = new Date() } = {}) {
  // Active, with-value opps only — bundles aren't useful for closed bids.
  const opps = await Opportunity.findAll({
    where: {
      status: 'active',
      value: { [Op.gt]: 0 },
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gte]: now } },
      ],
    },
    limit: 5000,
  });

  // Group.
  const groups = new Map();
  for (const o of opps) {
    const k = clusterKey(o);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }

  // Persist clusters with >= MIN_BUNDLE_SIZE.
  const created = [];
  for (const [key, members] of groups) {
    if (members.length < MIN_BUNDLE_SIZE) continue;
    const trimmed = members.slice(0, MAX_BUNDLE_SIZE);
    const theme = buildTheme(key, trimmed);
    const ids = trimmed.map((m) => m.id);
    const totalValue = trimmed.reduce((s, m) => s + (Number(m.value) || 0), 0);
    const summary = buildSummary(theme, trimmed);

    // Upsert by `key` so re-runs replace prior contents in place.
    const [row] = await Bundle.upsert({
      key,
      theme,
      opportunityIds: ids,
      opportunityCount: ids.length,
      estimatedTotalValue: totalValue,
      summary,
      generatedAt: now,
    });
    created.push(row ? row.toJSON() : { key, theme, opportunity_count: ids.length });
  }

  // Drop bundles whose key no longer cleared the threshold this run.
  const liveKeys = created.map((b) => b.key).filter(Boolean);
  if (liveKeys.length) {
    await Bundle.destroy({ where: { key: { [Op.notIn]: liveKeys } } });
  } else {
    await Bundle.destroy({ where: {} });
  }

  logger.info('OIED bundler: built', {
    candidateOpps: opps.length,
    bundles: created.length,
  });
  return { totalCandidates: opps.length, bundles: created.length, themes: created };
}

function buildSummary(theme, opps) {
  const titles = opps.slice(0, 5).map((o) => `• ${o.title}`).join('\n');
  return `${theme} — ${opps.length} active opportunities. Examples:\n${titles}`;
}

async function listBundles({ limit = 50 } = {}) {
  const rows = await Bundle.findAll({
    order: [['estimatedTotalValue', 'DESC'], ['opportunityCount', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
  });
  return rows.map((r) => r.toJSON());
}

async function getBundle(id) {
  const row = await Bundle.findByPk(id);
  return row ? row.toJSON() : null;
}

module.exports = {
  buildBundles,
  listBundles,
  getBundle,
  clusterKey,
  buildTheme,
  topKeywords,
  MIN_BUNDLE_SIZE,
};
