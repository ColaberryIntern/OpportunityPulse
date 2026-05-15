// Deep Research Phase 7 — strategic cluster drilldown workspace.
//
// Click a cluster → get an explainable workspace: every opportunity in the
// cluster, plus recurring themes / agencies / technologies / vendors / NAICS
// / strategic language inside that cluster. Cached in cluster_drilldowns,
// refreshable.

const { Op } = require('sequelize');
const {
  Opportunity, OpportunityClassification, StrategicCluster,
  ClusterDrilldown,
} = require('../models');
const relationships = require('./opportunityRelationships.service');

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'by', 'as', 'is', 'are', 'was', 'be', 'this', 'that', 'these',
  'those', 'will', 'shall', 'may', 'should', 'we', 'our', 'your', 'you',
  'their', 'they', 'i', 'it', 'its', 'from', 'have', 'has', 'had', 'not',
  'but', 'all', 'any', 'each', 'no', 'do', 'does', 'such', 'than', 'then',
  'so', 'if', 'when', 'where', 'how', 'why', 'what', 'who', 'which',
  'about', 'into', 'including', 'across', 'over', 'under', 'between',
  'within', 'without', 'must', 'can', 'could', 'would',
]);

function topTerms(texts, { limit = 12 } = {}) {
  const counts = new Map();
  for (const t of texts) {
    const words = String(t || '').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [];
    for (const w of words) {
      if (STOP_WORDS.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function topPhrases(texts, { limit = 10 } = {}) {
  const counts = new Map();
  for (const t of texts) {
    const cleaned = String(t || '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ');
    const words = cleaned.split(/\s+/).filter((w) => w && !STOP_WORDS.has(w) && w.length > 2);
    for (let i = 0; i < words.length - 1; i += 1) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function summarizeBy(opps, extractor, { limit = 10 } = {}) {
  const counts = new Map();
  for (const o of opps) {
    const vals = extractor(o);
    const arr = Array.isArray(vals) ? vals : (vals ? [vals] : []);
    for (const v of arr) {
      const key = String(v || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function summarizeSources(opps) {
  const sources = {};
  for (const o of opps) {
    const k = o.source || o.type || 'unknown';
    sources[k] = (sources[k] || 0) + 1;
  }
  return sources;
}

async function loadClusterOpportunities(clusterId, { limit = 200 } = {}) {
  const classifications = await OpportunityClassification.findAll({
    where: { clusterId }, limit,
  });
  const oppIds = classifications.map((c) => c.opportunityId);
  if (oppIds.length === 0) return [];
  const opps = await Opportunity.findAll({ where: { id: { [Op.in]: oppIds } } });
  return opps.map((o) => o.toJSON());
}

function buildDrilldown(opportunities) {
  const titles = opportunities.map((o) => o.title || '');
  const descriptions = opportunities.map((o) => o.description || '');
  const themes = topTerms([...titles, ...descriptions], { limit: 12 });
  const strategicLanguage = topPhrases(descriptions, { limit: 10 });
  const agencies = summarizeBy(opportunities, (o) => relationships.extractAgency(o), { limit: 10 });
  const technologies = summarizeBy(opportunities, (o) => relationships.extractTechnologies(o), { limit: 10 });
  const vendors = summarizeBy(opportunities, (o) => relationships.extractVendor(o), { limit: 10 });
  const naics = summarizeBy(opportunities, (o) => relationships.extractNaicsList(o), { limit: 10 });
  const sources = summarizeSources(opportunities);
  return {
    themes, agencies, technologies, vendors, naics,
    strategic_language: strategicLanguage, sources,
    sample_opportunity_ids: opportunities.slice(0, 50).map((o) => o.id),
  };
}

async function refreshDrilldown(clusterId) {
  const cluster = await StrategicCluster.findByPk(clusterId);
  if (!cluster) { const err = new Error(`Cluster ${clusterId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const opps = await loadClusterOpportunities(clusterId);
  const drilldown = buildDrilldown(opps);
  // Idempotent: one row per cluster, refreshed in place.
  await ClusterDrilldown.destroy({ where: { clusterId } });
  const row = await ClusterDrilldown.create({
    clusterId,
    opportunityCount: opps.length,
    themes: drilldown.themes,
    agencies: drilldown.agencies,
    technologies: drilldown.technologies,
    vendors: drilldown.vendors,
    naics: drilldown.naics,
    strategicLanguage: drilldown.strategic_language,
    sources: drilldown.sources,
    sampleOpportunityIds: drilldown.sample_opportunity_ids,
  });
  return row.toJSON();
}

async function refreshAllDrilldowns({ limit = 50 } = {}) {
  const clusters = await StrategicCluster.findAll({
    where: { isActive: true }, limit, order: [['opportunity_count', 'DESC']],
  });
  let count = 0;
  const errors = [];
  for (const c of clusters) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await refreshDrilldown(c.id);
      count += 1;
    } catch (e) {
      errors.push({ cluster_id: c.id, error: e.message });
    }
  }
  return { refreshed: count, errors };
}

async function getDrilldown(clusterId, { limit = 200 } = {}) {
  const cluster = await StrategicCluster.findByPk(clusterId);
  if (!cluster) { const err = new Error(`Cluster ${clusterId} not found`); err.code = 'NOT_FOUND'; throw err; }
  const existing = await ClusterDrilldown.findOne({
    where: { clusterId }, order: [['computed_at', 'DESC']],
  });
  const opps = await loadClusterOpportunities(clusterId, { limit });
  // If no cached drilldown, build it inline so the UI works on first hit.
  let drilldown;
  if (existing) {
    drilldown = existing.toJSON();
  } else {
    const built = buildDrilldown(opps);
    drilldown = {
      cluster_id: clusterId, opportunity_count: opps.length,
      themes: built.themes, agencies: built.agencies, technologies: built.technologies,
      vendors: built.vendors, naics: built.naics,
      strategicLanguage: built.strategic_language, sources: built.sources,
      sampleOpportunityIds: built.sample_opportunity_ids,
      cached: false,
    };
  }
  return {
    cluster: cluster.toJSON(),
    drilldown,
    opportunities: opps,
  };
}

module.exports = {
  STOP_WORDS,
  topTerms, topPhrases, summarizeBy, summarizeSources,
  buildDrilldown,
  loadClusterOpportunities,
  refreshDrilldown, refreshAllDrilldowns,
  getDrilldown,
};
