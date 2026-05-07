// OIED News Word Cloud — extracts the most-talked-about words across
// recent ai_news rows so Mission Control can show what's trending in
// the private-sector news stream.
//
// Per Ali's spec:
//   - size  = how many articles mention the word (frequency)
//   - color = sentiment (positive=green, negative=red, neutral=gray)
//   - tilt  = age (most-recent = horizontal; older = rotated)
//   - click = filter My Opps to news + that keyword
//
// Pure SQL + JS. No AI calls. Sentiment is a small keyword-list
// heuristic — fast and deterministic. Good enough for a "what's hot"
// signal; can be replaced with a real classifier later if needed.

const { Op } = require('sequelize');
const { Opportunity } = require('../models');

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your',
  'we', 'our', 'us', 'they', 'them', 'their', 'how', 'why', 'what',
  'when', 'where', 'which', 'who', 'all', 'any', 'can', 'do', 'does',
  'just', 'more', 'new', 'no', 'not', 'now', 'one', 'only', 'so', 'some',
  'still', 'than', 'then', 'these', 'those', 'too', 'up', 'down', 'over',
  'about', 'after', 'before', 'between', 'into', 'out', 'off', 'most',
  'much', 'very', 'really', 'every', 'other', 'such', 'own', 'same',
  'few', 'each', 'both', 'either', 'neither', 'be', 'been', 'being',
  'am', 'i', 'my', 'me', 'mine', 'he', 'she', 'him', 'her', 'his',
  'top', 'best', 'first', 'last', 'next', 'old', 'big', 'small', 'high',
  'low', 'good', 'bad', 'great', 'better', 'best', 'right', 'left',
  'thing', 'things', 'something', 'anything', 'everything', 'nothing',
  'way', 'ways', 'time', 'times', 'day', 'days', 'week', 'weeks', 'year',
  'years', 'using', 'use', 'used', 'get', 'got', 'getting', 'make',
  'made', 'making', 'going', 'go', 'went', 'gone', 'come', 'came',
  'coming', 'know', 'known', 'see', 'seen', 'saw', 'look', 'looking',
  'try', 'trying', 'tried', 'work', 'works', 'working', 'worked',
  'need', 'needs', 'needed', 'help', 'helps', 'helping', 'helped',
  'said', 'says', 'saying', 'tell', 'told', 'show', 'shows', 'showed',
  'find', 'found', 'finding', 'give', 'gives', 'gave', 'given', 'take',
  'takes', 'took', 'taken', 'put', 'puts', 'putting', 'set', 'sets',
  'setting', 'run', 'runs', 'running', 'ran', 'turn', 'turns', 'turned',
  'turning', 'start', 'starts', 'started', 'starting', 'end', 'ends',
  'ended', 'ending', 'keep', 'keeps', 'kept', 'keeping', 'let', 'lets',
  'letting', 'should', 'would', 'could', 'may', 'might', 'must',
  'shall', 'cannot', 'cant', 'wont', 'dont', 'doesnt', 'didnt',
  // Common AI-news filler that adds noise.
  'ai', 'llm', 'llms', 'model', 'models', 'data', 'system', 'systems',
  'code', 'tool', 'tools', 'app', 'apps', 'real', 'why', 'how-to',
  'tutorial', 'guide', 'building', 'build', 'built',
]);

const POS_WORDS = new Set([
  'wins', 'winning', 'won', 'success', 'successful', 'launches', 'launch',
  'launched', 'raises', 'raised', 'funding', 'funded', 'breakthrough',
  'milestone', 'partnership', 'partners', 'release', 'released', 'releases',
  'unlocks', 'unlocked', 'gains', 'growth', 'growing', 'grew',
  'rises', 'rising', 'rose', 'beats', 'beat', 'leads', 'leading',
  'leader', 'innovation', 'innovative', 'announces', 'announce',
  'announcement', 'achieves', 'achievement', 'fastest', 'faster',
  'efficient', 'optimization', 'breakthrough', 'cutting-edge',
  'state-of-the-art', 'sota', 'open-source', 'free', 'available',
]);

const NEG_WORDS = new Set([
  'lawsuit', 'sued', 'fired', 'firing', 'layoff', 'layoffs', 'fail',
  'fails', 'failed', 'failure', 'crashes', 'crashed', 'down', 'broken',
  'breaks', 'broke', 'attack', 'attacks', 'attacked', 'breach', 'hack',
  'hacked', 'hacking', 'stolen', 'leak', 'leaked', 'fraud', 'scam',
  'risk', 'risky', 'dangerous', 'threat', 'threats', 'warning',
  'controversy', 'controversial', 'banned', 'ban', 'shut', 'shutdown',
  'closed', 'closing', 'losing', 'lost', 'loss', 'losses', 'declining',
  'decline', 'drop', 'drops', 'falls', 'fell', 'crisis', 'concern',
  'concerns', 'worried', 'wrong', 'error', 'errors', 'bug', 'bugs',
  'problems', 'problem', 'issues', 'flaws', 'flaw', 'misuse',
  'abuse', 'criticism', 'criticized', 'denied', 'rejected',
]);

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')   // strip punct except apostrophe + hyphen
    .split(/\s+/)
    .filter((w) => w.length >= 4 && w.length <= 22)
    .filter((w) => !STOP_WORDS.has(w))
    .filter((w) => !/^[0-9]+$/.test(w));
}

function wordSentiment(word) {
  if (POS_WORDS.has(word)) return 'positive';
  if (NEG_WORDS.has(word)) return 'negative';
  return 'neutral';
}

// Article sentiment from the title alone — count pos/neg words.
function articleSentiment(title) {
  const tokens = tokenize(title);
  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    if (POS_WORDS.has(t)) pos += 1;
    if (NEG_WORDS.has(t)) neg += 1;
  }
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

const LOOKBACK_DAYS = 14;
const MAX_WORDS = 40;

async function getNewsWordCloud({ now = new Date(), max = MAX_WORDS } = {}) {
  if (!Opportunity) return { words: [], dateRange: null, articleCount: 0 };
  const since = new Date(now);
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const rows = await Opportunity.findAll({
    where: {
      type: 'ai_news',
      status: 'active',
      createdAt: { [Op.gte]: since },
    },
    order: [['createdAt', 'DESC']],
    attributes: ['id', 'title', 'createdAt'],
    limit: 2000,
  });

  // Per-word aggregation: count, total age (for average), sentiment tally.
  const stats = new Map();
  const nowMs = now.getTime();
  for (const r of rows) {
    const data = r.toJSON ? r.toJSON() : r;
    const articleSent = articleSentiment(data.title);
    const ageDays = Math.max(0, (nowMs - new Date(data.createdAt).getTime()) / 86_400_000);
    const tokens = Array.from(new Set(tokenize(data.title))); // dedupe per-title
    for (const tok of tokens) {
      let entry = stats.get(tok);
      if (!entry) {
        entry = { word: tok, count: 0, ageSum: 0, pos: 0, neg: 0 };
        stats.set(tok, entry);
      }
      entry.count += 1;
      entry.ageSum += ageDays;
      if (articleSent === 'positive') entry.pos += 1;
      else if (articleSent === 'negative') entry.neg += 1;
    }
  }

  // Materialize: pick top by count, compute avg age + dominant sentiment.
  const all = Array.from(stats.values())
    .filter((e) => e.count >= 2) // drop one-offs to keep the cloud focused
    .sort((a, b) => b.count - a.count)
    .slice(0, max);

  const words = all.map((e) => {
    const avgAge = e.ageSum / e.count;
    let sentiment = 'neutral';
    if (e.pos > e.neg) sentiment = 'positive';
    else if (e.neg > e.pos) sentiment = 'negative';
    // Word-level sentiment beats article-aggregated when it's strong.
    const ws = wordSentiment(e.word);
    if (ws !== 'neutral') sentiment = ws;
    return {
      word: e.word,
      count: e.count,
      avg_age_days: Math.round(avgAge * 10) / 10,
      sentiment,
    };
  });

  return {
    words,
    article_count: rows.length,
    date_range: `${since.toISOString().slice(0, 10)}..${now.toISOString().slice(0, 10)}`,
    lookback_days: LOOKBACK_DAYS,
  };
}

module.exports = {
  getNewsWordCloud,
  tokenize,
  articleSentiment,
  wordSentiment,
  STOP_WORDS,
  POS_WORDS,
  NEG_WORDS,
};
