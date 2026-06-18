// Run SAM.gov opportunities through the SAME Bonfire Opportunity scorer used for
// state/local bids, so federal solicitations get a `priority_score` directly
// comparable to Bonfire's (0-100, weights revenue .40 / automation .30 /
// repeatability .20 / ease .10).
//
// The only Bonfire input that normally comes from an LLM is the 7-way category
// (which drives the automation/repeatability/ease seeds). We derive that
// DETERMINISTICALLY from the solicitation's NAICS code instead — no LLM call,
// no cost, fully reproducible, consistent with "no LLM in the score path."
const {
  computeRuleSeeds,
  computePriorityScore,
  computeSignals,
} = require('../bonfire/bonfire.scoring');
const { PRODUCT_MAP } = require('../bonfire/bonfire.constants');

// NAICS (first 6 digits) -> one of the 7 Bonfire categories. Anything unmapped
// falls back to 'Consulting' (the scorer's own default), so a missing/odd code
// degrades gracefully rather than throwing.
const NAICS_CATEGORY = {
  541511: 'IT Services',        // Custom Computer Programming
  541512: 'IT Services',        // Computer Systems Design
  541513: 'IT Services',        // Computer Facilities Management
  541519: 'IT Services',        // Other Computer Related
  541330: 'IT Services',        // Engineering Services
  518210: 'Data & Analytics',   // Data Processing / Hosting
  541715: 'Data & Analytics',   // R&D Physical/Engineering/Life Sciences
  541611: 'Consulting',         // Administrative Management Consulting
  541618: 'Consulting',         // Other Management Consulting
  541990: 'Consulting',         // Other Professional/Scientific/Technical
  611420: 'Education',          // Computer Training
  611430: 'Education',          // Professional Training
};

function naicsToCategory(naicsCode) {
  const code = String(naicsCode || '').replace(/\D/g, '').slice(0, 6);
  return NAICS_CATEGORY[code] || 'Consulting';
}

// Score a SAM.gov opportunity row with the Bonfire scoring formula.
// Accepts a row-ish object: { value, sourceData|source_data, expiresAt|expires_at }.
function scoreSamWithBonfire(opp = {}) {
  const sd = opp.sourceData || opp.source_data || {};
  const category = naicsToCategory(sd.naicsCode);
  const valueUsd = Number(opp.value) || 0;
  const estimatedValueCents = Math.round(valueUsd * 100);

  const seeds = computeRuleSeeds({ estimatedValue: estimatedValueCents, aiCategory: category });
  // No LLM clamp step for SAM: use the category seeds directly (deterministic).
  const automation_potential = seeds.automation_seed;
  const repeatability = seeds.repeatability_seed;
  const ease_of_entry = seeds.ease_of_entry;
  const revenue_weight = seeds.revenue_weight;

  const priority_score = computePriorityScore({
    revenue_weight,
    automation_potential,
    repeatability,
    ease_of_entry,
  });

  const recommended_product = PRODUCT_MAP[category] || null;
  const signals = computeSignals({
    priority_score,
    estimated_value: estimatedValueCents,
    automation_potential,
    ease_of_entry,
    repeatability,
    recommended_product,
    close_date: opp.expiresAt || opp.expires_at || null,
  });

  return {
    priority_score,
    ai_category: category,
    revenue_weight,
    automation_potential,
    repeatability,
    ease_of_entry,
    recommended_product,
    signals,
    scorer: 'bonfire_on_samgov',
    scorer_version: 1,
  };
}

module.exports = { naicsToCategory, scoreSamWithBonfire, NAICS_CATEGORY };
