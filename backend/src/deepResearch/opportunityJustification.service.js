// Deep Research Phase 7 — justification engine.
//
// For any insight, composes an explainable narrative: headline, factors,
// channels that contributed, top supporting opportunities, confidence. The
// composition is deterministic — no AI dependency. Persists snapshots in
// justification_records for audit.

const { Op } = require('sequelize');
const {
  JustificationRecord, Opportunity,
} = require('../models');
const opportunityTraceability = require('./opportunityTraceability.service');

function summarizeChannels(opportunities) {
  const channels = {};
  for (const o of opportunities) {
    const k = o.type || 'unknown';
    channels[k] = (channels[k] || 0) + 1;
  }
  return channels;
}

function computeFactors(opportunities) {
  if (opportunities.length === 0) return [];
  const channels = summarizeChannels(opportunities);
  const factors = [];
  const total = opportunities.length;
  for (const [channel, count] of Object.entries(channels)) {
    factors.push({
      label: `${count} ${channel.replace(/_/g, ' ')} signals`,
      weight: Math.round((count / total) * 100),
      channel,
    });
  }
  const avgScore = opportunities.reduce(
    (acc, o) => acc + Number(o.aiScore || 0), 0,
  ) / Math.max(1, total);
  if (avgScore > 0) {
    factors.push({
      label: `Mean AI score across ${total} supporting opportunities: ${avgScore.toFixed(1)}`,
      weight: Math.min(100, Math.round(avgScore)),
      channel: 'ai_score',
    });
  }
  return factors.sort((a, b) => b.weight - a.weight);
}

function composeNarrative(insightKind, opportunities, channels) {
  if (opportunities.length === 0) {
    return `No supporting opportunities are currently linked to this ${insightKind}. `
      + 'This typically means the underlying report has not been re-indexed or the insight is '
      + 'derived from aggregate analytics rather than direct opportunity matches.';
  }
  const channelEntries = Object.entries(channels)
    .sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`);
  return `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} `
    + `directly support this ${insightKind}, weighted across `
    + `${channelEntries.join(', ')}. Each link is preserved as an auditable traceability row — `
    + 'expand the Evidence panel to inspect the original contracts, jobs, grants, or research.';
}

function composeHeadline(insightKind, opportunities) {
  if (opportunities.length === 0) {
    return `${insightKind} (no traced evidence yet — refresh traceability)`;
  }
  const channels = summarizeChannels(opportunities);
  const top = Object.entries(channels).sort((a, b) => b[1] - a[1])[0];
  return `${opportunities.length} supporting opportunit${opportunities.length === 1 ? 'y' : 'ies'}`
    + ` (top channel: ${top[0]} × ${top[1]})`;
}

function deriveConfidence(opportunities) {
  if (opportunities.length === 0) return 0;
  // Confidence rises with both volume and average relevance.
  const meanRel = opportunities.reduce(
    (acc, o) => acc + Number((o._trace && o._trace.relevance) || 50), 0,
  ) / opportunities.length;
  const volumeBoost = Math.min(40, opportunities.length * 2);
  return Math.max(0, Math.min(100, Math.round(meanRel * 0.6 + volumeBoost)));
}

async function buildJustification(insightKind, insightId) {
  const { opportunities } = await opportunityTraceability.getSupportingOpportunities(
    insightKind, insightId, { limit: 80 },
  );
  const channels = summarizeChannels(opportunities);
  const factors = computeFactors(opportunities);
  const headline = composeHeadline(insightKind, opportunities);
  const narrative = composeNarrative(insightKind, opportunities, channels);
  const confidence = deriveConfidence(opportunities);
  return {
    insight_kind: insightKind, insight_id: insightId,
    headline, narrative, factors, channels,
    supporting_opportunity_ids: opportunities.slice(0, 25).map((o) => o.id),
    confidence,
    opportunities,
  };
}

async function persistJustification(insightKind, insightId) {
  const j = await buildJustification(insightKind, insightId);
  // Idempotent: one row per (kind, id) — overwrite.
  await JustificationRecord.destroy({ where: { insightKind, insightId } });
  const row = await JustificationRecord.create({
    insightKind, insightId,
    headline: j.headline, narrative: j.narrative,
    factors: j.factors, channels: j.channels,
    supportingOpportunityIds: j.supporting_opportunity_ids,
    confidence: j.confidence,
  });
  return row.toJSON();
}

async function getJustification(insightKind, insightId, { rebuild = false } = {}) {
  if (rebuild) {
    await persistJustification(insightKind, insightId);
  }
  const existing = await JustificationRecord.findOne({
    where: { insightKind, insightId },
    order: [['computed_at', 'DESC']],
  });
  if (existing) {
    // Hydrate supporting opportunities for the panel.
    const ids = Array.isArray(existing.supportingOpportunityIds)
      ? existing.supportingOpportunityIds : [];
    let opps = [];
    if (ids.length > 0) {
      opps = (await Opportunity.findAll({ where: { id: { [Op.in]: ids } } }))
        .map((o) => o.toJSON());
    }
    return { ...existing.toJSON(), opportunities: opps };
  }
  // No persisted record — build on the fly.
  return buildJustification(insightKind, insightId);
}

module.exports = {
  summarizeChannels, computeFactors,
  composeHeadline, composeNarrative, deriveConfidence,
  buildJustification, persistJustification, getJustification,
};
