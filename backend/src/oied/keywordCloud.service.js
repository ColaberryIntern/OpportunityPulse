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

// Aggregate state per word. v9.8: sentSum and sentCount are separate so
// the average is taken over sentiment-BEARING samples only. Previously
// non-news sources passed sentiment=0 placeholders that diluted the
// score toward 0 and made every word look olive in the cloud. Now a
// word only contributes to sentiment if its source emitted a real
// sentiment signal (news titles, tool sentiment_score). All other
// sources (categories, channel titles, opp titles) bump count + age
// but do NOT touch sentiment math.
function newEntry() {
  return { count: 0, sentSum: 0, sentCount: 0, ageSum: 0, channelCounts: new Map() };
}

function addOccurrence(stats, word, { sentiment, ageDays, channelKey, weight = 1 }) {
  let e = stats.get(word);
  if (!e) { e = newEntry(); stats.set(word, e); }
  e.count += weight;
  if (sentiment != null) {
    e.sentSum += sentiment * weight;
    e.sentCount += weight;
  }
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
      // News categories are descriptive, not sentiment-bearing — leave
      // sentiment unset so the source doesn't dilute the news-derived score.
      addOccurrence(stats, tok, {
        sentiment: null, ageDays, channelKey: 'private-sector', weight: 2,
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
          sentiment: null, ageDays, channelKey, weight: 1,
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
        sentiment: null, ageDays, channelKey, weight: 2,
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
        // Tool name as a single phrase token. v9.8: only contribute
        // sentiment when the AiTool row has a real score — no synthetic
        // "+0.2 because tools are usually positive" fallback.
        const nameTok = phraseToken(data.name);
        if (nameTok) {
          const sent = data.sentimentScore != null
            ? Math.max(-1, Math.min(1, Number(data.sentimentScore)))
            : null;
          const w = Math.max(1, Math.min(8, Math.round(Number(data.mentionCount7d) || 1)));
          addOccurrence(stats, nameTok, {
            sentiment: sent, ageDays: 3, channelKey: null, weight: w,
          });
        }
        // Tag tokens (phrase-level since tags are short curated phrases).
        // Tags are descriptive labels — not sentiment-bearing.
        if (Array.isArray(data.tags)) {
          for (const tag of data.tags) {
            const tagTok = phraseToken(tag);
            if (tagTok) {
              addOccurrence(stats, tagTok, {
                sentiment: null, ageDays: 5, channelKey: null, weight: 1,
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
    // v9.8: average sentiment over sentiment-bearing samples only.
    // Words whose sources never emitted a real sentiment signal land at
    // null; the persistence layer maps null → 0 so the existing column
    // stays NOT NULL but the gradient can paint them gray (uninformative).
    const avgSent = e.sentCount > 0 ? e.sentSum / e.sentCount : null;
    const avgAge = e.count > 0 ? e.ageSum / e.count : 0;
    // Allow strong-polarity words from the seed lists to override toward
    // a clearer signal, but only when we already have *some* signal —
    // otherwise leave the score null so colorless words read as gray.
    let score = avgSent;
    if (score != null) {
      if (newsWordCloudSvc.POS_WORDS.has(word) && score < 0.5) score = 0.5;
      else if (newsWordCloudSvc.NEG_WORDS.has(word) && score > -0.5) score = -0.5;
    } else if (newsWordCloudSvc.POS_WORDS.has(word)) {
      score = 0.5;
    } else if (newsWordCloudSvc.NEG_WORDS.has(word)) {
      score = -0.5;
    }
    const channels = Array.from(e.channelCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
    // sentiment_known=false means "no sentiment-bearing source contributed"
    // — UI paints gray. score is still emitted (as 0) for back-compat
    // and storage, but the UI prefers sentiment_known when present.
    const known = score != null;
    const finalScore = known ? score : 0;
    return {
      word,
      count: e.count,
      sentiment_score: Math.round(finalScore * 100) / 100,
      sentiment_label: known ? labelForScore(finalScore) : 'unknown',
      sentiment_known: known,
      sentiment_sample_count: e.sentCount,
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

// v9.8: drill-down sub-cloud. Given one or more parent keywords, find
// every opportunity (any type, any status=active) that mentions them in
// title or description, tokenize those titles + descriptions, and
// aggregate per-token. The result is a focused sub-cloud — tokens that
// frequently co-occur with the parent keyword. Used by the keyword
// search results page to let users refine without paginating.
//
// Multi-token parent: if `q = ['healthcare', 'compliance']`, every
// matched opp must contain *both* tokens (AND, same as listMyOpps).
async function getDrillDownCloud({
  q = [],
  max = 30,
  now = new Date(),
} = {}) {
  if (!Opportunity) return { words: [], article_count: 0, q };
  const tokens = (Array.isArray(q) ? q : [q])
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return { words: [], article_count: 0, q: tokens };

  const andClauses = tokens.map((t) => {
    const needle = `%${t}%`;
    return {
      [Op.or]: [
        { title:       { [Op.iLike]: needle } },
        { description: { [Op.iLike]: needle } },
      ],
    };
  });

  const rows = await Opportunity.findAll({
    where: { status: 'active', [Op.and]: andClauses },
    attributes: ['id', 'type', 'source', 'title', 'description', 'category', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: 1500,
  });
  const articleCount = rows.length;
  if (articleCount === 0) return { words: [], article_count: 0, q: tokens };

  const stats = new Map();
  const nowMs = now.getTime();
  const parentSet = new Set(tokens);
  // Treat each row's combined text. Title gets weight 2 (more discriminating);
  // description weight 1; category weight 2 as a phrase token.
  for (const r of rows) {
    const data = r.toJSON ? r.toJSON() : r;
    const channelKey = (require('./channels.service').getChannelKey(data));
    const ageDays = Math.max(0, (nowMs - new Date(data.createdAt).getTime()) / 86_400_000);
    // News titles get the per-article sentiment treatment; everything
    // else contributes null sentiment so it doesn't dilute the score.
    const isNews = data.type === 'ai_news';
    const sent = isNews ? articleSentimentScore(data.title || '') : null;

    const titleToks = Array.from(new Set(newsWordCloudSvc.tokenize(data.title || '')));
    for (const tok of titleToks) {
      if (parentSet.has(tok)) continue; // skip the parent keyword itself
      addOccurrence(stats, tok, { sentiment: sent, ageDays, channelKey, weight: 2 });
    }
    const descToks = Array.from(new Set(newsWordCloudSvc.tokenize(data.description || '')));
    for (const tok of descToks) {
      if (parentSet.has(tok)) continue;
      addOccurrence(stats, tok, { sentiment: sent, ageDays, channelKey, weight: 1 });
    }
    const catTok = phraseToken(data.category);
    if (catTok && !parentSet.has(catTok)) {
      addOccurrence(stats, catTok, { sentiment: null, ageDays, channelKey, weight: 2 });
    }
  }

  const all = Array.from(stats.entries())
    .map(([word, e]) => ({ word, e }))
    .filter((x) => x.e.count >= 2)
    .sort((a, b) => b.e.count - a.e.count)
    .slice(0, max);

  const words = all.map(({ word, e }) => {
    const avgSent = e.sentCount > 0 ? e.sentSum / e.sentCount : null;
    const avgAge = e.count > 0 ? e.ageSum / e.count : 0;
    const known = avgSent != null;
    const finalScore = known ? avgSent : 0;
    const channels = Array.from(e.channelCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
    return {
      word,
      display_word: word.replace(/\b\w/g, (c) => c.toUpperCase()),
      count: e.count,
      sentiment_score: Math.round(finalScore * 100) / 100,
      sentiment_label: known ? labelForScore(finalScore) : 'unknown',
      sentiment_known: known,
      avg_age_days: Math.round(avgAge * 10) / 10,
      channels,
    };
  });

  return { words, article_count: articleCount, q: tokens };
}

module.exports = {
  getKeywordCloud,
  getDrillDownCloud,
  articleSentimentScore,
  labelForScore,
  phraseToken,
  ALL_SOURCES,
};
