// Adaptive Effort Estimator (v6).
//
// Pure deterministic heuristics; the v3 baseline plus three new
// signals layered on top:
//   - RFP length (description + raw_text chars) → tiered hours
//   - Required-section detection (SOW, pricing, compliance, past_performance)
//   - Historical average proposal_hours from past approved outputs
//     in the same category (blended 50/50 with the heuristic when
//     ≥2 samples). Caller fetches via getHistoricalAvgHours and
//     passes it in via opts so the core stays sync + offline.
//
// Returns proposal hours, build days, effort_score, plus the
// detected `required_sections` and `historical_avg_hours` so the
// UI can show what drove the number.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { Opportunity, OpportunityOutput } = require('../models');

const COMPLEXITY_HINTS = /(compliance|certification|cybersecurity|hipaa|fedramp|secret|clearance|audit)/i;

const BUILD_DAYS_BY_CATEGORY = {
  staffing: 7,
  'data analytics': 21,
  'ai-systems': 21,
  'it services': 30,
  software: 30,
  consulting: 21,
  automation: 21,
  compliance: 45,
  audit: 45,
  construction: 60,
  facilities: 60,
};
const BUILD_DAYS_DEFAULT = 21;

const PROPOSAL_HOURS_FLOOR = 2;
const PROPOSAL_HOURS_CAP   = 40; // raised from v3's 16 — long RFPs need it

// ---- Section detection -------------------------------------------------
// Each entry: regex + hours added when matched. Order matters only for
// the `required_sections` array (the hour totals are commutative).
const SECTION_RULES = [
  { name: 'sow',              hours: 2, re: /\b(sow|statement of work|scope of work)\b/i },
  { name: 'pricing',          hours: 1, re: /\b(price|pricing|cost proposal|fee schedule|budget)\b/i },
  { name: 'compliance',       hours: 2, re: /\b(compliance|certification|cybersecurity|hipaa|fedramp|secret|clearance)\b/i },
  { name: 'past_performance', hours: 1, re: /\b(past performance|references|case studies)\b/i },
];

// ---- Length tier signal ------------------------------------------------
// totalChars is description length + raw_text length; raw_text is
// populated by Bonfire ingestion, may be empty for legacy rows.
function lengthHours(totalChars) {
  if (totalChars > 8000) return 4;
  if (totalChars > 4000) return 3;
  if (totalChars > 2000) return 2;
  if (totalChars > 800)  return 1;
  return 0;
}

function detectSections(text) {
  const found = [];
  let added = 0;
  for (const rule of SECTION_RULES) {
    if (rule.re.test(text)) { found.push(rule.name); added += rule.hours; }
  }
  return { sections: found, hours: added };
}

// Pure: estimate proposal hours from the opp + optional historical
// average. When historicalAvgHours is provided (>0), blend 50/50 with
// the heuristic — keeps us close to real data without abandoning the
// signals.
function estimateProposalHours(opp, { historicalAvgHours = null } = {}) {
  const desc    = (opp && opp.description) || '';
  const rawText = (opp && opp.sourceData && opp.sourceData.raw_text) || '';
  const text    = `${(opp && opp.title) || ''} ${desc} ${rawText}`.toLowerCase();
  const totalChars = desc.length + rawText.length;

  let hours = 4; // base
  hours += lengthHours(totalChars);

  const { hours: sectionHours } = detectSections(text);
  hours += sectionHours;

  // Pre-v6 fallback: still penalize when we have no recommended_product.
  if (!opp || !opp.aiAnalysis || !opp.aiAnalysis.recommended_product) hours += 1;

  // Blend with historical when present.
  if (Number(historicalAvgHours) > 0) {
    hours = Math.round((hours + Number(historicalAvgHours)) / 2);
  }

  return Math.min(PROPOSAL_HOURS_CAP, Math.max(PROPOSAL_HOURS_FLOOR, hours));
}

function estimateBuildDays(opp) {
  const ai = (opp && opp.aiAnalysis) || {};
  const cat = String(ai.ai_category || (opp && opp.category) || '').trim().toLowerCase();
  let days = BUILD_DAYS_BY_CATEGORY[cat] != null
    ? BUILD_DAYS_BY_CATEGORY[cat]
    : BUILD_DAYS_DEFAULT;
  const auto = Number(ai.automation_potential || 0);
  if (auto >= 80 && days >= 21) days -= 10;
  return Math.max(3, days);
}

function computeEffortScore(proposalHours, buildDays) {
  return Math.min(100, Math.round((proposalHours * 4) + (buildDays * 1.2)));
}

// Pure synchronous estimator. Backwards-compatible with v3 callers:
// pass an opportunity, get the same shape (now with a couple extra
// fields). Optional opts.historicalAvgHours / opts.complexityHint to
// drive the adaptive layer.
function estimateEffort(opportunity, opts = {}) {
  if (!opportunity) {
    return {
      proposal_hours: 4,
      build_days: BUILD_DAYS_DEFAULT,
      effort_score: 41,
      required_sections: [],
      historical_avg_hours: null,
    };
  }
  const desc = opportunity.description || '';
  const rawText = (opportunity.sourceData && opportunity.sourceData.raw_text) || '';
  const text = `${opportunity.title || ''} ${desc} ${rawText}`.toLowerCase();
  const { sections } = detectSections(text);

  const proposalHours = estimateProposalHours(opportunity, opts);
  const buildDays     = estimateBuildDays(opportunity);
  const effortScore   = computeEffortScore(proposalHours, buildDays);
  return {
    proposal_hours: proposalHours,
    build_days: buildDays,
    effort_score: effortScore,
    required_sections: sections,
    historical_avg_hours: opts.historicalAvgHours != null
      ? Number(opts.historicalAvgHours) || null
      : null,
  };
}

// I/O helper. Avg metadata.proposal_hours across last 5 approved outputs
// whose parent opportunity has the same category. Returns null when
// fewer than 2 samples (avoids over-fitting to one historical row).
async function getHistoricalAvgHours({ category, organizationId } = {}) {
  if (!category) return null;
  try {
    // Pull last 30 approved outputs and filter on the joined opp's category.
    const outs = await OpportunityOutput.findAll({
      where: { status: 'approved' },
      order: [['reviewedAt', 'DESC']],
      limit: 30,
    });
    if (outs.length === 0) return null;

    const oppIds = [...new Set(outs.map((o) => o.opportunityId))];
    const opps = await Opportunity.findAll({
      where: { id: oppIds },
      attributes: ['id', 'category'],
    });
    const oppMap = new Map();
    for (const o of opps) oppMap.set(o.id, o.toJSON ? o.toJSON() : o);

    const targetCat = String(category).toLowerCase().trim();
    const samples = [];
    for (const out of outs) {
      const opp = oppMap.get(out.opportunityId);
      if (!opp) continue;
      if (String(opp.category || '').toLowerCase().trim() !== targetCat) continue;
      const meta = out.metadata || {};
      const hours = Number(meta.proposal_hours);
      if (Number.isFinite(hours) && hours > 0) samples.push(hours);
      if (samples.length >= 5) break;
    }
    // organizationId is accepted for forward-compat; current schema doesn't
    // partition outputs by org. Used here to stay consistent with the rest
    // of the v4+ service signatures.
    if (organizationId == null) { /* no-op */ }

    if (samples.length < 2) return null;
    const avg = samples.reduce((s, n) => s + n, 0) / samples.length;
    return Math.round(avg * 10) / 10;
  } catch (e) {
    logger.warn('effortEstimator.getHistoricalAvgHours failed', { error: e.message });
    return null;
  }
}

// Convenience: fetch historical avg + run estimator. Async wrapper for
// callers that want the full adaptive treatment.
async function enrichEffortWithHistory(opportunity, organizationId) {
  if (!opportunity) return estimateEffort(opportunity);
  const category = (opportunity.aiAnalysis && opportunity.aiAnalysis.ai_category)
    || opportunity.category;
  const historicalAvgHours = await getHistoricalAvgHours({ category, organizationId });
  return estimateEffort(opportunity, { historicalAvgHours });
}

module.exports = {
  estimateEffort,
  estimateProposalHours,
  estimateBuildDays,
  computeEffortScore,
  detectSections,
  lengthHours,
  getHistoricalAvgHours,
  enrichEffortWithHistory,
  SECTION_RULES,
  BUILD_DAYS_BY_CATEGORY,
  BUILD_DAYS_DEFAULT,
  PROPOSAL_HOURS_CAP,
};

// Suppress unused — sequelize Op is brought in for future filter use.
// eslint-disable-next-line no-unused-expressions
Op;
