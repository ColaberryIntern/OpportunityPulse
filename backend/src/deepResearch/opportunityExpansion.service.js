// Deep Research Phase 8 — opportunity expansion engine.
//
// Given an anchor (cluster / agency / technology / research_run / pattern /
// opportunity), expand into adjacent strategic territory:
//   - related opportunities (other opps that share the anchor's agencies /
//     technologies / NAICS)
//   - adjacent agencies (agencies that recur on the same kind of work)
//   - adjacent technologies
//   - recurring NAICS codes across the expansion set
//   - "future signals" — research/hiring/funding signals tied to the same
//     vocabulary
//
// Cached in opportunity_expansions. Deterministic + explainable.

const { Op } = require('sequelize');
const {
  Opportunity, OpportunityExpansion, OpportunityRelationship,
} = require('../models');
const deepResearchContext = require('./deepResearchContext.service');
const opportunityRelationships = require('./opportunityRelationships.service');

const VALID_ANCHOR_KINDS = [
  'cluster', 'agency', 'technology', 'research_run', 'pattern',
  'opportunity', 'venture',
];

function anchorIdForContext(anchorKind, anchorId) {
  if (anchorKind === 'research_run') return ['researchRun', anchorId];
  return [anchorKind, anchorId];
}

async function collectSeedOpportunityIds(anchorKind, anchorId) {
  if (anchorKind === 'opportunity') {
    const idNum = Number(anchorId);
    return Number.isInteger(idNum) ? [idNum] : [];
  }
  try {
    const [ctxKind, ctxId] = anchorIdForContext(anchorKind, anchorId);
    const ids = await deepResearchContext.resolveOpportunityIds(ctxKind, ctxId);
    return Array.isArray(ids) ? ids.slice(0, 200) : [];
  } catch (_) { return []; }
}

// Counts agencies / technologies / NAICS across a seed set, then queries
// the opportunity_relationships table for opportunities outside the seed
// set that share those entities.
async function expandFromSeeds(seedOpportunityIds, { cap = 30 } = {}) {
  if (seedOpportunityIds.length === 0) {
    return {
      related_opportunities: [],
      adjacent_agencies: [], adjacent_technologies: [], recurring_naics: [],
    };
  }
  const seedSet = new Set(seedOpportunityIds.map(Number));
  // Load each seed opp to pull agency / tech / NAICS from its sourceData /
  // description.
  const opps = await Opportunity.findAll({
    where: { id: { [Op.in]: seedOpportunityIds } },
  });
  const agencyCounts = new Map();
  const techCounts = new Map();
  const naicsCounts = new Map();
  for (const opp of opps) {
    const j = opp.toJSON();
    const agency = opportunityRelationships.extractAgency(j);
    if (agency) agencyCounts.set(agency, (agencyCounts.get(agency) || 0) + 1);
    for (const t of opportunityRelationships.extractTechnologies(j)) {
      techCounts.set(t, (techCounts.get(t) || 0) + 1);
    }
    for (const n of opportunityRelationships.extractNaicsList(j)) {
      naicsCounts.set(n, (naicsCounts.get(n) || 0) + 1);
    }
  }

  // Pull recurring-relationship rows that match any of the seed entities.
  const orClauses = [];
  for (const v of agencyCounts.keys()) orClauses.push({ relationshipType: 'agency', value: v });
  for (const v of techCounts.keys()) orClauses.push({ relationshipType: 'technology', value: v });
  for (const v of naicsCounts.keys()) orClauses.push({ relationshipType: 'naics', value: v });
  let adjacentOppIds = new Set();
  if (orClauses.length > 0) {
    const rows = await OpportunityRelationship.findAll({
      where: { [Op.or]: orClauses }, limit: 200,
    });
    for (const r of rows) {
      const ids = Array.isArray(r.opportunityIds) ? r.opportunityIds : [];
      for (const id of ids) {
        if (!seedSet.has(Number(id))) adjacentOppIds.add(Number(id));
      }
    }
  }
  adjacentOppIds = Array.from(adjacentOppIds).slice(0, cap);

  // Hydrate adjacent opp titles for the UI.
  let relatedOpps = [];
  if (adjacentOppIds.length > 0) {
    const adj = await Opportunity.findAll({
      where: { id: { [Op.in]: adjacentOppIds } },
      attributes: ['id', 'title', 'type', 'source', 'aiScore', 'value', 'publishedAt'],
      limit: cap,
    });
    relatedOpps = adj.map((o) => o.toJSON());
  }

  const sortDescByCount = (m) => Array.from(m.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    related_opportunities: relatedOpps,
    adjacent_agencies: sortDescByCount(agencyCounts),
    adjacent_technologies: sortDescByCount(techCounts),
    recurring_naics: sortDescByCount(naicsCounts),
  };
}

async function refreshExpansion(anchorKind, anchorId) {
  if (!VALID_ANCHOR_KINDS.includes(anchorKind)) {
    const err = new Error(`Invalid anchor_kind ${anchorKind}`); err.code = 'BAD_INPUT'; throw err;
  }
  const seeds = await collectSeedOpportunityIds(anchorKind, anchorId);
  const expansion = await expandFromSeeds(seeds);

  // Future signals — pick the top adjacent technology / agency as a hint
  // about what's coming next. Deterministic placeholder.
  const futureSignals = [];
  if (expansion.adjacent_technologies.length > 0) {
    futureSignals.push({
      kind: 'technology_trend',
      label: `Watch ${expansion.adjacent_technologies[0].value}`,
      count: expansion.adjacent_technologies[0].count,
    });
  }
  if (expansion.adjacent_agencies.length > 0) {
    futureSignals.push({
      kind: 'agency_focus',
      label: `${expansion.adjacent_agencies[0].value} pattern`,
      count: expansion.adjacent_agencies[0].count,
    });
  }

  const rationale = `Expanded from ${anchorKind} ${anchorId}: ${seeds.length} seed opportunit${seeds.length === 1 ? 'y' : 'ies'}, `
    + `${expansion.related_opportunities.length} adjacent opps, `
    + `${expansion.adjacent_agencies.length} agencies, `
    + `${expansion.adjacent_technologies.length} technologies.`;

  // Idempotent rewrite — one row per (anchor_kind, anchor_id).
  await OpportunityExpansion.destroy({
    where: { anchorKind, anchorId: String(anchorId).slice(0, 200) },
  });
  const row = await OpportunityExpansion.create({
    anchorKind,
    anchorId: String(anchorId).slice(0, 200),
    relatedOpportunities: expansion.related_opportunities,
    adjacentAgencies: expansion.adjacent_agencies,
    adjacentTechnologies: expansion.adjacent_technologies,
    recurringNaics: expansion.recurring_naics,
    futureSignals,
    rationale,
  });
  return row.toJSON();
}

async function getExpansion(anchorKind, anchorId, { rebuild = false } = {}) {
  if (rebuild) {
    return refreshExpansion(anchorKind, anchorId);
  }
  const existing = await OpportunityExpansion.findOne({
    where: { anchorKind, anchorId: String(anchorId).slice(0, 200) },
    order: [['computed_at', 'DESC']],
  });
  if (existing) return existing.toJSON();
  return refreshExpansion(anchorKind, anchorId);
}

module.exports = {
  VALID_ANCHOR_KINDS,
  collectSeedOpportunityIds, expandFromSeeds,
  refreshExpansion, getExpansion,
};
