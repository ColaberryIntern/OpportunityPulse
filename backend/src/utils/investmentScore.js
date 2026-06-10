/**
 * Deterministic relevance scoring for capital-deployment (investment) rows.
 *
 * Why this exists: the rich digest ranks each surface by `aiScore DESC NULLS
 * LAST`. Investment adapters (funding_news, sec_edgar_formd) previously emitted
 * rows with a null aiScore, so every freshly-ingested capital deployment sorted
 * BELOW the hand-seeded demo rows and never surfaced — the capital channel
 * looked frozen at its seed date. Giving real rows a real, deterministic score
 * lets them rank by size + recency + topical relevance the way every other
 * surface already does.
 *
 * Score is a 0–100 number, deterministic for a given input (no randomness, no
 * external calls), so re-ingesting the same row is idempotent.
 */

// Topical keywords that mark a raise as relevant to this product's AI focus.
const RELEVANCE_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm',
  'genai', 'generative', 'model', 'agent', 'robot', 'autonomous',
  'data', 'cloud', 'infrastructure', 'chip', 'semiconductor',
];

/**
 * Score the funding amount on a log scale.
 * $1M → ~40, $10M → ~52, $100M → ~64, $1B → ~76, $10B → ~88.
 * Null/unknown amounts get a neutral baseline so the row still ranks on
 * recency + relevance rather than being buried.
 * @param {number|null} value - Funding amount in dollars.
 * @returns {number} 0–100 partial score.
 */
function amountScore(value) {
  if (!value || !Number.isFinite(value) || value < 1_000_000) return 40;
  // log10(value / 1e6): $1M → 0, $1B → 3, $1T → 6. Scale by 12, offset 40.
  const score = 40 + 12 * Math.log10(value / 1_000_000);
  return Math.max(40, Math.min(100, score));
}

/**
 * Score recency. Fresh raises outrank stale ones; decays ~0.8/day.
 * 0d → 100, 30d → ~76, 90d → ~28, floored at 10 so very old rows can still
 * appear if nothing newer exists.
 * @param {Date|string|null} publishedAt - Announcement date.
 * @param {Date} [now] - Reference time (injectable for tests).
 * @returns {number} 10–100 partial score.
 */
function recencyScore(publishedAt, now = new Date()) {
  if (!publishedAt) return 30;
  const ts = publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
  if (Number.isNaN(ts)) return 30;
  const ageDays = (now.getTime() - ts) / 86_400_000;
  if (ageDays < 0) return 100; // future-dated (timezone slop) — treat as fresh
  return Math.max(10, Math.min(100, 100 - ageDays * 0.8));
}

/**
 * Score topical relevance by counting distinct AI/tech keywords present in the
 * combined text. 0 matches → 30 (off-topic raise), saturates at ~4 matches.
 * @param {string} text - Title + description + tags joined.
 * @returns {number} 30–100 partial score.
 */
function relevanceScore(text) {
  if (!text) return 30;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of RELEVANCE_KEYWORDS) {
    // word-ish boundary so "ml" doesn't match "html"
    const re = new RegExp(`(^|[^a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (re.test(lower)) hits += 1;
    if (hits >= 4) break;
  }
  return 30 + Math.min(4, hits) * 17.5; // 0→30, 4→100
}

/**
 * Compute the composite aiScore for an investment opportunity.
 * Weighted: 50% size, 35% recency, 15% relevance.
 * @param {object} opp - Partial opportunity shape.
 * @param {number|null} opp.value - Funding amount in dollars.
 * @param {Date|string|null} opp.publishedAt - Announcement date.
 * @param {string} [opp.title] - Title text.
 * @param {string} [opp.description] - Description text.
 * @param {string[]} [opp.tags] - Tags.
 * @param {Date} [now] - Reference time (injectable for tests).
 * @returns {number} Composite aiScore, rounded to 2 decimals, 0–100.
 */
function scoreInvestment(opp, now = new Date()) {
  const text = [opp.title, opp.description, ...(Array.isArray(opp.tags) ? opp.tags : [])]
    .filter(Boolean)
    .join(' ');
  const composite =
    0.5 * amountScore(opp.value) +
    0.35 * recencyScore(opp.publishedAt, now) +
    0.15 * relevanceScore(text);
  return Math.round(composite * 100) / 100;
}

module.exports = {
  scoreInvestment,
  amountScore,
  recencyScore,
  relevanceScore,
};
