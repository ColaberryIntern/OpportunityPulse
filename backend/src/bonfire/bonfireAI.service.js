const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');
const {
  CATEGORIES,
  PRODUCT_MAP,
  ENRICHMENT_VERSION,
  RAW_TEXT_MAX_PROMPT,
  SIGNAL_CODES,
} = require('./bonfire.constants');
const {
  clamp,
  computeRuleSeeds,
  bindToSeed,
  computePriorityScore,
  computeSignals,
  normalizeCategory,
} = require('./bonfire.scoring');
const { computeEnrichmentHash } = require('./bonfire.util');

function truncateForPrompt(text) {
  if (!text) return '';
  const s = String(text);
  return s.length > RAW_TEXT_MAX_PROMPT ? s.slice(0, RAW_TEXT_MAX_PROMPT) : s;
}

function buildEnrichSystemPrompt() {
  return [
    'You classify procurement opportunities for productization.',
    'Return JSON ONLY. Do not echo the source material.',
    'Fields you must return:',
    '  ai_category: one of ' + CATEGORIES.map((c) => `"${c}"`).join(', '),
    '  fit_score: integer 0-100 (how well this matches Colaberry capabilities)',
    '  automation_potential: integer 0-100 (how amenable to AI/automation)',
    '  repeatability: integer 0-100 (how reusable the solution is across clients)',
    '  estimated_value_usd: integer USD whole-dollar value. Estimate the contract',
    '    size from the title, agency, and category if no explicit number is given.',
    '    Use procurement norms: housing/construction RFPs typically $100k–$5M;',
    '    consulting engagements $50k–$500k; staffing contracts $200k–$2M;',
    '    enterprise IT $500k–$10M. Return 0 only if you truly cannot estimate.',
    '  recommended_product: short product name or null',
    '  signals: subset of ["HIGH_ROI","HIGH_AUTOMATION","QUICK_WIN","PRODUCTIZABLE"]',
    '  strategy_hint: one concise sentence',
    '  tags: array of up to 5 short topic tags (strings)',
    'Canonical product mapping: ' + JSON.stringify(PRODUCT_MAP),
  ].join('\n');
}

function buildEnrichUserPrompt(op) {
  return [
    'Title: ' + (op.title || ''),
    'Agency: ' + (op.agency || ''),
    'Category (raw): ' + (op.categoryRaw || ''),
    'Description: ' + truncateForPrompt(op.description),
    '---',
    'Source excerpt (truncated): ' + truncateForPrompt(op.rawText),
  ].join('\n');
}

function parseAiJson(content) {
  try {
    const obj = JSON.parse(content);
    if (!obj || typeof obj !== 'object') throw new Error('not an object');
    return obj;
  } catch (e) {
    throw new Error('AI returned invalid JSON: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// enrichOpportunity: rule-seed → AI refinement (bounded) → deterministic compute.
// Re-running with unchanged raw_text is a no-op (idempotent via enrichment_hash).
// ---------------------------------------------------------------------------
async function enrichOpportunity(bonfireOp, { force = false } = {}) {
  const incomingHash = computeEnrichmentHash(bonfireOp.rawText, ENRICHMENT_VERSION);
  if (!force && bonfireOp.enrichmentHash === incomingHash && bonfireOp.enrichedAt) {
    logger.info('Bonfire enrich skipped (hash unchanged)', { id: bonfireOp.id });
    return { updated: false, reason: 'hash_match' };
  }

  const seeds = computeRuleSeeds({
    estimatedValue: bonfireOp.estimatedValue,
    // Seed before AI returns a category — use raw category if we have one.
    aiCategory: normalizeCategory(bonfireOp.categoryRaw),
  });

  const aiClient = getAIClient();
  const { content } = await aiClient.chat(
    buildEnrichSystemPrompt(),
    buildEnrichUserPrompt(bonfireOp),
    { temperature: 0.2, maxTokens: 800 }
  );
  const ai = parseAiJson(content);

  // AI-resolved category drives the final heuristics (re-seed if it changed the category).
  const aiCategory = normalizeCategory(ai.ai_category);

  // If the source didn't have an explicit estimated_value, accept the AI's
  // best-guess (returned as whole USD; convert to cents). Never overwrite a
  // value we already had — manual uploads / future detail-page scrapes win.
  let effectiveEstimatedValue = bonfireOp.estimatedValue;
  if ((effectiveEstimatedValue == null || Number(effectiveEstimatedValue) === 0) &&
      Number(ai.estimated_value_usd) > 0) {
    effectiveEstimatedValue = Math.round(Number(ai.estimated_value_usd) * 100);
  }

  const finalSeeds = computeRuleSeeds({
    estimatedValue: effectiveEstimatedValue,
    aiCategory,
  });

  // Rule-owned fields: never overwritten by AI.
  const revenue_weight = finalSeeds.revenue_weight;
  const ease_of_entry = finalSeeds.ease_of_entry;

  // AI-owned but clamped to seed ± delta (see bonfire.scoring.bindToSeed).
  const automation_potential = bindToSeed(ai.automation_potential, finalSeeds.automation_seed);
  const repeatability = bindToSeed(ai.repeatability, finalSeeds.repeatability_seed);
  const fit_score = clamp(ai.fit_score, 0, 100);

  // Recommended product: prefer canonical mapping; allow AI suggestion as fallback.
  const recommended_product =
    PRODUCT_MAP[aiCategory] ||
    (typeof ai.recommended_product === 'string' && ai.recommended_product.trim()
      ? ai.recommended_product.trim().slice(0, 100)
      : null);

  const priority_score = computePriorityScore({
    revenue_weight,
    automation_potential,
    repeatability,
    ease_of_entry,
  });

  // Server-derived signals override anything the AI claims for consistency.
  const signals = computeSignals({
    priority_score,
    estimated_value: Number(effectiveEstimatedValue) || 0,
    automation_potential,
    ease_of_entry,
    repeatability,
    recommended_product,
    close_date: bonfireOp.closeDate,
  });

  const tags = Array.isArray(ai.tags)
    ? ai.tags.filter((t) => typeof t === 'string').map((t) => t.trim().slice(0, 100)).filter(Boolean).slice(0, 5)
    : [];

  const fields = {
    aiCategory,
    fitScore: fit_score,
    priorityScore: priority_score,
    automationPotential: automation_potential,
    revenueWeight: revenue_weight,
    repeatability,
    easeOfEntry: ease_of_entry,
    recommendedProduct: recommended_product,
    signals,
    enrichedAt: new Date(),
    enrichmentVersion: ENRICHMENT_VERSION,
    enrichmentHash: incomingHash,
  };
  // Persist the AI-estimated value only if we filled in a previously-empty slot.
  if ((bonfireOp.estimatedValue == null || Number(bonfireOp.estimatedValue) === 0) &&
      effectiveEstimatedValue && effectiveEstimatedValue > 0) {
    fields.estimatedValue = effectiveEstimatedValue;
  }

  return { updated: true, fields, tags };
}

// ---------------------------------------------------------------------------
// generateStrategy: deeper analysis that returns a productization pitch.
// Admin-only; persisted in bonfire_opportunities.strategy.
// ---------------------------------------------------------------------------
function buildStrategySystemPrompt() {
  return [
    'You produce a short productization strategy for a procurement opportunity.',
    'Return JSON ONLY. Do not echo the source material.',
    'Schema:',
    '  suggested_ai_system: short sentence describing the AI system to build',
    '  staffing_model: short phrase (e.g., "1 AI engineer + 1 operator")',
    '  pricing_range: { low: integer USD, high: integer USD, model: "fixed"|"subscription"|"time_and_materials" }',
    '  proposal_outline: array of 3-6 short bullet strings',
    '  risks: array of up to 3 short strings',
  ].join('\n');
}

function buildStrategyUserPrompt(op) {
  return [
    'Title: ' + (op.title || ''),
    'Agency: ' + (op.agency || ''),
    'AI Category: ' + (op.aiCategory || ''),
    'Recommended Product: ' + (op.recommendedProduct || 'none yet'),
    'Priority Score: ' + (op.priorityScore ?? 'unscored'),
    'Automation Potential: ' + (op.automationPotential ?? 'unknown'),
    'Estimated Value (cents): ' + (op.estimatedValue ?? 'unknown'),
    'Description: ' + truncateForPrompt(op.description),
    'Source excerpt: ' + truncateForPrompt(op.rawText),
  ].join('\n');
}

async function generateStrategy(bonfireOp) {
  const aiClient = getAIClient();
  const { content } = await aiClient.chat(
    buildStrategySystemPrompt(),
    buildStrategyUserPrompt(bonfireOp),
    { temperature: 0.3, maxTokens: 700 }
  );
  const strategy = parseAiJson(content);

  // Defensive shape check — don't persist garbage.
  const shaped = {
    suggested_ai_system: typeof strategy.suggested_ai_system === 'string' ? strategy.suggested_ai_system.slice(0, 500) : null,
    staffing_model: typeof strategy.staffing_model === 'string' ? strategy.staffing_model.slice(0, 200) : null,
    pricing_range: strategy.pricing_range && typeof strategy.pricing_range === 'object' ? {
      low: Number(strategy.pricing_range.low) || null,
      high: Number(strategy.pricing_range.high) || null,
      model: typeof strategy.pricing_range.model === 'string' ? strategy.pricing_range.model : null,
    } : null,
    proposal_outline: Array.isArray(strategy.proposal_outline)
      ? strategy.proposal_outline.filter((s) => typeof s === 'string').slice(0, 6)
      : [],
    risks: Array.isArray(strategy.risks)
      ? strategy.risks.filter((s) => typeof s === 'string').slice(0, 3)
      : [],
    generated_at: new Date().toISOString(),
  };
  return shaped;
}

module.exports = { enrichOpportunity, generateStrategy };
