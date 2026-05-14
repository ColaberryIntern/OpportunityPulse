// Deep Research Intelligence Engine — venture idea generation.
//
// Pure AI layer: takes the strategic context + the strategySynthesis
// narrative and generates concrete, commercializable venture ideas. Like
// strategySynthesis it does NOT touch the database — it returns plain
// objects that deepResearch.service persists as venture_ideas rows.
//
// Separated from strategySynthesis deliberately: synthesis answers "what
// does this mean", this answers "what would we build". Two responsibilities,
// two services, two prompts.

const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');

const MARKET_TIMINGS = ['too_early', 'emerging', 'active', 'saturated'];
const REVENUE_BANDS = ['low', 'medium', 'high', 'very_high'];
// A report should produce a focused shortlist, not a brainstorm dump.
const MAX_IDEAS = 5;

const SYSTEM_PROMPT = `You are a venture architect at Colaberry, an AI services + product company.
You are given (1) a cross-channel strategic context around a search topic and (2) an executive synthesis of that landscape already produced by the lead strategist.

Your job: turn that landscape into a SHORTLIST of concrete venture ideas Colaberry could actually build and sell.

Produce a JSON object:
{
  "venture_ideas": [
    {
      "title": "Short, specific product/venture name — not a category.",
      "description": "2-3 sentences: what it is and the wedge.",
      "monetization_strategy": "2-3 sentences: exactly how it makes money (pricing model, who pays, contract shape).",
      "market_timing": "one of: too_early | emerging | active | saturated",
      "buildability_score": 0.0-1.0,
      "revenue_potential": "one of: low | medium | high | very_high",
      "mvp_scope": "1-2 sentences: the smallest version that proves value and ships in ~1 quarter for a small team.",
      "gtm_summary": "1-2 sentences: the first go-to-market motion — who to sell to first and how.",
      "suggested_architecture": "1-2 sentences: rough technical shape — what's reused vs net-new.",
      "target_customers": "1 sentence: who buys it, grounded in the channel evidence."
    }
  ]
}

Rules:
- Generate 2 to ${MAX_IDEAS} ideas. Quality over quantity — a focused shortlist, not a brainstorm.
- Every idea must be traceable to the actual context. If government contracts are in the data, at least one idea should have a public-sector GTM. If research papers are present, lean on what's technically newly-possible.
- buildability_score: how shippable for a small team in ~1 quarter. Moonshots score low.
- revenue_potential: be honest. Most ideas are 'medium'. 'very_high' needs real evidence of scale demand in the data.
- mvp_scope must be genuinely small.
- No generic "an AI platform for X" filler. Be specific.
- Respond with ONLY the JSON object.`;

// Compact the synthesis into a short prompt block — the venture generator
// needs the strategist's conclusions, not the raw channel dump again.
function buildUserPrompt(context, synthesis) {
  const lines = [
    `Search topic: ${context.searchTerm}`,
    `Scope: ${context.totals.sourceCount} opportunities across ${context.totals.channelCount} channels`
      + ` (${context.channels.map((c) => `${c.label}:${c.count}`).join(', ')})`,
    '',
    'Lead strategist synthesis:',
    `- Executive summary: ${synthesis.executive_summary || '(none)'}`,
    `- Market stage: ${synthesis.market_stage}  (confidence ${synthesis.confidence_score})`,
    `- Build recommendation: ${synthesis.build_recommendation || '(none)'}`,
    `- Monetization read: ${synthesis.monetization_strategy || '(none)'}`,
    `- Government alignment: ${synthesis.government_alignment || '(none)'}`,
  ];
  if (synthesis.opportunity_signals && synthesis.opportunity_signals.length) {
    lines.push('- Opportunity signals:');
    for (const s of synthesis.opportunity_signals) lines.push(`  · ${s}`);
  }
  if (synthesis.suggested_mvps && synthesis.suggested_mvps.length) {
    lines.push('- Strategist MVP directions:');
    for (const s of synthesis.suggested_mvps) lines.push(`  · ${s}`);
  }
  return lines.join('\n');
}

// Clamp + truncate one idea into the persisted shape.
function sanitizeIdea(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const timing = MARKET_TIMINGS.includes(p.market_timing) ? p.market_timing : null;
  const revenue = REVENUE_BANDS.includes(p.revenue_potential) ? p.revenue_potential : 'medium';
  const build = Math.max(0, Math.min(1, Number(p.buildability_score) || 0));
  return {
    title: String(p.title || '').slice(0, 300),
    description: String(p.description || '').slice(0, 1200),
    monetization_strategy: String(p.monetization_strategy || '').slice(0, 1200),
    market_timing: timing,
    buildability_score: build,
    revenue_potential: revenue,
    mvp_scope: String(p.mvp_scope || '').slice(0, 800),
    gtm_summary: String(p.gtm_summary || '').slice(0, 800),
    metadata: {
      suggested_architecture: String(p.suggested_architecture || '').slice(0, 800),
      target_customers: String(p.target_customers || '').slice(0, 600),
    },
  };
}

// Returns { ideas, tokensUsed }. Ideas missing a title are dropped — a
// nameless venture idea is noise. Throws if the AI call itself fails;
// the orchestrator catches that and degrades the report to 'partial'.
async function generateVentureIdeas(context, synthesis) {
  const ai = getAIClient();
  const { content, tokensUsed } = await ai.chat(SYSTEM_PROMPT, buildUserPrompt(context, synthesis), {
    temperature: 0.6,
    maxTokens: 2000,
  });
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.warn('ventureIdeaGenerator: AI returned non-JSON', {
      snippet: String(content).slice(0, 160),
    });
    parsed = {};
  }
  const rawIdeas = Array.isArray(parsed.venture_ideas) ? parsed.venture_ideas : [];
  // Sanitize → drop nameless ideas → THEN cap, so a nameless entry doesn't
  // eat a slot in the shortlist.
  const ideas = rawIdeas
    .map(sanitizeIdea)
    .filter((i) => i.title)
    .slice(0, MAX_IDEAS);
  return { ideas, tokensUsed };
}

module.exports = {
  buildUserPrompt,
  sanitizeIdea,
  generateVentureIdeas,
};
