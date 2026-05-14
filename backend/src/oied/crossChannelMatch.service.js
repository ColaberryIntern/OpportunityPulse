// Research Intelligence Phase 2.2 — cross-channel matching v1.
//
// The doc's "Cross-Channel Intelligence" vision: a research paper on
// multi-agent memory should surface the DARPA contract, the jobs hiring
// for that exact topic, the VC round funding the same technology.
//
// v1 is deliberately NOT a graph and NOT embeddings (that's Phase 3 +
// pgvector). It's keyword/tag overlap: extract significant terms from a
// research opp, find opportunities in OTHER channels that share those
// terms, score by overlap, persist the top matches on the research opp's
// aiAnalysis.cross_channel_matches.
//
// Cheap, deterministic, explainable — every match shows WHICH terms it
// shares. Good enough to prove the cross-channel value before investing
// in the vector layer.

const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { getChannelKey } = require('./channels.service');
const logger = require('../logging/logger');

const BATCH_SIZE = 30;
const MIN_TERM_LENGTH = 4;
const MIN_OVERLAP_SCORE = 2;     // a match needs ≥2 shared terms to count
const MAX_MATCHES_PER_OPP = 8;
const CANDIDATE_CAP = 400;       // ceiling on rows we score per research opp

// Domain stopwords — common in AI text, so they're noise for matching.
const STOPWORDS = new Set([
  'with', 'from', 'this', 'that', 'using', 'based', 'data', 'model', 'models',
  'paper', 'study', 'approach', 'method', 'methods', 'results', 'analysis',
  'system', 'systems', 'learning', 'novel', 'propose', 'proposed', 'show',
  'task', 'tasks', 'large', 'small', 'high', 'low', 'new', 'work', 'state',
  'art', 'via', 'toward', 'towards', 'into', 'over', 'under', 'between',
  'their', 'these', 'those', 'have', 'been', 'more', 'most', 'than', 'then',
  'when', 'where', 'which', 'while', 'also', 'such', 'each', 'both', 'about',
  'the', 'and', 'for', 'are', 'can', 'our', 'all', 'one', 'two', 'use',
  'ai', 'ml', 'llm', 'llms',  // too broad — almost everything in this corpus has these
]);

// Extract a deduped set of significant lowercased terms from a research opp.
function extractTerms(opp) {
  const terms = new Set();
  // Title words.
  for (const raw of String(opp.title || '').toLowerCase().split(/[^a-z0-9+#-]+/)) {
    const w = raw.trim();
    if (w.length >= MIN_TERM_LENGTH && !STOPWORDS.has(w)) terms.add(w);
  }
  // Tags (kept whole — they're already meaningful units).
  for (const t of (opp.tags || [])) {
    const w = String(t).toLowerCase().trim();
    if (w.length >= 3 && !STOPWORDS.has(w)) terms.add(w);
  }
  // sourceData.domains (arXiv categories etc. — also meaningful units).
  const domains = (opp.sourceData && opp.sourceData.domains) || [];
  for (const d of domains) {
    const w = String(d).toLowerCase().trim();
    if (w.length >= 3) terms.add(w);
  }
  return [...terms];
}

// Count how many of `terms` appear in a candidate opp's searchable text.
function scoreCandidate(terms, candidate) {
  const haystack = [
    candidate.title || '',
    candidate.description || '',
    ...(candidate.tags || []),
  ].join(' ').toLowerCase();
  const shared = [];
  for (const t of terms) {
    if (haystack.includes(t)) shared.push(t);
  }
  return shared;
}

// Find + persist cross-channel matches for ONE research opp.
async function matchOne(researchOpp) {
  const terms = extractTerms(researchOpp);
  if (terms.length < MIN_OVERLAP_SCORE) {
    // Not enough signal to match on — clear any stale matches, return empty.
    const existing = researchOpp.aiAnalysis || {};
    await researchOpp.update({
      aiAnalysis: { ...existing, cross_channel_matches: { matches: [], terms_used: terms, generated_at: new Date().toISOString() } },
    });
    return { matchCount: 0, terms };
  }

  // Candidate pool: active, non-research opps whose tags overlap our terms
  // OR whose title matches any term. Capped so a broad paper can't scan the
  // whole table.
  const titleRegex = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const candidates = await Opportunity.findAll({
    where: {
      type: { [Op.ne]: 'research' },
      status: 'active',
      [Op.or]: [
        { tags: { [Op.overlap]: terms } },
        { title: { [Op.iRegexp]: titleRegex } },
      ],
    },
    attributes: ['id', 'type', 'source', 'title', 'description', 'tags', 'value'],
    limit: CANDIDATE_CAP,
    order: [['published_at', 'DESC']],
  });

  const scored = [];
  for (const c of candidates) {
    const shared = scoreCandidate(terms, c);
    if (shared.length >= MIN_OVERLAP_SCORE) {
      scored.push({
        opportunity_id: c.id,
        type: c.type,
        channel: getChannelKey(c),
        title: String(c.title || '').slice(0, 200),
        value: c.value != null ? Number(c.value) : null,
        overlap_score: shared.length,
        shared_terms: shared.slice(0, 10),
      });
    }
  }
  scored.sort((a, b) => b.overlap_score - a.overlap_score);
  const matches = scored.slice(0, MAX_MATCHES_PER_OPP);

  const existing = researchOpp.aiAnalysis || {};
  await researchOpp.update({
    aiAnalysis: {
      ...existing,
      cross_channel_matches: {
        matches,
        terms_used: terms,
        candidate_count: candidates.length,
        generated_at: new Date().toISOString(),
      },
    },
  });
  return { matchCount: matches.length, terms };
}

// Batch: match research opps. Idempotent — re-runs refresh the matches
// (cross-channel links go stale as new opps land, so re-running is correct).
async function matchResearchBatch({ limit = BATCH_SIZE, force = false } = {}) {
  const run = await AnalysisRun.create({
    type: 'cross_channel_match',
    status: 'running',
    startedAt: new Date(),
  });
  try {
    const opps = await Opportunity.findAll({
      where: { type: 'research', status: 'active' },
      order: [['published_at', 'DESC']],
      limit: Math.min(Number(limit) || BATCH_SIZE, 200),
    });
    const todo = force
      ? opps
      : opps.filter((o) => !(o.aiAnalysis && o.aiAnalysis.cross_channel_matches));

    if (todo.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No research opps need cross-channel matching.' },
        completedAt: new Date(),
      });
      return run;
    }

    let processed = 0;
    let totalMatches = 0;
    const errors = [];
    const byChannel = {};

    for (const opp of todo) {
      try {
        const { matchCount } = await matchOne(opp);
        processed += 1;
        totalMatches += matchCount;
        // Roll up which channels the matches landed in (re-read after update).
        const m = (opp.aiAnalysis && opp.aiAnalysis.cross_channel_matches
          && opp.aiAnalysis.cross_channel_matches.matches) || [];
        for (const match of m) {
          byChannel[match.channel] = (byChannel[match.channel] || 0) + 1;
        }
      } catch (e) {
        errors.push({ opportunityId: opp.id, error: e.message });
        logger.warn('crossChannelMatch: failed for opp', { id: opp.id, error: e.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: todo.length,
      outputCount: processed,
      results: {
        researchOppsProcessed: processed,
        totalMatchesLinked: totalMatches,
        matchesByChannel: byChannel,
      },
      errors,
      completedAt: new Date(),
    });
    logger.info('crossChannelMatch batch complete', { input: todo.length, processed, totalMatches });
    return run;
  } catch (error) {
    logger.error('crossChannelMatch batch failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

module.exports = {
  extractTerms,
  scoreCandidate,
  matchOne,
  matchResearchBatch,
  MIN_OVERLAP_SCORE,
  STOPWORDS,
};
