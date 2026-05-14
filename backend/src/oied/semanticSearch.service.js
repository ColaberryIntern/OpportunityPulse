// Research Intelligence Phase 3b — embedding generation + semantic search.
//
// Embeds opportunities (research first, but works for any type) with
// text-embedding-3-small, stored as a JSONB float array on the row.
// Search = embed the query, cosine-similarity it against the stored
// vectors in-process. No pgvector — see migration 20260510000010.
//
// In-process cosine over a few hundred-to-few-thousand rows is sub-100ms.
// When the embedded corpus crosses ~5k rows this gets swapped for a
// pgvector index; the JSONB column shape is forward-compatible.

const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const { getChannelKey } = require('./channels.service');
const logger = require('../logging/logger');

const EMBED_BATCH = 50;        // texts per OpenAI embedding call
const EMBED_RUN_LIMIT = 200;   // opps embedded per batch run

// The text we embed for an opportunity — title + description + tags is
// enough signal; we cap to keep the token cost predictable.
function embeddingText(opp) {
  const parts = [
    opp.title || '',
    String(opp.description || '').slice(0, 1500),
    (opp.tags || []).join(' '),
  ];
  const sd = opp.sourceData || {};
  if (Array.isArray(sd.domains)) parts.push(sd.domains.join(' '));
  return parts.filter(Boolean).join('\n').slice(0, 6000);
}

// Cosine similarity between two equal-length number arrays.
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Embed opportunities that don't have an embedding yet. Defaults to research
// type (the Phase 3 scope) but `type: null` embeds everything.
async function embedOpportunities({ type = 'research', limit = EMBED_RUN_LIMIT, force = false } = {}) {
  const run = await AnalysisRun.create({
    type: 'embedding_generation',
    status: 'running',
    startedAt: new Date(),
  });
  try {
    const where = { status: 'active' };
    if (type) where.type = type;
    if (!force) where.embedding = { [Op.is]: null };

    const opps = await Opportunity.findAll({
      where,
      order: [['published_at', 'DESC']],
      limit: Math.min(Number(limit) || EMBED_RUN_LIMIT, 1000),
    });

    if (opps.length === 0) {
      await run.update({
        status: 'success', inputCount: 0, outputCount: 0,
        results: { message: 'No opportunities need embedding.' },
        completedAt: new Date(),
      });
      return run;
    }

    const ai = getAIClient();
    let embedded = 0;
    let tokensUsed = 0;
    const errors = [];

    for (let i = 0; i < opps.length; i += EMBED_BATCH) {
      const batch = opps.slice(i, i + EMBED_BATCH);
      try {
        const { vectors, model, tokensUsed: t } = await ai.embed(batch.map(embeddingText));
        tokensUsed += t;
        for (let j = 0; j < batch.length; j += 1) {
          await batch[j].update({
            embedding: vectors[j],
            embeddingModel: model,
            embeddedAt: new Date(),
          });
          embedded += 1;
        }
      } catch (e) {
        errors.push({ batchStart: i, error: e.message });
        logger.warn('semanticSearch: embedding batch failed', { batchStart: i, error: e.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: opps.length,
      outputCount: embedded,
      results: { embedded, type: type || 'all' },
      errors,
      tokensUsed,
      completedAt: new Date(),
    });
    logger.info('semanticSearch: embedding batch complete', { input: opps.length, embedded, errors: errors.length });
    return run;
  } catch (error) {
    logger.error('semanticSearch: embedding batch failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

// Semantic search: embed the query, cosine-rank embedded opps.
// `channels` optionally restricts results to specific channel keys.
async function semanticSearch(query, { limit = 20, channels = null, minScore = 0.25 } = {}) {
  if (!query || !String(query).trim()) {
    return { query, results: [], message: 'Empty query.' };
  }
  const ai = getAIClient();
  const { vectors } = await ai.embed(String(query).trim());
  const queryVec = vectors[0];

  // Pull every embedded active opp. At current scale this is a few hundred
  // rows; the JSONB embedding column is the heavy field so we select lean.
  const rows = await Opportunity.findAll({
    where: { status: 'active', embedding: { [Op.ne]: null } },
    attributes: ['id', 'type', 'source', 'title', 'description', 'value', 'sourceUrl', 'tags', 'embedding', 'aiAnalysis'],
  });

  const scored = [];
  for (const r of rows) {
    const sim = cosineSimilarity(queryVec, r.embedding);
    if (sim < minScore) continue;
    const channel = getChannelKey(r);
    if (channels && channels.length && !channels.includes(channel)) continue;
    scored.push({
      opportunity_id: r.id,
      type: r.type,
      channel,
      title: r.title,
      description: String(r.description || '').slice(0, 240),
      source: r.source,
      source_url: r.sourceUrl,
      value: r.value != null ? Number(r.value) : null,
      similarity: Math.round(sim * 1000) / 1000,
    });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  const results = scored.slice(0, Math.min(Number(limit) || 20, 100));

  // Channel rollup — the doc's "Search: multi-agent memory → 18 papers, 4
  // contracts, 12 jobs..." UX comes straight from this.
  const byChannel = {};
  for (const s of scored) byChannel[s.channel] = (byChannel[s.channel] || 0) + 1;

  return {
    query,
    total_candidates: rows.length,
    total_matches: scored.length,
    by_channel: byChannel,
    results,
  };
}

// Given one opportunity, find the most semantically-similar others.
// Used by the research detail view ("related research / opportunities").
async function findSimilar(opportunityId, { limit = 10, minScore = 0.3 } = {}) {
  const opp = await Opportunity.findByPk(opportunityId, { attributes: ['id', 'embedding'] });
  if (!opp) {
    const err = new Error('Opportunity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!opp.embedding) {
    return { opportunity_id: opportunityId, results: [], message: 'This opportunity has no embedding yet.' };
  }
  const rows = await Opportunity.findAll({
    where: {
      status: 'active',
      embedding: { [Op.ne]: null },
      id: { [Op.ne]: opportunityId },
    },
    attributes: ['id', 'type', 'source', 'title', 'value', 'sourceUrl', 'embedding'],
  });
  const scored = [];
  for (const r of rows) {
    const sim = cosineSimilarity(opp.embedding, r.embedding);
    if (sim < minScore) continue;
    scored.push({
      opportunity_id: r.id,
      type: r.type,
      channel: getChannelKey(r),
      title: r.title,
      source: r.source,
      source_url: r.sourceUrl,
      value: r.value != null ? Number(r.value) : null,
      similarity: Math.round(sim * 1000) / 1000,
    });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return {
    opportunity_id: opportunityId,
    results: scored.slice(0, Math.min(Number(limit) || 10, 50)),
  };
}

module.exports = {
  embeddingText,
  cosineSimilarity,
  embedOpportunities,
  semanticSearch,
  findSimilar,
};
