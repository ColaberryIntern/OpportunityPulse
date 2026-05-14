// Research Intelligence Phase 2.3 — author + topic aggregation.
//
// Rebuilds research_authors and research_topics FROM the research
// opportunities already in the unified table. Not a new ingestion source —
// a rolled-up view that answers:
//   - "who keeps publishing in our high-priority topics?" (authors)
//   - "which AI topics are accelerating?" (topics, via momentum)
//
// Idempotent full-rebuild: each run recomputes aggregates from scratch and
// upserts. Cheap (a few hundred research rows), so no incremental logic.

const { Op } = require('sequelize');
const { Opportunity, ResearchAuthor, ResearchTopic, AnalysisRun } = require('../models');
const logger = require('../logging/logger');

// High-priority build topics (mirrors classification.rules — kept in sync
// intentionally; this is the list that drives commercial_score).
const HIGH_PRIORITY_TOPICS = [
  'multi-agent', 'multiagent', 'agent', 'orchestration', 'reasoning',
  'memory', 'retrieval', 'rag', 'observability', 'evaluation', 'benchmark',
  'autonomous', 'workflow', 'enterprise', 'inference', 'fine-tuning',
];

const RECENT_WINDOW_DAYS = 30;

// Pull all active research opps with the fields aggregation needs.
async function loadResearchOpps() {
  return Opportunity.findAll({
    where: { type: 'research', status: 'active' },
    attributes: ['id', 'title', 'tags', 'value', 'publishedAt', 'sourceData', 'source'],
    order: [['published_at', 'DESC']],
  });
}

// ---- Authors ----------------------------------------------------------

function aggregateAuthors(opps) {
  // name → { paperCount, citationCount, topics:Set, sources:Set, latestPaperAt }
  const map = new Map();
  for (const opp of opps) {
    const sd = opp.sourceData || {};
    const authors = Array.isArray(sd.authors) ? sd.authors : [];
    const citations = Number(sd.citationCount) || 0;
    const domains = Array.isArray(sd.domains) ? sd.domains : [];
    const pubAt = opp.publishedAt ? new Date(opp.publishedAt) : null;
    for (const rawName of authors) {
      const name = String(rawName || '').trim().slice(0, 300);
      if (!name) continue;
      if (!map.has(name)) {
        map.set(name, {
          paperCount: 0, citationCount: 0, topics: new Set(), sources: new Set(), latestPaperAt: null,
        });
      }
      const a = map.get(name);
      a.paperCount += 1;
      // Citation traction is per-paper; sum across the author's papers as a
      // rough "total reach" proxy (not a real h-index — that's a later add).
      a.citationCount += citations;
      for (const d of domains) a.topics.add(String(d).toLowerCase());
      a.sources.add(opp.source);
      if (pubAt && (!a.latestPaperAt || pubAt > a.latestPaperAt)) a.latestPaperAt = pubAt;
    }
  }
  return map;
}

async function rebuildAuthors(opps) {
  const map = aggregateAuthors(opps);
  let upserted = 0;
  for (const [name, a] of map.entries()) {
    const [row] = await ResearchAuthor.findOrCreate({
      where: { name },
      defaults: { name },
    });
    await row.update({
      paperCount: a.paperCount,
      citationCount: a.citationCount,
      lastSeenAt: a.latestPaperAt,
      metadata: {
        topics: [...a.topics].slice(0, 20),
        sources: [...a.sources],
        latest_paper_at: a.latestPaperAt ? a.latestPaperAt.toISOString() : null,
      },
    });
    upserted += 1;
  }
  return { distinctAuthors: map.size, upserted };
}

// ---- Topics -----------------------------------------------------------

function topicCommercialScore(topicName) {
  const t = topicName.toLowerCase();
  // 100 if the topic IS a high-priority keyword, 60 if it contains one,
  // 20 otherwise. Crude but explainable; refined in a later phase.
  if (HIGH_PRIORITY_TOPICS.includes(t)) return 100;
  if (HIGH_PRIORITY_TOPICS.some((kw) => t.includes(kw))) return 60;
  return 20;
}

function aggregateTopics(opps) {
  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * 86_400_000;
  const priorCutoff = now - 2 * RECENT_WINDOW_DAYS * 86_400_000;
  // topicName → { paperCount, recentCount, priorCount }
  const map = new Map();
  for (const opp of opps) {
    const sd = opp.sourceData || {};
    // A topic = an arXiv domain or a tag. Dedupe per-paper so one paper
    // counts once per topic.
    const topics = new Set();
    for (const d of (Array.isArray(sd.domains) ? sd.domains : [])) {
      const t = String(d).toLowerCase().trim();
      if (t) topics.add(t);
    }
    for (const tag of (opp.tags || [])) {
      const t = String(tag).toLowerCase().trim();
      if (t && t.length >= 3) topics.add(t);
    }
    const pubAt = opp.publishedAt ? new Date(opp.publishedAt).getTime() : null;
    for (const t of topics) {
      if (!map.has(t)) map.set(t, { paperCount: 0, recentCount: 0, priorCount: 0 });
      const rec = map.get(t);
      rec.paperCount += 1;
      if (pubAt && pubAt >= recentCutoff) rec.recentCount += 1;
      else if (pubAt && pubAt >= priorCutoff) rec.priorCount += 1;
    }
  }
  return map;
}

async function rebuildTopics(opps) {
  const map = aggregateTopics(opps);
  let upserted = 0;
  for (const [topicName, t] of map.entries()) {
    // momentum_score: recent volume weighted up; growth_rate: recent vs prior.
    const momentum = t.recentCount * 2 + t.priorCount;
    const growth = t.priorCount > 0
      ? Math.round(((t.recentCount - t.priorCount) / t.priorCount) * 100)
      : (t.recentCount > 0 ? 100 : 0);
    const [row] = await ResearchTopic.findOrCreate({
      where: { topicName },
      defaults: { topicName },
    });
    await row.update({
      paperCount: t.paperCount,
      recentCount: t.recentCount,
      priorCount: t.priorCount,
      momentumScore: momentum,
      growthRate: growth,
      commercialScore: topicCommercialScore(topicName),
      lastComputedAt: new Date(),
    });
    upserted += 1;
  }
  return { distinctTopics: map.size, upserted };
}

// ---- Orchestration ----------------------------------------------------

async function rebuildResearchAggregates() {
  const run = await AnalysisRun.create({
    type: 'research_aggregation',
    status: 'running',
    startedAt: new Date(),
  });
  try {
    const opps = await loadResearchOpps();
    if (opps.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No research opps to aggregate.' },
        completedAt: new Date(),
      });
      return run;
    }
    const authorResult = await rebuildAuthors(opps);
    const topicResult = await rebuildTopics(opps);
    await run.update({
      status: 'success',
      inputCount: opps.length,
      outputCount: authorResult.upserted + topicResult.upserted,
      results: { authors: authorResult, topics: topicResult },
      completedAt: new Date(),
    });
    logger.info('researchAggregation complete', {
      researchOpps: opps.length,
      authors: authorResult.distinctAuthors,
      topics: topicResult.distinctTopics,
    });
    return run;
  } catch (error) {
    logger.error('researchAggregation failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

// Read helpers for the API / UI — top authors + topics by their key signal.
async function getTopAuthors(limit = 25) {
  return ResearchAuthor.findAll({
    order: [['citation_count', 'DESC'], ['paper_count', 'DESC']],
    limit: Math.min(Number(limit) || 25, 100),
  });
}

async function getTopTopics(limit = 25) {
  return ResearchTopic.findAll({
    where: { paperCount: { [Op.gte]: 2 } },
    order: [['momentum_score', 'DESC']],
    limit: Math.min(Number(limit) || 25, 100),
  });
}

module.exports = {
  aggregateAuthors,
  aggregateTopics,
  topicCommercialScore,
  rebuildAuthors,
  rebuildTopics,
  rebuildResearchAggregates,
  getTopAuthors,
  getTopTopics,
  HIGH_PRIORITY_TOPICS,
};
