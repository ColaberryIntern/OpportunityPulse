// OIED Keyword Cloud — multi-source word cloud for Mission Control.
//
// Successor to newsWordCloud.service. Pulls from FIVE corpora and merges
// into a single ranked list, with each word carrying:
//   - count                 (how often it appears)
//   - sentiment_score       (continuous -1.0..+1.0)
//   - sentiment_label       (very_negative | negative | neutral | positive | very_positive)
//   - avg_age_days          (across articles that mention it)
//   - channels[{key,count}] (channel attribution)
//
// Pure SQL + JS. No AI calls.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { Opportunity, AiTool } = require('../models');
const channelsSvc = require('./channels.service');
const newsWordCloudSvc = require('./newsWordCloud.service');

const LOOKBACK_DAYS = 14;
const MAX_WORDS = 40;

const ALL_SOURCES = [
  'news_titles',        // ai_news titles (existing behavior)
  'news_categories',    // ai_news.category as whole-phrase tokens
  'channel_titles',     // titles across all 7 channels
  'opp_categories',     // opp.category across all channels
  'tool_names',         // AiTool name + tags
];

// Phrase tokens (e.g. "AI/ML Government Contract") get lowercased and
// kept whole — they're useful as search keywords. Word-level tokens
// reuse newsWordCloud's tokenizer + stop-word list.
function phraseToken(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  if (t.length < 3 || t.length > 60) return null;
  // Drop pure-number categories (NAICS codes etc.) — not useful as words.
  if (/^[0-9]+$/.test(t)) return null;
  return t;
}

// Per-article sentiment uses a count of pos vs neg words divided by total
// meaningful tokens, clamped to [-1, +1]. Continuous, deterministic.
function articleSentimentScore(title) {
  const tokens = newsWordCloudSvc.tokenize(title);
  if (tokens.length === 0) return 0;
  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    if (newsWordCloudSvc.POS_WORDS.has(t)) pos += 1;
    if (newsWordCloudSvc.NEG_WORDS.has(t)) neg += 1;
  }
  const raw = (pos - neg) / tokens.length;
  // Scale up a bit so small differences read as visible color shifts.
  // Empirically pos/neg word density rarely exceeds ~0.15 even in
  // strongly-charged articles, so we multiply by 5 then clamp.
  return Math.max(-1, Math.min(1, raw * 5));
}

function labelForScore(s) {
  if (s <= -0.4) return 'very_negative';
  if (s <= -0.1) return 'negative';
  if (s <   0.1) return 'neutral';
  if (s <   0.4) return 'positive';
  return 'very_positive';
}

// Aggregate state per word.
function newEntry() {
  return { count: 0, sentSum: 0, ageSum: 0, channelCounts: new Map() };
}

function addOccurrence(stats, word, { sentiment, ageDays, channelKey, weight = 1 }) {
  let e = stats.get(word);
  if (!e) { e = newEntry(); stats.set(word, e); }
  e.count += weight;
  if (sentiment != null) e.sentSum += sentiment * weight;
  if (ageDays != null) e.ageSum += ageDays * weight;
  if (channelKey) {
    e.channelCounts.set(channelKey, (e.channelCounts.get(channelKey) || 0) + weight);
  }
}

async function getKeywordCloud({
  sources = ALL_SOURCES,
  lookbackDays = LOOKBACK_DAYS,
  max = MAX_WORDS,
  now = new Date(),
} = {}) {
  if (!Opportunity) {
    return { words: [], article_count: 0, sources, lookback_days: lookbackDays };
  }
  const since = new Date(now);
  since.setDate(since.getDate() - lookbackDays);
  const nowMs = now.getTime();

  const stats = new Map();
  let articleCount = 0;

  // 1) NEWS TITLES — token-level, with article sentiment + channel attribution.
  if (sources.includes('news_titles')) {
    const rows = await Opportunity.findAll({
      where: { type: 'ai_news', status: 'active', createdAt: { [Op.gte]: since } },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'createdAt'],
      limit: 2000,
    });
    articleCount += rows.length;
    for (const r of rows) {
      const data = r.toJSON ? r.toJSON() : r;
      const sent = articleSentimentScore(data.title);
      const ageDays = Math.max(0, (nowMs - new Date(data.createdAt).getTime()) / 86_400_000);
      const tokens = Array.from(new Set(newsWordCloudSvc.tokenize(data.title)));
      for (const tok of tokens) {
        addOccurrence(stats, tok, {
          sentiment: sent, ageDays, channelKey: 'private-sector', weight: 1,
        });
      }
    }
  }

  // 2) NEWS CATEGORIES — phrase-level. Categories are curated industry/topic
  //    tags, so they're high-signal. Weight 2 to make them prominent.
  if (sources.includes('news_categories')) {
    const rows = await Opportunity.findAll({
      where: { type: 'ai_news', status: 'active', createdAt: { [Op.gte]: since }, category: { [Op.ne]: null } },
      attributes: ['category', 'createdAt'],
      limit: 2000,
    });
    for (const r of rows) {
      const data = r.toJSON ? r.toJSON() : r;
      const tok = phraseToken(data.category);
      if (!tok) continue;
      const ageDays = Math.max(0, (nowMs - new Date(data.createdAt).getTime()) / 86_400_000);
      addOccurrence(stats, tok, {
        sentiment: 0, ageDays, channelKey: 'private-sector', weight: 2,
      });
    }
  }

  // 3) CHANNEL TITLES — words from titles across all 7 channels (excluding
  //    news to avoid double-counting). Smaller pool per channel so news
  //    doesn't dominate.
  if (sources.includes('channel_titles')) {
    const nonNewsTypes = [
      'gov_contract', 'grant', 'ai_job', 'investment', 'freelance',
      'bonfire', 'bonfire_strategic',
    ];
    const rows = await Opportunity.findAll({
      where: {
        type: { [Op.in]: nonNewsTypes },
        status: 'active',
        createdAt: { [Op.gte]: since },
      },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'type', 'source', 'title', 'createdAt'],
      limit: 800,
    });
    for (const r of rows) {
      const data = r.toJSON ? r.toJSON() : r;
      const channelKey = channelsSvc.getChannelKey(data);
      const ageDays = Math.max(0, (nowMs - new Date(data.createdAt).getTime()) / 86_400_000);
      const tokens = Array.from(new Set(newsWordCloudSvc.tokenize(data.title)));
      for (const tok of tokens) {
        addOccurrence(stats, tok, {
          sentiment: 0, ageDays, channelKey, weight: 1,
        });
      }
    }
  }

  // 4) OPP CATEGORIES — phrase-level industry tags from across all channels.
  //    Weight 2 to keep industries visible against the high-volume token streams.
  if (sources.includes('opp_categories')) {
    const rows = await Opportunity.findAll({
      where: { status: 'active', category: { [Op.ne]: null }, createdAt: { [Op.gte]: since } },
      attributes: ['type', 'source', 'category', 'createdAt'],
      limit: 3000,
    });
    for (const r of rows) {
      const data = r.toJSON ? r.toJSON() : r;
      const tok = phraseToken(data.category);
      if (!tok) continue;
      const channelKey = channelsSvc.getChannelKey(data);
      const ageDays = Math.max(0, (nowMs - new Date(data.createdAt).getTime()) / 86_400_000);
      addOccurrence(stats, tok, {
        sentiment: 0, ageDays, channelKey, weight: 2,
      });
    }
  }

  // 5) TOOL NAMES + TAGS — top-trending tools' names + their tag arrays.
  //    Keeps the cloud aware of what tools are hot in the ecosystem.
  if (sources.includes('tool_names') && AiTool) {
    try {
      const tools = await AiTool.findAll({
        order: [['trendingScore', 'DESC NULLS LAST']],
        limit: 60,
        attributes: ['name', 'category', 'tags', 'mentionCount7d', 'sentimentScore'],
      });
      for (const t of tools) {
        const data = t.toJSON ? t.toJSON() : t;
        // Tool name as a single phrase token.
        const nameTok = phraseToken(data.name);
        if (nameTok) {
          const sent = data.sentimentScore != null
            ? Math.max(-1, Math.min(1, Number(data.sentimentScore)))
            : 0.2; // tools are usually mentioned positively
          // Mentions in last 7d as a proxy weight; floor at 1.
          const w = Math.max(1, Math.min(8, Math.round(Number(data.mentionCount7d) || 1)));
          addOccurrence(stats, nameTok, {
            sentiment: sent, ageDays: 3, channelKey: null, weight: w,
          });
        }
        // Tag tokens (phrase-level since tags are short curated phrases).
        if (Array.isArray(data.tags)) {
          for (const tag of data.tags) {
            const tagTok = phraseToken(tag);
            if (tagTok) {
              addOccurrence(stats, tagTok, {
                sentiment: 0.1, ageDays: 5, channelKey: null, weight: 1,
              });
            }
          }
        }
      }
    } catch (e) {
      logger.warn('keywordCloud: tool aggregation failed', { error: e.message });
    }
  }

  // Materialize: top by count.
  const all = Array.from(stats.entries())
    .map(([word, e]) => ({ word, e }))
    .filter((x) => x.e.count >= 2)
    .sort((a, b) => b.e.count - a.e.count)
    .slice(0, max);

  const words = all.map(({ word, e }) => {
    const avgSent = e.count > 0 ? e.sentSum / e.count : 0;
    const avgAge = e.count > 0 ? e.ageSum / e.count : 0;
    // Allow the word-list itself to override toward a strong signal.
    let score = avgSent;
    if (newsWordCloudSvc.POS_WORDS.has(word) && score < 0.5) score = 0.5;
    else if (newsWordCloudSvc.NEG_WORDS.has(word) && score > -0.5) score = -0.5;
    const channels = Array.from(e.channelCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
    return {
      word,
      count: e.count,
      sentiment_score: Math.round(score * 100) / 100,
      sentiment_label: labelForScore(score),
      avg_age_days: Math.round(avgAge * 10) / 10,
      channels,
    };
  });

  return {
    words,
    article_count: articleCount,
    sources,
    lookback_days: lookbackDays,
    date_range: `${since.toISOString().slice(0, 10)}..${now.toISOString().slice(0, 10)}`,
  };
}

module.exports = {
  getKeywordCloud,
  articleSentimentScore,
  labelForScore,
  phraseToken,
  ALL_SOURCES,
};
