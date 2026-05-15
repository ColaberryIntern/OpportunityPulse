// Deep Research Intelligence Engine — strategic synthesis.
//
// Pure AI layer: takes the normalized, channel-grouped strategic context
// from deepResearch.service and produces the executive narrative — the
// "what does all of this mean" layer. It does NOT touch the database and
// does NOT generate venture ideas (that's ventureIdeaGenerator).
//
// One model call, schema-shaped output, sanitized before return.

const aiProvider = require('./aiProvider.service');
const logger = require('../logging/logger');

const MARKET_STAGES = ['too_early', 'emerging', 'active', 'saturated', 'unknown'];

const SYSTEM_PROMPT = `You are the lead strategist of an AI venture studio (Colaberry — an AI services + product company).
You are given a cross-channel strategic context: opportunities pulled from research papers, government contracts, jobs, freelance projects, capital/funding, news, and strategic patterns — all related to one search topic. You are ALSO given a list of AI tools already shipping in this space, mined from a curated registry of ~hundreds of products.

Your job is to synthesize ALL of it into one executive intelligence briefing. You are not summarizing each channel; you are reading across them — including the competing tools — to find the venture-relevant signal.

Produce a JSON object:
{
  "executive_summary": "3-5 sentences. What is the opportunity landscape around this topic, and what is the single most important takeaway for a venture studio?",
  "market_stage": "one of: too_early | emerging | active | saturated",
  "confidence_score": 0.0-1.0,
  "market_timing_narrative": "2-3 sentences on WHY this is the market stage you picked — what in the data tells you that.",
  "opportunity_signals": ["3-6 short bullet strings — the concrete signals across channels. Reference channel evidence, e.g. 'X linked government contracts indicate near-term procurement demand.'"],
  "government_alignment": "1-2 sentences: is there a government / public-sector angle here? If none in the data, say so honestly.",
  "research_highlights": ["2-4 short strings — the most venture-relevant research findings, if research opps are present. Empty array if none."],
  "suggested_mvps": ["2-4 short strings — rough MVP directions a small team could ship in ~1 quarter."],
  "monetization_strategy": "2-3 sentences: the most credible way to make money here.",
  "build_recommendation": "1-2 sentences: should Colaberry build into this space now, watch it, or pass — and why. Reference the competing tools when relevant.",
  "trend_summary": "1-2 sentences: the directional trend — is this accelerating, steady, or cooling?",
  "competitive_landscape_summary": "2-3 sentences: what does the competing-tool list tell us about who is already shipping here? Name the most dominant tool(s). If the list is empty, say the space appears unserved."
}

Rules:
- Be concrete and specific to the actual data you were given. No generic "leverage AI to disrupt" filler.
- Ground every claim in the channel evidence. If a channel has zero items, do not invent signal for it.
- For market_stage: if dominant/explosive tools are listed, you cannot call the market "emerging" without justifying it. If the tool list is empty AND opportunity signal is thin, lean "too_early". An "active" or "saturated" call must be supported either by tool count or by cross-channel demand volume.
- confidence_score reflects how much real, corroborating cross-channel signal exists. Thin data = low confidence.
- If the context is sparse (few sources, one channel), say so honestly in the executive summary and keep confidence low.
- Respond with ONLY the JSON object.`;

// Build the user prompt from the aggregated context. Bounded — the
// per-channel item cap is already applied upstream in aggregateContext.
// Phase 7.6: also injects the competing-tools section so the AI grounds
// market_stage against actual products already shipping.
function buildUserPrompt(context, competingTools = null) {
  const lines = [
    `Search topic: ${context.searchTerm}`,
    '',
    `Totals: ${context.totals.sourceCount} opportunities across ${context.totals.channelCount} channels`
      + ` · combined disclosed value $${Number(context.totals.totalValue || 0).toLocaleString()}`
      + ` · ${context.totals.buildableResearchCount} buildable research papers`
      + ` · ${context.totals.withDemandSignalCount} with cross-channel demand links`,
    '',
    'Channel breakdown:',
  ];
  for (const ch of context.channels) {
    lines.push(`\n## ${ch.label} (${ch.count} opportunities, $${Number(ch.totalValue || 0).toLocaleString()} disclosed value)`);
    for (const item of ch.items) {
      const bits = [];
      if (item.value) bits.push(`$${Number(item.value).toLocaleString()}`);
      if (item.actionType) bits.push(item.actionType);
      if (item.buildable) bits.push('BUILDABLE');
      if (item.marketTiming) bits.push(`timing:${item.marketTiming}`);
      if (item.githubRepo) bits.push('has-repo');
      if (item.crossChannelLinks) bits.push(`${item.crossChannelLinks} links`);
      const meta = bits.length ? ` [${bits.join(' · ')}]` : '';
      lines.push(`- ${item.title}${meta}`);
      if (item.excerpt) lines.push(`  ${item.excerpt}`);
    }
  }
  // Phase 7.6 — competing tools (existing products in this space).
  if (competingTools) {
    const tools = Array.isArray(competingTools.tools) ? competingTools.tools : [];
    lines.push('');
    lines.push(`## Existing AI Tools in This Space (saturation_signal: ${competingTools.saturation_signal})`);
    if (tools.length === 0) {
      lines.push('No active AI tools in our curated registry match this topic.');
    } else {
      for (const t of tools) {
        const bits = [];
        if (t.vendor) bits.push(t.vendor);
        if (t.category) bits.push(t.category);
        if (t.momentum_stage) bits.push(`momentum:${t.momentum_stage}`);
        if (t.trend_direction) bits.push(`trend:${t.trend_direction}`);
        if (t.pricing_tier) bits.push(t.pricing_tier);
        if (t.open_source) bits.push('open-source');
        const meta = bits.length ? ` [${bits.join(' · ')}]` : '';
        lines.push(`- ${t.name}${meta}`);
        if (t.description) lines.push(`  ${String(t.description).slice(0, 220)}`);
      }
    }
  }
  return lines.join('\n');
}

// Clamp + truncate the AI output into the persisted shape. Defensive: the
// model can return missing keys, out-of-range numbers, or wrong types.
function sanitizeSynthesis(parsed) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const conf = Math.max(0, Math.min(1, Number(p.confidence_score) || 0));
  const stage = MARKET_STAGES.includes(p.market_stage) ? p.market_stage : 'unknown';
  const strArr = (v, max, len) => (Array.isArray(v) ? v : [])
    .filter((s) => typeof s === 'string' && s.trim())
    .slice(0, max)
    .map((s) => s.slice(0, len));
  return {
    executive_summary: String(p.executive_summary || '').slice(0, 1500),
    market_stage: stage,
    confidence_score: conf,
    market_timing_narrative: String(p.market_timing_narrative || '').slice(0, 800),
    opportunity_signals: strArr(p.opportunity_signals, 6, 400),
    government_alignment: String(p.government_alignment || '').slice(0, 600),
    research_highlights: strArr(p.research_highlights, 4, 400),
    suggested_mvps: strArr(p.suggested_mvps, 4, 400),
    monetization_strategy: String(p.monetization_strategy || '').slice(0, 800),
    build_recommendation: String(p.build_recommendation || '').slice(0, 600),
    trend_summary: String(p.trend_summary || '').slice(0, 600),
    // Phase 7.6 — new field; safe-default to empty string when AI omits.
    competitive_landscape_summary: String(p.competitive_landscape_summary || '').slice(0, 800),
  };
}

// Run the synthesis. Returns { synthesis, tokensUsed }. Throws if the AI
// call itself fails — the orchestrator treats this as the hard gate.
// Phase 7.6: accepts an optional competingTools payload to inject into
// the user prompt.
async function synthesize(context, competingTools = null) {
  const { content, tokensUsed } = await aiProvider.chat(
    SYSTEM_PROMPT,
    buildUserPrompt(context, competingTools),
    {
      temperature: 0.4,
      maxTokens: 1700,
      operation: 'strategy_synthesis',
    },
  );
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.warn('strategySynthesis: AI returned non-JSON', {
      snippet: String(content).slice(0, 160),
    });
    parsed = {};
  }
  return { synthesis: sanitizeSynthesis(parsed), tokensUsed };
}

module.exports = {
  buildUserPrompt,
  sanitizeSynthesis,
  synthesize,
};
