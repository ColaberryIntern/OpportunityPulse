// Deep Research Phase 8 — capture strategy intelligence.
//
// Composes capture-plan snapshots from the persisted intelligence
// (recurring agencies, competing tools, justification, expansion, past
// wins). Deterministic + explainable — no AI dependency in v1.
//
// Persisted in capture_strategies. One row per (scope_kind, scope_id|value)
// — re-runs replace the prior row.

const { Op } = require('sequelize');
const {
  PursuitWorkspace, Opportunity, OpportunityRelationship,
  CaptureStrategy, ProposalAccelerationAsset, AiTool,
} = require('../models');
const competingTools = require('./competingTools.service');
const opportunityRelationships = require('./opportunityRelationships.service');

// Heuristic evaluator-priority hints. The relationship engine + the
// per-opportunity vocabulary gives us the agency's signature themes;
// we surface them as "what the evaluators have rewarded before".
function deriveEvaluatorPriorities({ agencyHistory, recurringThemes }) {
  const out = [];
  for (const theme of recurringThemes.slice(0, 4)) {
    out.push({
      label: `Emphasize ${theme.value} — recurs ${theme.count}x across recent procurements.`,
      weight: Math.min(100, theme.count * 8),
    });
  }
  if (agencyHistory.length > 0) {
    out.push({
      label: `${agencyHistory[0].agency} has historically prioritized rapid-deployment vendors.`,
      weight: 60,
    });
  }
  return out;
}

function deriveAgencyPainPoints({ pursuitOpps, agencyHistory }) {
  const out = [];
  const lowValueCount = pursuitOpps.filter((o) => Number(o.value || 0) < 100_000).length;
  if (lowValueCount >= 3) {
    out.push({ label: 'Sub-$100k opportunity cluster — budgets are tight, value-engineer pricing.', weight: 70 });
  }
  if (pursuitOpps.length >= 5) {
    out.push({ label: 'Recurring, similar opportunity volume suggests an unmet workflow need.', weight: 60 });
  }
  if (agencyHistory.length > 0) {
    out.push({ label: `${agencyHistory[0].agency} re-procures similar work regularly — repeat-buyer pattern.`, weight: 65 });
  }
  return out;
}

function deriveDifferentiators({ saturation, competingToolsList }) {
  const out = [];
  const dominant = competingToolsList.filter((t) => ['dominant', 'explosive'].includes(t.momentumStage));
  if (dominant.length >= 2) {
    out.push({ label: 'Position against incumbents on customization + agency-specific compliance, not feature parity.', weight: 85 });
  }
  if (saturation === 'empty' || saturation === 'emerging') {
    out.push({ label: 'Lead with "we are the first to do this in this domain" — claim the framework, not the feature.', weight: 80 });
  }
  if (competingToolsList.some((t) => (t.pricingTier || '').toLowerCase() === 'enterprise')) {
    out.push({ label: 'Differentiated pricing — mid-market accessibility undercuts enterprise-only incumbents.', weight: 70 });
  }
  if (out.length === 0) {
    out.push({ label: 'Standard differentiation: speed, domain expertise, past-performance reuse.', weight: 50 });
  }
  return out;
}

function derivePositioning({ pursuitOpps, agencyHistory, pastWinCount }) {
  const out = [];
  if (pastWinCount > 0) {
    out.push({ label: `Open with the ${pastWinCount} approved past-win${pastWinCount === 1 ? '' : 's'} — past performance is the highest-trust signal.`, weight: 90 });
  }
  if (pursuitOpps.length >= 3) {
    out.push({ label: 'Bundle proposal language across the linked opportunities — emphasize the platform, not the one-off.', weight: 75 });
  }
  if (agencyHistory.length > 0) {
    out.push({ label: `Reference ${agencyHistory[0].agency}'s prior procurement history explicitly.`, weight: 70 });
  }
  return out;
}

function deriveIncumbentRisks({ competingToolsList }) {
  const dominant = competingToolsList.filter((t) => ['dominant', 'explosive'].includes(t.momentumStage));
  return dominant.slice(0, 4).map((t) => ({
    incumbent: t.name,
    vendor: t.vendor,
    momentum: t.momentumStage,
    severity: Math.min(100, Math.round(70 + (Number(t.trendingScore || 0) / 4))),
    notes: `${t.name} is ${t.momentumStage} — bid as a wedge or partner, not head-on.`,
  }));
}

function derivePartnershipOpportunities({ competingToolsList }) {
  // Open-source tools and emerging-stage tools are softer partnership targets.
  return competingToolsList
    .filter((t) => t.openSource === true || t.momentumStage === 'emerging')
    .slice(0, 4)
    .map((t) => ({
      partner: t.name,
      vendor: t.vendor,
      rationale: t.openSource
        ? 'Open-source tool — integrate or sponsor.'
        : 'Emerging player — possible white-label / OEM angle.',
    }));
}

function deriveReusableLanguage({ pastWinAssets, recurringThemes }) {
  const out = [];
  for (const asset of pastWinAssets.slice(0, 3)) {
    out.push({
      label: asset.label,
      snippet: String(asset.content || '').slice(0, 220),
      strength: Number(asset.strength || 0),
    });
  }
  for (const theme of recurringThemes.slice(0, 2)) {
    out.push({
      label: `Theme: ${theme.value}`,
      snippet: `Recurs ${theme.count}x — reuse "${theme.value}" as a section header / capability claim.`,
      strength: Math.min(80, theme.count * 5),
    });
  }
  return out;
}

function composeNarrative({ scopeLabel, pursuitOppCount, agencyHistory, competingToolsList, recurringThemes }) {
  const parts = [];
  parts.push(`Capture plan for ${scopeLabel}:`);
  parts.push(`${pursuitOppCount} linked opportunit${pursuitOppCount === 1 ? 'y' : 'ies'}.`);
  if (agencyHistory.length > 0) {
    parts.push(`Primary agency: ${agencyHistory[0].agency} (${agencyHistory[0].count} prior pursuits in the corpus).`);
  }
  if (competingToolsList.length > 0) {
    parts.push(`${competingToolsList.length} competing tools in scope.`);
  }
  if (recurringThemes.length > 0) {
    parts.push(`Recurring themes: ${recurringThemes.slice(0, 3).map((r) => r.value).join(', ')}.`);
  }
  return parts.join(' ');
}

// Build a capture strategy for a pursuit. The pursuit is the most useful
// scope because it already aggregates opps + linked outputs + linked
// acceleration assets.
async function buildForPursuit(pursuitId) {
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) {
    const err = new Error(`Pursuit ${pursuitId} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  const oppIds = Array.isArray(pursuit.linkedOpportunityIds) ? pursuit.linkedOpportunityIds : [];
  const pursuitOpps = oppIds.length
    ? (await Opportunity.findAll({ where: { id: { [Op.in]: oppIds } } })).map((o) => o.toJSON())
    : [];

  // Recurring themes across the pursuit's opps (technology vocabulary).
  const themeCounts = new Map();
  const agencyCounts = new Map();
  for (const opp of pursuitOpps) {
    for (const t of opportunityRelationships.extractTechnologies(opp)) {
      themeCounts.set(t, (themeCounts.get(t) || 0) + 1);
    }
    const a = opportunityRelationships.extractAgency(opp);
    if (a) agencyCounts.set(a, (agencyCounts.get(a) || 0) + 1);
  }
  const recurringThemes = Array.from(themeCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8);
  const agencyHistory = Array.from(agencyCounts.entries())
    .map(([agency, count]) => ({ agency, count }))
    .sort((a, b) => b.count - a.count).slice(0, 4);

  // Competing tools — query the registry with the pursuit's vocabulary.
  let competingToolsList = [];
  let saturation = 'empty';
  if (recurringThemes.length > 0) {
    const ct = await competingTools.findCompetingTools({
      searchTerm: recurringThemes.map((t) => t.value).join(' '),
      context: { channels: [{ items: pursuitOpps.slice(0, 12).map((o) => ({ title: o.title })) }] },
      max: 8,
    });
    saturation = ct.saturation_signal;
    // Hydrate stage info from the registry rows themselves.
    if (Array.isArray(ct.tools)) {
      competingToolsList = ct.tools.map((t) => ({
        name: t.name, vendor: t.vendor,
        category: t.category, momentumStage: t.momentum_stage,
        trendingScore: t.trending_score, openSource: t.open_source,
        pricingTier: t.pricing_tier,
      }));
    }
  }

  // Past-win assets — top approved acceleration assets.
  const pastWinAssets = (await ProposalAccelerationAsset.findAll({
    where: { assetKind: 'past_win' },
    order: [['strength', 'DESC']],
    limit: 6,
  })).map((r) => r.toJSON());

  const scopeLabel = pursuit.name;
  const evaluatorPriorities = deriveEvaluatorPriorities({ agencyHistory, recurringThemes });
  const agencyPainPoints = deriveAgencyPainPoints({ pursuitOpps, agencyHistory });
  const differentiators = deriveDifferentiators({ saturation, competingToolsList });
  const positioningRecommendations = derivePositioning({
    pursuitOpps, agencyHistory, pastWinCount: pastWinAssets.length,
  });
  const incumbentRisks = deriveIncumbentRisks({ competingToolsList });
  const partnershipOpportunities = derivePartnershipOpportunities({ competingToolsList });
  const reusableLanguage = deriveReusableLanguage({ pastWinAssets, recurringThemes });
  const narrative = composeNarrative({
    scopeLabel, pursuitOppCount: pursuitOpps.length,
    agencyHistory, competingToolsList, recurringThemes,
  });

  // Idempotent rewrite per (scope_kind, scope_id).
  await CaptureStrategy.destroy({ where: { scopeKind: 'pursuit', scopeId: pursuit.id } });
  const row = await CaptureStrategy.create({
    scopeKind: 'pursuit',
    scopeId: pursuit.id,
    scopeValue: pursuit.name,
    evaluatorPriorities,
    agencyPainPoints,
    differentiators,
    positioningRecommendations,
    incumbentRisks,
    partnershipOpportunities,
    reusableLanguage,
    recurringThemes,
    narrative,
  });
  return row.toJSON();
}

async function getLatestForPursuit(pursuitId) {
  const row = await CaptureStrategy.findOne({
    where: { scopeKind: 'pursuit', scopeId: Number(pursuitId) },
    order: [['computed_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

module.exports = {
  deriveEvaluatorPriorities, deriveAgencyPainPoints, deriveDifferentiators,
  derivePositioning, deriveIncumbentRisks, derivePartnershipOpportunities,
  deriveReusableLanguage, composeNarrative,
  buildForPursuit, getLatestForPursuit,
};
