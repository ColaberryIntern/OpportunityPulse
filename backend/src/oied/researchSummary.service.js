// Research Intelligence Phase 2.1 — AI research summaries.
//
// For each research opportunity (type='research'), generate a business-
// oriented summary the team can act on without reading the paper:
//   - executive_summary  : "what does this mean for business?"
//   - build_recommendation: "can Colaberry build this, and how?"
//   - buildable          : boolean — quick yes/no filter
//   - market_timing      : too_early | emerging | active | saturated
//   - competitive_insight: "who is commercializing this already?"
//
// Stored on opportunity.aiAnalysis.research_summary. Idempotent — skips
// rows that already have a summary unless force=true. Batched + rate-aware,
// mirrors the classification.service pattern.

const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');

const BATCH_SIZE = 20;        // research opps per run
const MARKET_TIMINGS = ['too_early', 'emerging', 'active', 'saturated'];

const SYSTEM_PROMPT = `You are a technology strategist at Colaberry, an AI services + product company.
You read AI research papers and translate them into business intelligence — NOT academic critique.

For the paper you're given (title + abstract + metadata), produce a JSON object:
{
  "executive_summary": "2-3 sentences: what the paper does and why a business should care. Plain language, no jargon.",
  "build_recommendation": "1-2 sentences: can Colaberry realistically build or apply this? If yes, the rough shape of the build. If no, why not.",
  "buildable": true | false,
  "market_timing": "too_early" | "emerging" | "active" | "saturated",
  "competitive_insight": "1 sentence: who (if anyone) is already commercializing this kind of capability."
}

Rules:
- market_timing: "too_early" = research-only, no products; "emerging" = early products/startups; "active" = real market, multiple players; "saturated" = commodity.
- buildable=true only if a small AI services firm could realistically ship something using this within ~1-2 quarters.
- Be honest. Most papers are "too_early" + not directly buildable. That's a fine answer.
- Ground every claim in the paper text. Do not invent benchmarks or company names.
- Respond with ONLY the JSON object.`;

function buildUserPrompt(opp) {
  const sd = opp.sourceData || {};
  const lines = [
    `Title: ${opp.title || ''}`,
    `Source: ${opp.source || ''}`,
    sd.venue ? `Venue: ${sd.venue}` : '',
    sd.citationCount != null ? `Citations: ${sd.citationCount}` : '',
    sd.upvotes != null ? `Community upvotes: ${sd.upvotes}` : '',
    Array.isArray(sd.domains) && sd.domains.length ? `Domains: ${sd.domains.join(', ')}` : '',
    sd.githubRepo ? `Has public GitHub repo: yes` : '',
    '',
    'Abstract:',
    String(opp.description || '').slice(0, 3000),
  ].filter(Boolean);
  return lines.join('\n');
}

function sanitizeSummary(parsed, modelUsed) {
  const timing = MARKET_TIMINGS.includes(parsed.market_timing)
    ? parsed.market_timing
    : 'too_early';
  return {
    executive_summary: String(parsed.executive_summary || '').slice(0, 600),
    build_recommendation: String(parsed.build_recommendation || '').slice(0, 400),
    buildable: parsed.buildable === true,
    market_timing: timing,
    competitive_insight: String(parsed.competitive_insight || '').slice(0, 400),
    generated_at: new Date().toISOString(),
    model_used: modelUsed,
  };
}

// Summarize one research opp. Returns the summary object (also persisted).
async function summarizeOne(opportunity) {
  const ai = getAIClient();
  const { content, tokensUsed } = await ai.chat(SYSTEM_PROMPT, buildUserPrompt(opportunity), {
    temperature: 0.2,
    maxTokens: 600,
  });
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.warn('researchSummary: AI returned non-JSON', { id: opportunity.id, snippet: String(content).slice(0, 160) });
    parsed = {};
  }
  const summary = sanitizeSummary(parsed, ai.model);
  const existing = opportunity.aiAnalysis || {};
  await opportunity.update({
    aiAnalysis: { ...existing, research_summary: summary },
  });
  return { summary, tokensUsed };
}

// Batch: summarize research opps that don't have a summary yet.
async function summarizeResearchBatch({ force = false, limit = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'research_summary',
    status: 'running',
    startedAt: new Date(),
  });
  try {
    const where = { type: 'research', status: 'active' };
    // Only pick rows missing a research_summary (unless force).
    const opps = await Opportunity.findAll({
      where,
      order: [['published_at', 'DESC']],
      limit: Math.min(Number(limit) || BATCH_SIZE, 100),
    });
    const todo = force
      ? opps
      : opps.filter((o) => !(o.aiAnalysis && o.aiAnalysis.research_summary));

    if (todo.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No research opps need summarizing.' },
        completedAt: new Date(),
      });
      return run;
    }

    let success = 0;
    let tokensUsed = 0;
    const errors = [];
    const timingCounts = {};
    let buildableCount = 0;

    for (const opp of todo) {
      try {
        const { summary, tokensUsed: t } = await summarizeOne(opp);
        tokensUsed += t;
        success += 1;
        timingCounts[summary.market_timing] = (timingCounts[summary.market_timing] || 0) + 1;
        if (summary.buildable) buildableCount += 1;
      } catch (e) {
        errors.push({ opportunityId: opp.id, error: e.message });
        logger.warn('researchSummary: failed for opp', { id: opp.id, error: e.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: todo.length,
      outputCount: success,
      results: {
        summarized: success,
        buildable: buildableCount,
        byMarketTiming: timingCounts,
      },
      errors,
      tokensUsed,
      completedAt: new Date(),
    });
    logger.info('researchSummary batch complete', { input: todo.length, summarized: success, errors: errors.length });
    return run;
  } catch (error) {
    logger.error('researchSummary batch failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

module.exports = {
  summarizeOne,
  summarizeResearchBatch,
  buildUserPrompt,
  sanitizeSummary,
  MARKET_TIMINGS,
};
