// Deep Research Phase 2 — monetization intelligence engine.
//
// Produces a structured set of monetization models for a report — one per
// relevant model type: SaaS, enterprise, government, education, services,
// marketplace. Each model carries pricing guidance, an ICP, a revenue
// model, and an implementation-complexity read.
//
// Hybrid by design: the model CONTENT is AI-generated (pricing/ICP/revenue
// model are inherently creative), but the STRUCTURE is fixed (the 6 types)
// and the fit_score is computed DETERMINISTICALLY from the report's channel
// signal — so the ranking of which models actually fit is auditable, not a
// model opinion.

const aiProvider = require('./aiProvider.service');
const logger = require('../logging/logger');

const MODEL_TYPES = ['saas', 'enterprise', 'government', 'education', 'services', 'marketplace'];
const COMPLEXITY = ['low', 'medium', 'high'];

const SYSTEM_PROMPT = `You are a monetization strategist at an AI venture studio.
Given a research topic, an executive synthesis, and the cross-channel signal mix, produce concrete monetization models — one for each model type that is genuinely viable for this topic.

Produce a JSON object:
{
  "monetization_models": [
    {
      "model_type": "one of: saas | enterprise | government | education | services | marketplace",
      "pricing_suggestion": "1-2 sentences: concrete pricing — tiers, ranges, per-seat/per-usage/per-contract.",
      "ideal_icp": "1 sentence: the ideal customer profile for THIS model.",
      "revenue_model": "1-2 sentences: how revenue actually accrues — recurring, project, transaction fee, etc.",
      "implementation_complexity": "one of: low | medium | high"
    }
  ]
}

Rules:
- Only include model types that are actually viable for this topic — do NOT force all six. 3-6 is typical.
- Be concrete and specific to the topic. No generic "offer a subscription" filler.
- pricing_suggestion must have real numbers or ranges.
- Respond with ONLY the JSON object.`;

function buildUserPrompt(context, synthesis) {
  const channels = (context.channels || [])
    .map((c) => `${c.label}: ${c.count}`).join(', ');
  return [
    `Research topic: ${context.searchTerm}`,
    `Channel mix: ${channels || '(none)'}`,
    '',
    'Executive synthesis:',
    `- ${synthesis.executive_summary || '(none)'}`,
    `- Market stage: ${synthesis.market_stage || 'unknown'}`,
    `- Monetization read so far: ${synthesis.monetization_strategy || '(none)'}`,
    `- Government alignment: ${synthesis.government_alignment || '(none)'}`,
  ].join('\n');
}

// Deterministic fit_score (0-1) for a model type, computed from the report's
// channel signal mix. This is the auditable part — which models actually fit
// is math, not an AI opinion.
function computeFitScore(modelType, context) {
  const byKey = {};
  for (const c of context.channels || []) byKey[c.key] = c.count || 0;
  const total = Object.values(byKey).reduce((s, n) => s + n, 0) || 1;
  const frac = (k) => (byKey[k] || 0) / total;
  const has = (k) => (byKey[k] || 0) >= 2;

  let score;
  switch (modelType) {
    case 'government':
      // Government model fits when the government channel carries real signal.
      score = Math.min(1, frac('government') * 2.5 + (has('government') ? 0.3 : 0));
      break;
    case 'saas':
      // SaaS fits when there's a research/capability base + hiring demand.
      score = Math.min(1, frac('research') * 1.5 + frac('talent') * 1.5 + 0.2);
      break;
    case 'enterprise':
      // Enterprise fits with capital validation + talent demand.
      score = Math.min(1, frac('capital') * 2 + frac('talent') * 1.5 + 0.15);
      break;
    case 'services':
      // Services fits with freelance + government demand (delivery work).
      score = Math.min(1, frac('freelance') * 2 + frac('government') * 1.5 + 0.2);
      break;
    case 'education':
      // Education fits with a deep research base.
      score = Math.min(1, frac('research') * 2.5 + 0.1);
      break;
    case 'marketplace':
      // Marketplace fits when signal is broad (many channels active).
      score = Math.min(1, (Object.values(byKey).filter((n) => n >= 2).length / 6) * 0.9 + 0.1);
      break;
    default:
      score = 0.3;
  }
  return Number(score.toFixed(3));
}

// Clamp + validate one AI-produced model into the persisted shape, attaching
// the deterministic fit_score.
function sanitizeModel(raw, context) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const modelType = MODEL_TYPES.includes(p.model_type) ? p.model_type : null;
  if (!modelType) return null;
  const complexity = COMPLEXITY.includes(p.implementation_complexity)
    ? p.implementation_complexity : 'medium';
  return {
    model_type: modelType,
    pricing_suggestion: String(p.pricing_suggestion || '').slice(0, 600),
    ideal_icp: String(p.ideal_icp || '').slice(0, 400),
    revenue_model: String(p.revenue_model || '').slice(0, 600),
    implementation_complexity: complexity,
    fit_score: computeFitScore(modelType, context),
    metadata: {},
  };
}

// Generate monetization models for a report. Returns { models, tokensUsed }.
// Throws if the AI call itself fails — the orchestrator catches it and
// degrades the report rather than failing it (monetization is enrichment,
// not the core narrative).
async function generateMonetizationModels(context, synthesis) {
  const { content, tokensUsed } = await aiProvider.chat(
    SYSTEM_PROMPT,
    buildUserPrompt(context, synthesis),
    { temperature: 0.5, maxTokens: 1600, operation: 'monetization_intelligence' },
  );
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.warn('monetizationIntelligence: AI returned non-JSON', {
      snippet: String(content).slice(0, 160),
    });
    parsed = {};
  }
  const rawModels = Array.isArray(parsed.monetization_models) ? parsed.monetization_models : [];
  // Sanitize, drop invalid, dedupe by model_type, sort by deterministic fit.
  const seen = new Set();
  const models = [];
  for (const raw of rawModels) {
    const model = sanitizeModel(raw, context);
    if (!model || seen.has(model.model_type)) continue;
    seen.add(model.model_type);
    models.push(model);
  }
  models.sort((a, b) => b.fit_score - a.fit_score);
  return { models, tokensUsed };
}

module.exports = {
  MODEL_TYPES,
  buildUserPrompt,
  computeFitScore,
  sanitizeModel,
  generateMonetizationModels,
};
