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
const crypto = require('crypto');
const logger = require('../logging/logger');
const { Opportunity, Bundle } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const billing = require('./billing.service');

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

// ----- v3: Bundle Monetization -----------------------------------------
//
// generateBundleStrategy(bundleId) — calls gpt-4o-mini once to produce a
// strategic play for the cluster (what to build, why it works, how many
// opportunities it unlocks, revenue potential). Cached on
// `bundles.strategy_hash` so re-runs against the same opportunity set
// return the cached row without an LLM round-trip.

const STRATEGY_SYSTEM_PROMPT =
  'You are a strategic product designer reviewing a cluster of related '
  + 'public-sector opportunities. Output strict JSON with these keys ONLY: '
  + '`what_to_build` (1 sentence — concrete product/service name), '
  + '`why_it_works` (2-3 sentences — why this play wins THIS cluster), '
  + '`opportunities_unlocked` (integer — count of cluster members this would address), '
  + '`revenue_potential_usd` (integer — realistic 12-month revenue), '
  + '`build_time_days` (integer — engineering days), '
  + '`suggested_solution` (≤80 char product name). '
  + 'No prose outside the JSON. Be specific — name actual technologies, '
  + 'not generic phrases.';

function strategyHashFor(bundle, members) {
  const ids = members.map((m) => m.id).sort((a, b) => a - b).join('|');
  return crypto
    .createHash('sha256')
    .update(`${bundle.theme}::${ids}`)
    .digest('hex');
}

function buildStrategyUserPrompt(bundle, members) {
  const lines = [
    `Cluster theme: ${bundle.theme}`,
    `Cluster key: ${bundle.key}`,
    `Member count: ${members.length}`,
    `Total estimated value: $${Number(bundle.estimatedTotalValue || 0).toFixed(0)}`,
    '',
    'Members (title · category · value):',
  ];
  for (const m of members.slice(0, 12)) {
    lines.push(`  • ${m.title} · ${m.category || 'n/a'} · $${Number(m.value || 0).toFixed(0)}`);
  }
  return lines.join('\n');
}

function safeParseStrategy(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      what_to_build:           String(obj.what_to_build || '').slice(0, 500),
      why_it_works:            String(obj.why_it_works || '').slice(0, 800),
      opportunities_unlocked:  Number(obj.opportunities_unlocked) || 0,
      revenue_potential_usd:   Number(obj.revenue_potential_usd) || 0,
      build_time_days:         Number(obj.build_time_days) || null,
      suggested_solution:      String(obj.suggested_solution || '').slice(0, 300),
    };
  } catch (e) {
    return null;
  }
}

async function generateBundleStrategy(bundleId, { force = false } = {}) {
  const bundle = await Bundle.findByPk(bundleId);
  if (!bundle) throw new Error(`bundle ${bundleId} not found`);

  const ids = Array.isArray(bundle.opportunityIds) ? bundle.opportunityIds : [];
  if (ids.length === 0) {
    throw new Error(`bundle ${bundleId} has no member opportunities`);
  }
  const members = await Opportunity.findAll({
    where: { id: ids },
    attributes: ['id', 'title', 'category', 'value'],
  });
  const hash = strategyHashFor(bundle, members);

  // Cache hit — return without LLM round-trip.
  if (!force && bundle.strategyHash === hash && bundle.strategy && bundle.strategy.what_to_build) {
    return {
      cached: true,
      bundleId: bundle.id,
      strategy: bundle.strategy,
      suggestedSolution: bundle.suggestedSolution,
      estimatedBuildTimeDays: bundle.estimatedBuildTimeDays,
      strategyHash: bundle.strategyHash,
    };
  }

  // v6: enforce plan limit on cache MISS only. Cached responses are free.
  await billing.enforceOrThrow({
    organizationId: bundle.organizationId || null,
    metric: 'strategies_generated',
  });

  const aiClient = getAIClient();
  const { content } = await aiClient.chat(
    STRATEGY_SYSTEM_PROMPT,
    buildStrategyUserPrompt(bundle, members),
    { temperature: 0.4, maxTokens: 600, responseFormat: 'json_object' },
  );

  const parsed = safeParseStrategy(content);
  if (!parsed) {
    throw new Error('AI returned unparseable JSON for bundle strategy');
  }
  const strategyRow = {
    ...parsed,
    generated_at: new Date().toISOString(),
    model: 'gpt-4o-mini',
  };

  bundle.strategy = strategyRow;
  bundle.suggestedSolution = parsed.suggested_solution || null;
  bundle.estimatedBuildTimeDays = parsed.build_time_days || null;
  bundle.strategyHash = hash;
  await bundle.save();

  logger.info('OIED bundler: strategy generated', {
    bundleId: bundle.id,
    theme: bundle.theme,
    members: members.length,
    revenuePotential: parsed.revenue_potential_usd,
  });

  // v5: record billable usage on cache MISS only.
  await billing.recordUsage({
    organizationId: bundle.organizationId || null,
    metric: 'strategies_generated',
    metadata: { bundleId: bundle.id, members: members.length },
  }).catch(() => null);

  return {
    cached: false,
    bundleId: bundle.id,
    strategy: bundle.strategy,
    suggestedSolution: bundle.suggestedSolution,
    estimatedBuildTimeDays: bundle.estimatedBuildTimeDays,
    strategyHash: bundle.strategyHash,
  };
}

// ----- v4: Bundle → Product Blueprint -----------------------------------
//
// generateProductBlueprint(bundleId) — extends a bundle's strategy with
// concrete build details (MVP scope, features, required agents, time to
// market, monetization). Cached on bundles.blueprint_hash. Independent
// hash from strategy_hash so blueprint can regenerate without
// invalidating the strategy cache.

const BLUEPRINT_SYSTEM_PROMPT =
  'You are a product designer turning a strategic play into a concrete '
  + 'build plan. Output strict JSON with these keys ONLY: '
  + '`mvp_scope` (1 sentence — what ships first), '
  + '`features` (array of 4-7 strings, each ≤120 chars — concrete capabilities), '
  + '`required_agents` (array of role names like "Data Engineer", '
  + '"Compliance Lead", "AI Pilot Lead", "Frontend Engineer"), '
  + '`time_to_market_weeks` (integer between 4 and 52), '
  + '`monetization_strategy` (1 sentence — pricing model + contract type). '
  + 'No prose outside the JSON. Be specific — name actual technologies '
  + 'and roles, never empty phrases.';

function blueprintHashFor(bundle, members) {
  const ids = members.map((m) => m.id).sort((a, b) => a - b).join('|');
  return crypto
    .createHash('sha256')
    .update(`${bundle.theme}::${ids}::blueprint-v1`)
    .digest('hex');
}

function buildBlueprintUserPrompt(bundle, members, strategy) {
  const lines = [
    `Cluster theme: ${bundle.theme}`,
    `Member count: ${members.length}`,
    `Total estimated value: $${Number(bundle.estimatedTotalValue || 0).toFixed(0)}`,
    '',
    'Strategy already chosen for this cluster:',
    `  what_to_build: ${strategy.what_to_build || ''}`,
    `  why_it_works: ${strategy.why_it_works || ''}`,
    `  suggested_solution: ${strategy.suggested_solution || ''}`,
    `  revenue_potential_usd: ${strategy.revenue_potential_usd || 0}`,
    '',
    'Member opportunities (title · category · value):',
  ];
  for (const m of members.slice(0, 12)) {
    lines.push(`  • ${m.title} · ${m.category || 'n/a'} · $${Number(m.value || 0).toFixed(0)}`);
  }
  return lines.join('\n');
}

function safeParseBlueprint(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const features = Array.isArray(obj.features)
      ? obj.features.map((f) => String(f).slice(0, 200)).slice(0, 10)
      : [];
    const agents = Array.isArray(obj.required_agents)
      ? obj.required_agents.map((a) => String(a).slice(0, 80)).slice(0, 10)
      : [];
    return {
      mvp_scope:             String(obj.mvp_scope || '').slice(0, 500),
      features,
      required_agents:       agents,
      time_to_market_weeks:  Number(obj.time_to_market_weeks) || null,
      monetization_strategy: String(obj.monetization_strategy || '').slice(0, 500),
    };
  } catch (e) {
    return null;
  }
}

async function generateProductBlueprint(bundleId, { force = false } = {}) {
  const bundle = await Bundle.findByPk(bundleId);
  if (!bundle) throw new Error(`bundle ${bundleId} not found`);

  // Blueprint extends a populated strategy. Without a strategy we don't
  // have enough context to design the build — fail loud rather than
  // generate a generic blueprint that papers over the gap.
  const strategy = bundle.strategy || {};
  if (!strategy.what_to_build) {
    throw new Error('bundle has no strategy yet — generate a strategy first');
  }

  const ids = Array.isArray(bundle.opportunityIds) ? bundle.opportunityIds : [];
  if (ids.length === 0) {
    throw new Error(`bundle ${bundleId} has no member opportunities`);
  }
  const members = await Opportunity.findAll({
    where: { id: ids },
    attributes: ['id', 'title', 'category', 'value'],
  });
  const hash = blueprintHashFor(bundle, members);

  if (!force
      && bundle.blueprintHash === hash
      && bundle.blueprint
      && bundle.blueprint.mvp_scope) {
    return {
      cached: true,
      bundleId: bundle.id,
      blueprint: bundle.blueprint,
      blueprintHash: bundle.blueprintHash,
    };
  }

  // v6: enforce plan limit on cache MISS only.
  await billing.enforceOrThrow({
    organizationId: bundle.organizationId || null,
    metric: 'blueprints_generated',
  });

  const aiClient = getAIClient();
  const { content } = await aiClient.chat(
    BLUEPRINT_SYSTEM_PROMPT,
    buildBlueprintUserPrompt(bundle, members, strategy),
    { temperature: 0.4, maxTokens: 700, responseFormat: 'json_object' },
  );

  const parsed = safeParseBlueprint(content);
  if (!parsed) {
    throw new Error('AI returned unparseable JSON for bundle blueprint');
  }
  const blueprintRow = {
    ...parsed,
    generated_at: new Date().toISOString(),
    model: 'gpt-4o-mini',
  };

  bundle.blueprint = blueprintRow;
  bundle.blueprintHash = hash;
  await bundle.save();

  logger.info('OIED bundler: blueprint generated', {
    bundleId: bundle.id,
    theme: bundle.theme,
    features: parsed.features.length,
    timeToMarket: parsed.time_to_market_weeks,
  });

  // v5: record billable usage on cache MISS only.
  await billing.recordUsage({
    organizationId: bundle.organizationId || null,
    metric: 'blueprints_generated',
    metadata: { bundleId: bundle.id, features: parsed.features.length },
  }).catch(() => null);

  return {
    cached: false,
    bundleId: bundle.id,
    blueprint: bundle.blueprint,
    blueprintHash: bundle.blueprintHash,
  };
}

module.exports = {
  buildBundles,
  listBundles,
  getBundle,
  clusterKey,
  buildTheme,
  topKeywords,
  generateBundleStrategy,
  generateProductBlueprint,
  strategyHashFor,
  blueprintHashFor,
  safeParseStrategy,
  safeParseBlueprint,
  buildStrategyUserPrompt,
  buildBlueprintUserPrompt,
  STRATEGY_SYSTEM_PROMPT,
  BLUEPRINT_SYSTEM_PROMPT,
  MIN_BUNDLE_SIZE,
};
