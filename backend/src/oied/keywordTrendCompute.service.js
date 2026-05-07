// OIED v9.7 — Keyword Trend Compute.
//
// Replaces the live aggregation in keywordCloud.service. Runs twice daily
// from oied.scheduler. For each candidate word from the multi-source
// aggregation:
//
//   1. Validate match_count: how many opp rows actually contain this
//      word in title or description (ILIKE %word%).
//   2. Validate tool_count: how many AiTool rows match.
//   3. Drop if match_count + tool_count == 0 — guarantees the word
//      cloud never shows a word that produces empty click-through.
//   4. Classify is_industry: against a curated industry list.
//   5. Upsert into keyword_trends.

const crypto = require('crypto');
const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { Opportunity, AiTool, KeywordTrend } = require('../models');
const keywordCloudSvc = require('./keywordCloud.service');

const MIN_MATCH_COUNT = 3; // word must match >= 3 opp rows OR >= 1 tool
const MAX_CANDIDATES = 200; // cap candidates pre-validation; the real
// table will hold ~80-150 surviving words after validation drops.

// Curated industry / vertical phrase list. Lowercased exact-substring
// match. Add new verticals here as the pipeline learns them.
const INDUSTRY_PHRASES = [
  'healthcare', 'health care', 'medical', 'pharma', 'pharmaceutical', 'biotech',
  'finance', 'banking', 'insurance', 'fintech', 'wealth management', 'capital markets',
  'retail', 'e-commerce', 'ecommerce', 'consumer goods', 'cpg', 'fashion',
  'manufacturing', 'industrial', 'supply chain', 'logistics', 'warehousing',
  'energy', 'oil and gas', 'renewable', 'utilities', 'mining',
  'real estate', 'proptech', 'construction', 'building',
  'education', 'edtech', 'higher ed', 'k-12',
  'transportation', 'aviation', 'automotive', 'rail', 'shipping',
  'agriculture', 'agtech', 'farming', 'food production',
  'hospitality', 'travel', 'tourism', 'restaurant', 'hotel',
  'legal', 'legaltech', 'compliance',
  'entertainment', 'media', 'gaming', 'streaming',
  'cybersecurity', 'security',
  'defense', 'aerospace', 'military',
  'government', 'public sector', 'federal', 'state government', 'municipal',
  'telecom', 'telecommunications', 'broadband',
  'biotechnology', 'genomics', 'clinical',
  'climate', 'sustainability', 'carbon',
  'staffing', 'workforce', 'human resources', 'talent',
  'marketing', 'advertising', 'adtech',
  'professional services', 'consulting',
  'data analytics', 'data science', 'machine learning', 'artificial intelligence',
  'it services', 'cloud computing', 'cybersecurity',
];

const INDUSTRY_SET = new Set(INDUSTRY_PHRASES.map((s) => s.toLowerCase()));

function isIndustryPhrase(word) {
  if (!word) return false;
  const w = String(word).toLowerCase();
  return INDUSTRY_SET.has(w);
}

// Title-case for display (handles multi-word phrases).
function toDisplayWord(word) {
  if (!word) return word;
  return String(word)
    .split(/\s+/)
    .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

async function validateMatchCount(word) {
  if (!Opportunity || !word) return 0;
  const needle = `%${word}%`;
  try {
    const c = await Opportunity.count({
      where: {
        status: 'active',
        [Op.or]: [
          { title:       { [Op.iLike]: needle } },
          { description: { [Op.iLike]: needle } },
        ],
      },
    });
    return c;
  } catch (e) {
    logger.warn('keywordTrendCompute: matchCount failed', { word, error: e.message });
    return 0;
  }
}

async function validateToolCount(word) {
  if (!AiTool || !word) return 0;
  const needle = `%${word}%`;
  try {
    const c = await AiTool.count({
      where: {
        [Op.or]: [
          { name:        { [Op.iLike]: needle } },
          { description: { [Op.iLike]: needle } },
          { category:    { [Op.iLike]: needle } },
          { subcategory: { [Op.iLike]: needle } },
        ],
      },
    });
    return c;
  } catch (e) {
    logger.warn('keywordTrendCompute: toolCount failed', { word, error: e.message });
    return 0;
  }
}

async function runKeywordTrendCompute({
  now = new Date(),
  minMatchCount = MIN_MATCH_COUNT,
  maxCandidates = MAX_CANDIDATES,
} = {}) {
  if (!KeywordTrend) {
    logger.warn('keywordTrendCompute: model unavailable');
    return { runId: null, candidates: 0, persisted: 0, dropped: 0 };
  }

  const runId = `kwt-${now.toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
  logger.info('keywordTrendCompute: starting', { runId });

  // 1. Get raw candidates from the existing multi-source aggregator.
  const cloud = await keywordCloudSvc.getKeywordCloud({
    sources: keywordCloudSvc.ALL_SOURCES,
    max: maxCandidates,
    now,
  });
  const candidates = cloud.words || [];

  // 2. For each candidate, validate via direct ILIKE counts.
  const persisted = [];
  let dropped = 0;
  for (const c of candidates) {
    const matchCount = await validateMatchCount(c.word);
    const toolCount  = await validateToolCount(c.word);
    if (matchCount < minMatchCount && toolCount < 1) {
      dropped += 1;
      continue;
    }
    const channelCounts = {};
    for (const ch of (c.channels || [])) {
      channelCounts[ch.key] = ch.count;
    }
    persisted.push({
      word: c.word,
      displayWord: toDisplayWord(c.word),
      matchCount,
      toolCount,
      totalMentions: c.count,
      channelCounts,
      sentimentScore: c.sentiment_score,
      sentimentLabel: c.sentiment_label,
      avgAgeDays: c.avg_age_days,
      isIndustry: isIndustryPhrase(c.word),
      runId,
      lastComputedAt: now,
    });
  }

  // 3. Atomic-ish replace: bulkCreate with updateOnDuplicate, then mark
  //    rows from prior runs as zero-match so the read path filters them.
  if (persisted.length > 0) {
    await KeywordTrend.bulkCreate(persisted, {
      updateOnDuplicate: [
        'displayWord', 'matchCount', 'toolCount', 'totalMentions',
        'channelCounts', 'sentimentScore', 'sentimentLabel', 'avgAgeDays',
        'isIndustry', 'runId', 'lastComputedAt', 'updatedAt',
      ],
    });
  }
  // Soft-retire rows that didn't appear in this run (set match_count=0
  // so the read path's filter excludes them; keep for trend velocity).
  const persistedWords = new Set(persisted.map((p) => p.word));
  if (persistedWords.size > 0) {
    await KeywordTrend.update(
      { matchCount: 0 },
      {
        where: {
          word: { [Op.notIn]: Array.from(persistedWords) },
          runId: { [Op.ne]: runId },
        },
      },
    );
  }

  logger.info('keywordTrendCompute: complete', {
    runId, candidates: candidates.length, persisted: persisted.length, dropped,
  });
  return {
    runId,
    candidates: candidates.length,
    persisted: persisted.length,
    dropped,
  };
}

module.exports = {
  runKeywordTrendCompute,
  validateMatchCount,
  validateToolCount,
  isIndustryPhrase,
  toDisplayWord,
  INDUSTRY_PHRASES,
  MIN_MATCH_COUNT,
};
