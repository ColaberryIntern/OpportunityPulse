// Deep Research Phase 7.6 — competing-tools engine.
//
// Given the search topic + the opportunity context for a Deep Research run,
// queries the AiTool registry (the existing aiTools/ subsystem) and returns
// the tools most likely to be competing with — or already serving — the
// space the user is researching.
//
// Two distinct signals flow back into the synthesis pipeline:
//   1. A bounded list of competing tools (name, vendor, category,
//      momentum_stage, trending_score, sentiment, mention_count_7d,
//      pricing_tier, summary) for the prompt + the report UI.
//   2. A saturation_signal classification ('crowded' | 'active' |
//      'emerging' | 'empty') derived deterministically from counts +
//      momentum, so the venture-decision engine can consume it without
//      a second AI call.
//
// MEASURE-ONLY. Reads from ai_tools; never writes there.

const { Op } = require('sequelize');
const { AiTool } = require('../models');

const MAX_TOOLS = 12;
const MAX_TOKENS_FROM_CONTEXT = 6;

// Strip common English stopwords + the kind of fluff that pollutes every
// opportunity title (consulting / services / solutions / etc).
const STOPS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'by', 'as', 'is', 'are', 'we', 'our', 'your', 'their',
  'platform', 'service', 'services', 'solution', 'solutions',
  'consulting', 'support', 'system', 'systems', 'project', 'projects',
  'company', 'companies', 'business', 'team', 'group', 'inc', 'llc',
  'department', 'agency', 'office', 'request', 'proposal', 'rfp', 'rfq',
  'contract', 'opportunity', 'opportunities', 'new', 'major', 'general',
  'national', 'state', 'federal', 'county', 'city',
]);

function tokenizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .split(/[\s,;|/]+/)
    .map((t) => t.trim())
    .filter((t) => t && t.length >= 3 && !STOPS.has(t))
    .slice(0, 8);
}

// Pull the most-frequent meaningful tokens out of the channel item titles
// so that a thin search term ("rag") still gets enriched with adjacent
// vocabulary (e.g. "compliance", "government", "healthcare") that may
// match a tool's tag list more reliably than the original term alone.
function tokensFromContext(context, { max = MAX_TOKENS_FROM_CONTEXT } = {}) {
  const counts = new Map();
  const channels = Array.isArray(context && context.channels) ? context.channels : [];
  for (const ch of channels) {
    for (const item of (ch.items || [])) {
      const words = String(item.title || '')
        .toLowerCase()
        .match(/[a-z][a-z0-9-]{2,}/g) || [];
      for (const w of words) {
        if (STOPS.has(w)) continue;
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

function buildSearchTokens(searchTerm, context) {
  const fromTerm = tokenizeTerm(searchTerm);
  const fromContext = tokensFromContext(context);
  // Term tokens take precedence; context tokens fill the back half.
  const seen = new Set();
  const out = [];
  for (const t of [...fromTerm, ...fromContext]) {
    if (seen.has(t)) continue;
    seen.add(t); out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

// Score a tool against the search tokens. Higher = more competitive.
//   3 pts per token that hits name (highest signal — the tool literally has
//     this word in its product name).
//   1 pt per token that hits description.
//   1 pt per token that hits tags / industries / category.
//   + momentum bonus (composite_momentum_score up to 100) / 20.
//   + trending bonus (trending_score up to 100) / 30.
//   + recent activity bonus (mention_count_7d capped at 30) / 10.
function scoreTool(tool, tokens) {
  let score = 0;
  const matched = { name: [], description: [], tags: [] };
  const name = String(tool.name || '').toLowerCase();
  const desc = String(tool.description || '').toLowerCase();
  const tags = (Array.isArray(tool.tags) ? tool.tags : [])
    .map((t) => String(t || '').toLowerCase());
  const industries = (Array.isArray(tool.industries) ? tool.industries : [])
    .map((i) => String(i || '').toLowerCase());
  const category = String(tool.category || '').toLowerCase();
  for (const t of tokens) {
    if (!t) continue;
    if (name.includes(t)) { score += 3; matched.name.push(t); }
    if (desc.includes(t)) { score += 1; matched.description.push(t); }
    if (tags.some((tag) => tag.includes(t)) || industries.some((i) => i.includes(t)) || category.includes(t)) {
      score += 1; matched.tags.push(t);
    }
  }
  // Only return a hit when at least one token matched.
  if (score === 0) return null;
  const momentum = Math.min(100, Number(tool.compositeMomentumScore || 0));
  const trending = Math.min(100, Number(tool.trendingScore || 0));
  const mentions = Math.min(30, Number(tool.mentionCount7d || 0));
  score += momentum / 20;
  score += trending / 30;
  score += mentions / 10;
  return { score: Number(score.toFixed(2)), matched };
}

// Deterministic saturation classification from the matched-tool counts +
// their composite momentum. Consumed by venture-decision rationale.
function classifySaturation(rankedTools) {
  if (rankedTools.length === 0) return 'empty';
  const dominant = rankedTools.filter(
    (t) => ['dominant', 'explosive'].includes(t.momentum_stage),
  ).length;
  if (rankedTools.length >= 6 && dominant >= 2) return 'crowded';
  if (rankedTools.length >= 4) return 'active';
  if (rankedTools.length >= 1) return 'emerging';
  return 'empty';
}

function summarizeTool(tool) {
  return {
    id: tool.id,
    slug: tool.slug,
    name: tool.name,
    vendor: tool.vendor || null,
    category: tool.category || null,
    description: tool.description || null,
    pricing_tier: tool.pricingTier || null,
    trending_score: Number(tool.trendingScore || 0),
    composite_momentum_score: Number(tool.compositeMomentumScore || 0),
    momentum_stage: tool.momentumStage || null,
    trend_direction: tool.trendDirection || null,
    mention_count_7d: Number(tool.mentionCount7d || 0),
    sentiment_score: tool.sentimentScore != null ? Number(tool.sentimentScore) : null,
    open_source: Boolean(tool.openSource),
    website: tool.website || null,
  };
}

// Query the AiTool table for any tool that mentions any of the tokens in
// its name / description / tags. We do the matching SQL-side with a single
// OR-of-ILIKEs (caps the candidate scan to ~200), then re-rank in memory.
async function fetchCandidateTools(tokens, { candidateCap = 200 } = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const orClauses = [];
  for (const t of tokens) {
    const needle = `%${t}%`;
    orClauses.push({ name: { [Op.iLike]: needle } });
    orClauses.push({ description: { [Op.iLike]: needle } });
    orClauses.push({ tags: { [Op.contains]: [t] } });
  }
  return AiTool.findAll({
    where: { status: 'active', [Op.or]: orClauses },
    order: [['trending_score', 'DESC']],
    limit: candidateCap,
  });
}

// Public API — runs the full mining pass for a Deep Research synthesis.
async function findCompetingTools({ searchTerm, context, max = MAX_TOOLS } = {}) {
  const tokens = buildSearchTokens(searchTerm, context);
  if (tokens.length === 0) {
    return { tokens: [], tools: [], saturation_signal: 'empty', rationale: 'No usable search tokens.' };
  }
  const candidates = await fetchCandidateTools(tokens);
  const scored = candidates
    .map((c) => {
      const s = scoreTool(c, tokens);
      if (!s) return null;
      return { ...summarizeTool(c), match_score: s.score, matched_tokens: s.matched };
    })
    .filter(Boolean)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, max);
  const saturation = classifySaturation(scored);
  const rationale = scored.length === 0
    ? 'No AI tools in the registry match the search vocabulary.'
    : `${scored.length} tools in the registry match this topic, `
      + `classified as ${saturation} (${scored.filter((t) => ['dominant', 'explosive'].includes(t.momentum_stage)).length} dominant/explosive).`;
  return { tokens, tools: scored, saturation_signal: saturation, rationale };
}

module.exports = {
  MAX_TOOLS, STOPS,
  tokenizeTerm, tokensFromContext, buildSearchTokens,
  scoreTool, classifySaturation, summarizeTool,
  fetchCandidateTools, findCompetingTools,
};
