// Deep Research Phase 3 — launch strategy engine.
//
// AI-generated go-to-market strategy for a venture idea: ICP, GTM, landing
// page, outreach, channels, pricing, and the pilot / enterprise / government
// motions. Grounded in the venture's monetization models + the report's
// strategic context so it's specific, not generic.
//
// Goes through the resilient aiProvider layer.

const aiProvider = require('./aiProvider.service');
const logger = require('../logging/logger');

const SYSTEM_PROMPT = `You are a go-to-market strategist at an AI venture studio.
Given a venture idea + its monetization models + strategic context, produce a concrete launch strategy.

Produce a JSON object:
{
  "icp": "2-3 sentences: the ideal customer profile — who to sell to first, specifically.",
  "gtm": "2-3 sentences: the core go-to-market motion.",
  "landing_page": "2-3 sentences: the landing page angle — headline promise + the one proof point.",
  "outreach": "2-3 sentences: the outreach strategy — how to actually reach the ICP.",
  "channels": ["3-6 short strings — the specific acquisition channels, best first."],
  "pricing_strategy": "2-3 sentences: concrete pricing — model + numbers/ranges.",
  "pilot_strategy": "1-2 sentences: how to land the first pilot/design partner.",
  "enterprise_strategy": "1-2 sentences: the path to enterprise deals (or 'not an enterprise play' if it isn't).",
  "gov_strategy": "1-2 sentences: the path to government deals (or 'not a government play' if it isn't)."
}

Rules:
- Be concrete and specific to THIS venture and its actual buyers — no generic "leverage social media" filler.
- Ground the strategy in the monetization models provided.
- Be honest: if enterprise or government is not a fit, say so plainly.
- Respond with ONLY the JSON object.`;

function buildUserPrompt(ventureIdea, ctx) {
  const { report = {}, monetizationModels = [] } = ctx;
  const meta = ventureIdea.metadata || {};
  const models = monetizationModels.length
    ? monetizationModels.map((m) => `  - ${m.modelType || m.model_type}: ${m.pricingSuggestion || m.pricing_suggestion || ''} `
      + `(ICP: ${m.idealIcp || m.ideal_icp || 'n/a'})`).join('\n')
    : '  (none generated)';
  return [
    `Venture idea: ${ventureIdea.title}`,
    `Description: ${ventureIdea.description || '(none)'}`,
    `Target customers: ${meta.target_customers || '(none)'}`,
    `Monetization strategy: ${ventureIdea.monetizationStrategy || ventureIdea.monetization_strategy || '(none)'}`,
    `GTM hint: ${ventureIdea.gtmSummary || ventureIdea.gtm_summary || '(none)'}`,
    '',
    'Monetization models on file:',
    models,
    '',
    'Strategic context:',
    `- Research topic: ${report.searchTerm || '(none)'}`,
    `- Market stage: ${report.marketStage || '(unknown)'}`,
    `- Government alignment: ${(report.reportJson && report.reportJson.government_alignment) || '(none)'}`,
  ].join('\n');
}

function sanitizeStrategy(parsed) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const channels = (Array.isArray(p.channels) ? p.channels : [])
    .filter((s) => typeof s === 'string' && s.trim())
    .slice(0, 6)
    .map((s) => s.slice(0, 100));
  const text = (v, len) => String(v || '').slice(0, len);
  return {
    icp: text(p.icp, 800),
    gtm: text(p.gtm, 800),
    landing_page: text(p.landing_page, 800),
    outreach: text(p.outreach, 800),
    channels,
    pricing_strategy: text(p.pricing_strategy, 800),
    pilot_strategy: text(p.pilot_strategy, 600),
    enterprise_strategy: text(p.enterprise_strategy, 600),
    gov_strategy: text(p.gov_strategy, 600),
    generated_by: 'deep-research-phase-3-launch-strategy',
  };
}

// Generate a launch strategy for a venture idea. Returns { strategy, tokensUsed }.
async function generateLaunchStrategy(ventureIdea, ctx = {}) {
  const { content, tokensUsed } = await aiProvider.chat(
    SYSTEM_PROMPT,
    buildUserPrompt(ventureIdea, ctx),
    { temperature: 0.55, maxTokens: 1600, operation: 'launch_strategy' },
  );
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.warn('launchStrategy: AI returned non-JSON', { snippet: String(content).slice(0, 160) });
    parsed = {};
  }
  return { strategy: sanitizeStrategy(parsed), tokensUsed };
}

module.exports = {
  buildUserPrompt,
  sanitizeStrategy,
  generateLaunchStrategy,
};
