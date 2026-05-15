// Deep Research Phase 7 — recurring relationship detection.
//
// Deterministic. Scans the opportunity corpus and detects entities that
// recur across multiple opportunities — agencies, technologies, vendors,
// NAICS codes, ecosystem keywords. Each recurring entity becomes one row
// in opportunity_relationships.

const { Op } = require('sequelize');
const { Opportunity, OpportunityRelationship } = require('../models');

// Curated technology vocabulary — extend if a new keyword is dominant.
const TECH_VOCAB = [
  'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'nlp',
  'computer vision', 'rag', 'agent', 'agentic', 'genai', 'generative ai',
  'data science', 'analytics', 'data engineering', 'data warehouse',
  'cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'devops',
  'cybersecurity', 'zero trust', 'identity', 'iam',
  'blockchain', 'iot', 'edge computing', 'quantum',
  'workflow automation', 'rpa', 'process automation',
  'salesforce', 'snowflake', 'databricks', 'tableau', 'power bi',
  'react', 'angular', 'python', 'java', 'go', 'rust', 'typescript',
];

const NAICS_REGEX = /\b\d{6}\b/g;

function toToken(s) { return String(s || '').trim().toLowerCase(); }

function extractAgency(opp) {
  const sd = opp.sourceData || {};
  return sd.agency_name || sd.agency || sd.department || sd.organization
    || sd.buyer || sd.issuingAgency || sd.client || null;
}

function extractVendor(opp) {
  const sd = opp.sourceData || {};
  return sd.vendor || sd.contractor || sd.awardee || sd.prime || sd.company || null;
}

function extractNaicsList(opp) {
  const out = new Set();
  const sd = opp.sourceData || {};
  if (Array.isArray(sd.naics_codes)) sd.naics_codes.forEach((c) => out.add(String(c)));
  if (sd.naics_code) out.add(String(sd.naics_code));
  if (sd.naics) out.add(String(sd.naics));
  const haystack = `${opp.title || ''} ${opp.description || ''}`;
  const matches = haystack.match(NAICS_REGEX) || [];
  for (const m of matches) out.add(m);
  return Array.from(out).filter((c) => /^\d{6}$/.test(c));
}

function extractTechnologies(opp) {
  const haystack = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();
  const hits = new Set();
  for (const term of TECH_VOCAB) {
    if (haystack.includes(term)) hits.add(term);
  }
  return Array.from(hits);
}

function extractKeywords(opp) {
  return Array.isArray(opp.tags) ? opp.tags.map(toToken).filter(Boolean) : [];
}

// Build all recurring-relationship rows from a fresh corpus scan.
function buildRelationships(opportunities, { minOccurrence = 2 } = {}) {
  const buckets = {
    agency: new Map(),
    vendor: new Map(),
    naics: new Map(),
    technology: new Map(),
    keyword: new Map(),
  };

  function record(bucketKey, value, opp) {
    if (!value) return;
    const v = String(value).trim();
    if (!v) return;
    if (!buckets[bucketKey].has(v)) {
      buckets[bucketKey].set(v, {
        opportunityIds: [],
        firstSeen: new Date(opp.publishedAt || opp.createdAt || Date.now()),
        lastSeen: new Date(opp.publishedAt || opp.createdAt || Date.now()),
      });
    }
    const b = buckets[bucketKey].get(v);
    b.opportunityIds.push(opp.id);
    const ts = new Date(opp.publishedAt || opp.createdAt || Date.now());
    if (ts < b.firstSeen) b.firstSeen = ts;
    if (ts > b.lastSeen) b.lastSeen = ts;
  }

  for (const opp of opportunities) {
    const agency = extractAgency(opp);
    if (agency) record('agency', agency, opp);
    const vendor = extractVendor(opp);
    if (vendor) record('vendor', vendor, opp);
    for (const code of extractNaicsList(opp)) record('naics', code, opp);
    for (const tech of extractTechnologies(opp)) record('technology', tech, opp);
    for (const kw of extractKeywords(opp)) record('keyword', kw, opp);
  }

  const out = [];
  for (const [bucketKey, map] of Object.entries(buckets)) {
    for (const [value, info] of map.entries()) {
      if (info.opportunityIds.length < minOccurrence) continue;
      out.push({
        relationshipType: bucketKey,
        value,
        occurrenceCount: info.opportunityIds.length,
        firstSeenAt: info.firstSeen,
        lastSeenAt: info.lastSeen,
        opportunityIds: info.opportunityIds.slice(0, 50),
        metadata: { sample_count: Math.min(50, info.opportunityIds.length) },
      });
    }
  }
  return out.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

async function refreshRelationships({ minOccurrence = 2, limit = 5000 } = {}) {
  const opportunities = await Opportunity.findAll({
    where: { status: 'active' },
    limit, order: [['created_at', 'DESC']],
  });
  const rels = buildRelationships(opportunities.map((o) => o.toJSON()), { minOccurrence });
  // Idempotent rewrite — clear + write fresh aggregate.
  await OpportunityRelationship.destroy({ where: {} });
  for (const r of rels) {
    // eslint-disable-next-line no-await-in-loop
    await OpportunityRelationship.create(r);
  }
  return { generated: rels.length, scanned: opportunities.length };
}

async function listRecurring({ relationshipType = null, limit = 50 } = {}) {
  const where = {};
  if (relationshipType) where.relationshipType = relationshipType;
  const rows = await OpportunityRelationship.findAll({
    where, order: [['occurrence_count', 'DESC']], limit: Math.min(500, Number(limit) || 50),
  });
  return rows.map((r) => r.toJSON());
}

async function summarizeRecurring({ limit = 10 } = {}) {
  const types = ['agency', 'technology', 'vendor', 'naics', 'keyword'];
  const out = {};
  for (const t of types) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await OpportunityRelationship.findAll({
      where: { relationshipType: t },
      order: [['occurrence_count', 'DESC']],
      limit: Math.min(50, Number(limit) || 10),
    });
    out[t] = rows.map((r) => r.toJSON());
  }
  return out;
}

module.exports = {
  TECH_VOCAB, NAICS_REGEX,
  extractAgency, extractVendor, extractNaicsList, extractTechnologies, extractKeywords,
  buildRelationships,
  refreshRelationships,
  listRecurring,
  summarizeRecurring,
};
