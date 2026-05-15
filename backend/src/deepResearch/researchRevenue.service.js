// Deep Research Phase 8 — research-to-revenue mapping.
//
// Bridges upstream signal channels (research papers / ecosystem acceleration /
// hiring spikes / funding spikes / strategic patterns) to downstream
// procurement opportunities. Generates one research_revenue_links row per
// signal it can map, with a strength score + an implementation_demand
// estimate.
//
// Deterministic + reuses opportunity_relationships + ai_tools to find the
// procurement footprint of a signal's vocabulary.

const { Op } = require('sequelize');
const {
  Opportunity, OpportunityRelationship, ResearchRevenueLink,
  AiTool,
} = require('../models');
const opportunityRelationships = require('./opportunityRelationships.service');
const competingTools = require('./competingTools.service');

// Implementation demand 0-100. Builds from: count of related procurement
// opps + agency diversity + co-occurrence with funded AI tools.
function implementationDemandScore({ opps, agencyCount, fundedToolCount }) {
  let score = 0;
  score += Math.min(40, opps * 2);
  score += Math.min(30, agencyCount * 6);
  score += Math.min(30, fundedToolCount * 8);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function strengthScore({ implementationDemand, signalRecencyDays }) {
  // Decay: signals older than 180 days drop strength linearly.
  const recencyFactor = signalRecencyDays == null ? 0.8
    : Math.max(0.3, 1 - (signalRecencyDays / 365));
  return Math.max(0, Math.min(100, Math.round(implementationDemand * recencyFactor)));
}

// Tokenize a label / title into the same vocabulary the relationship
// engine uses, so signal vocabulary maps to procurement vocabulary.
function tokenize(text) {
  return competingTools.tokenizeTerm(text).slice(0, 6);
}

// Map a single signal to a revenue link.
async function mapSignal({ signalKind, signalId, signalLabel, recencyDays = null }) {
  const tokens = tokenize(signalLabel);
  if (tokens.length === 0) {
    return null;
  }
  // Find opportunities matching any of the tokens — reuse a quick title+desc
  // ILIKE search bounded at 80.
  const orClauses = tokens.map((t) => ({
    [Op.or]: [
      { title: { [Op.iLike]: `%${t}%` } },
      { description: { [Op.iLike]: `%${t}%` } },
    ],
  }));
  const opps = await Opportunity.findAll({
    where: { status: 'active', [Op.or]: orClauses },
    limit: 80, order: [['published_at', 'DESC']],
  });
  if (opps.length === 0) {
    return null;
  }
  // Agencies + procurement themes from the matched opps.
  const agencyCounts = new Map();
  const themeCounts = new Map();
  for (const opp of opps) {
    const j = opp.toJSON();
    const agency = opportunityRelationships.extractAgency(j);
    if (agency) agencyCounts.set(agency, (agencyCounts.get(agency) || 0) + 1);
    for (const tech of opportunityRelationships.extractTechnologies(j)) {
      themeCounts.set(tech, (themeCounts.get(tech) || 0) + 1);
    }
  }
  // Co-occurring tools — pull from registry with same tokens.
  const toolOr = tokens.map((t) => ({
    [Op.or]: [
      { name: { [Op.iLike]: `%${t}%` } },
      { description: { [Op.iLike]: `%${t}%` } },
      { tags: { [Op.contains]: [t] } },
    ],
  }));
  const fundedTools = await AiTool.findAll({
    where: { status: 'active', fundingScore: { [Op.gt]: 0 }, [Op.or]: toolOr }, limit: 12,
  });

  const sortedAgencies = Array.from(agencyCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([value, count]) => ({ value, count }));
  const sortedThemes = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([value, count]) => ({ value, count }));

  const implementationDemand = implementationDemandScore({
    opps: opps.length,
    agencyCount: sortedAgencies.length,
    fundedToolCount: fundedTools.length,
  });
  const strength = strengthScore({ implementationDemand, signalRecencyDays: recencyDays });

  const rationale = `${signalKind} signal "${signalLabel}" maps to `
    + `${opps.length} procurement opportunit${opps.length === 1 ? 'y' : 'ies'} across `
    + `${sortedAgencies.length} agencies. `
    + `${fundedTools.length} funded tool${fundedTools.length === 1 ? '' : 's'} share the vocabulary, `
    + `implementation_demand ${implementationDemand}.`;

  // Idempotent rewrite per (signal_kind, signal_id, signal_label).
  await ResearchRevenueLink.destroy({
    where: { signalKind, signalId: signalId == null ? null : String(signalId), signalLabel },
  });
  const row = await ResearchRevenueLink.create({
    signalKind,
    signalId: signalId == null ? null : String(signalId).slice(0, 200),
    signalLabel: String(signalLabel).slice(0, 300),
    revenueOpportunityIds: opps.slice(0, 30).map((o) => o.id),
    targetAgencies: sortedAgencies,
    procurementThemes: sortedThemes,
    implementationDemand,
    strength,
    rationale,
  });
  return row.toJSON();
}

// Refresh the mapping by scanning the recurring-relationship aggregate for
// strong technology signals; each one becomes a candidate signal.
async function refreshFromRecurringRelationships({ minOccurrence = 4 } = {}) {
  const techs = await OpportunityRelationship.findAll({
    where: { relationshipType: 'technology', occurrenceCount: { [Op.gte]: minOccurrence } },
    order: [['occurrence_count', 'DESC']], limit: 30,
  });
  const out = [];
  for (const t of techs) {
    // eslint-disable-next-line no-await-in-loop
    const row = await mapSignal({
      signalKind: 'pattern', signalId: String(t.id),
      signalLabel: t.value, recencyDays: 30,
    });
    if (row) out.push(row);
  }
  return { generated: out.length, links: out };
}

async function listLinks({ signalKind = null, limit = 50 } = {}) {
  const where = {};
  if (signalKind) where.signalKind = signalKind;
  const rows = await ResearchRevenueLink.findAll({
    where, order: [['strength', 'DESC']],
    limit: Math.min(200, Number(limit) || 50),
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  tokenize, implementationDemandScore, strengthScore,
  mapSignal, refreshFromRecurringRelationships, listLinks,
};
