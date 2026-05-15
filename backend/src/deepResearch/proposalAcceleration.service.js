// Deep Research Phase 7 — proposal acceleration assets.
//
// Mines existing OpportunityOutputs + OrganizationProfile + opportunities
// for reusable proposal components. Persisted in proposal_acceleration_assets.
//
// Asset kinds:
//   past_win            — approved OpportunityOutput rows (proposals/offers)
//   capability_blurb    — service lines from OrganizationProfile.services
//   staffing_template   — recurring staffing role bundle from past wins
//   pricing_template    — recurring pricing language
//   naics_match         — frequent NAICS codes the org tends to win
//   agency_history      — agencies the org has engaged with before

const { Op } = require('sequelize');
const {
  Opportunity, OpportunityOutput, OrganizationProfile,
  ProposalAccelerationAsset,
} = require('../models');
const relationships = require('./opportunityRelationships.service');

const APPROVED_STATUSES = new Set(['approved']);

async function buildPastWinAssets() {
  // OpportunityOutput where type in proposal/offer/analysis AND status='approved'.
  const outputs = await OpportunityOutput.findAll({
    where: { type: { [Op.in]: ['proposal', 'offer', 'analysis'] } },
    limit: 200, order: [['updated_at', 'DESC']],
  });
  const approved = outputs.filter((o) => APPROVED_STATUSES.has(o.status));
  const assets = [];
  for (const out of approved) {
    const body = String(out.content || '').slice(0, 4000);
    if (!body.trim()) continue;
    assets.push({
      assetKind: 'past_win',
      label: `${out.type} · output #${out.id}`,
      content: body,
      tags: [out.type],
      sourceKind: 'opportunity_output',
      sourceId: out.id,
      strength: 70,
      metadata: { type: out.type, status: out.status, opportunity_id: out.opportunityId },
    });
  }
  return assets;
}

async function buildCapabilityBlurbAssets() {
  const profiles = await OrganizationProfile.findAll();
  const assets = [];
  for (const p of profiles) {
    const services = Array.isArray(p.services) ? p.services : [];
    for (const s of services) {
      const label = typeof s === 'string' ? s : (s.name || s.label || s.title || '');
      const content = typeof s === 'string' ? s : (s.description || s.summary || s.blurb || label);
      if (!label) continue;
      assets.push({
        assetKind: 'capability_blurb',
        label,
        content,
        tags: ['capability'],
        sourceKind: 'organization_profile',
        sourceId: p.id,
        strength: 70,
        metadata: { profile_id: p.id },
      });
    }
  }
  return assets;
}

async function buildNaicsAssets() {
  // Top NAICS codes seen in approved outputs' related opportunities — proxy:
  // outputs flagged 'approved' indicate the org won/pursued in that NAICS.
  const outputs = await OpportunityOutput.findAll({
    where: { status: 'approved' }, limit: 500,
  });
  const oppIds = [...new Set(outputs.map((o) => o.opportunityId).filter(Boolean))];
  if (oppIds.length === 0) return [];
  const opps = await Opportunity.findAll({ where: { id: { [Op.in]: oppIds } } });
  const counts = new Map();
  for (const opp of opps) {
    const list = relationships.extractNaicsList(opp.toJSON());
    for (const code of list) counts.set(code, (counts.get(code) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .map(([code, c]) => ({
      assetKind: 'naics_match',
      label: `NAICS ${code} (${c} historical pursuits)`,
      content: `Historical pursuits in NAICS ${code}: ${c}. Surface this code in proposal capability statements when responding to matching solicitations.`,
      tags: [code],
      sourceKind: 'opportunity',
      sourceId: null,
      strength: Math.min(100, 50 + c * 10),
      metadata: { naics_code: code, count: c },
    }));
}

async function buildAgencyHistoryAssets() {
  const outputs = await OpportunityOutput.findAll({
    where: { status: 'approved' }, limit: 500,
  });
  const oppIds = [...new Set(outputs.map((o) => o.opportunityId).filter(Boolean))];
  if (oppIds.length === 0) return [];
  const opps = await Opportunity.findAll({ where: { id: { [Op.in]: oppIds } } });
  const counts = new Map();
  for (const opp of opps) {
    const a = relationships.extractAgency(opp.toJSON());
    if (a) counts.set(a, (counts.get(a) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .map(([agency, c]) => ({
      assetKind: 'agency_history',
      label: `${agency} (${c} prior pursuits)`,
      content: `Colaberry has engaged with ${agency} on ${c} prior pursuit${c === 1 ? '' : 's'}. Reference past performance in proposal sections.`,
      tags: ['agency'],
      sourceKind: 'opportunity',
      sourceId: null,
      strength: Math.min(100, 50 + c * 10),
      metadata: { agency, count: c },
    }));
}

async function refreshAssets() {
  const [pastWins, capabilityBlurbs, naicsMatches, agencyHistory] = await Promise.all([
    buildPastWinAssets().catch(() => []),
    buildCapabilityBlurbAssets().catch(() => []),
    buildNaicsAssets().catch(() => []),
    buildAgencyHistoryAssets().catch(() => []),
  ]);
  const all = [...pastWins, ...capabilityBlurbs, ...naicsMatches, ...agencyHistory];
  await ProposalAccelerationAsset.destroy({ where: {} });
  for (const a of all) {
    // eslint-disable-next-line no-await-in-loop
    await ProposalAccelerationAsset.create(a);
  }
  return {
    total: all.length,
    past_wins: pastWins.length,
    capability_blurbs: capabilityBlurbs.length,
    naics_matches: naicsMatches.length,
    agency_history: agencyHistory.length,
  };
}

async function listAssets({ assetKind = null, limit = 50 } = {}) {
  const where = {};
  if (assetKind) where.assetKind = assetKind;
  const rows = await ProposalAccelerationAsset.findAll({
    where, order: [['strength', 'DESC']],
    limit: Math.min(200, Number(limit) || 50),
  });
  return rows.map((r) => r.toJSON());
}

// For a given opportunity, surface the most relevant assets — match by
// NAICS / agency / tags / tech keywords.
async function suggestForOpportunity(opportunityId) {
  const opp = await Opportunity.findByPk(opportunityId);
  if (!opp) return [];
  const oppJson = opp.toJSON();
  const naics = new Set(relationships.extractNaicsList(oppJson));
  const agency = relationships.extractAgency(oppJson);
  const tech = new Set(relationships.extractTechnologies(oppJson).map((t) => t.toLowerCase()));
  const all = await ProposalAccelerationAsset.findAll({ order: [['strength', 'DESC']] });
  const scored = all.map((a) => {
    const j = a.toJSON();
    let score = Number(j.strength || 0);
    if (j.assetKind === 'naics_match' && j.metadata && naics.has(j.metadata.naics_code)) score += 30;
    if (j.assetKind === 'agency_history' && j.metadata && agency && j.metadata.agency === agency) score += 30;
    const tags = Array.isArray(j.tags) ? j.tags.map((t) => String(t).toLowerCase()) : [];
    if (tags.some((t) => tech.has(t))) score += 20;
    return { ...j, _suggest_score: score };
  });
  return scored
    .filter((s) => s._suggest_score > 30)
    .sort((a, b) => b._suggest_score - a._suggest_score)
    .slice(0, 12);
}

module.exports = {
  APPROVED_STATUSES,
  buildPastWinAssets, buildCapabilityBlurbAssets,
  buildNaicsAssets, buildAgencyHistoryAssets,
  refreshAssets, listAssets, suggestForOpportunity,
};
