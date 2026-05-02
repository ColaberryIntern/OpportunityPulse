// Deterministic fit-scoring for the OIED system.
//
// calculateFitScore({ opportunity, profile }) returns
//   {
//     service_match,         // 0-25
//     revenue_weight,        // 0-20
//     automation_score,      // 0-15
//     repeatability_score,   // 0-15
//     ease_of_entry,         // 0-10
//     strategic_alignment,   // 0-15
//     fit_score,             // 0-100 (sum)
//     reasoning              // explainability blob
//   }
//
// The function is pure — same inputs always produce the same output. It
// reads from `opportunity.aiAnalysis` (Bonfire opps populate this with
// fit_score / automation_potential / repeatability / ease_of_entry from the
// existing enrichment) and from `opportunity` columns directly. When AI
// analysis is missing, it falls back to category-based heuristics.

const crypto = require('crypto');
const { OpportunityFitScore } = require('../models');

// ---------------------------------------------------------------------------
// Default business profile (CQuvator / Design House LLC).
// Override per-call to support multiple profiles later.
// ---------------------------------------------------------------------------
const DEFAULT_PROFILE = {
  // Services we offer — used to score service_match.
  services: [
    'ai-systems', 'data-analytics', 'staffing', 'compliance',
    'consulting', 'it-services', 'automation', 'data-science',
  ],
  // Categories we genuinely fit.
  fitCategories: ['IT Services', 'Data & Analytics', 'Staffing', 'Compliance', 'Consulting'],
  // Geographic preference (region label substring) — TX-based vendor.
  geoPreference: ['tx', 'texas', 'austin', 'dallas', 'houston'],
  // Strategic priorities for "alignment" scoring.
  strategicTags: ['ai', 'automation', 'data', 'platform', 'analytics'],
};

function profileHash(profile = DEFAULT_PROFILE) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      services: [...(profile.services || [])].sort(),
      fitCategories: [...(profile.fitCategories || [])].sort(),
      geoPreference: [...(profile.geoPreference || [])].sort(),
      strategicTags: [...(profile.strategicTags || [])].sort(),
    }))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Component scorers — each returns a 0..MAX integer.
// ---------------------------------------------------------------------------

// service_match (0-25): how well the opportunity's category/keywords overlap
// with our service portfolio. Driven by:
//   - exact match in fitCategories                +15
//   - keyword presence in title/description       up to +10
function scoreServiceMatch(opp, profile) {
  let s = 0;
  const cat = (opp.category || '').toLowerCase();
  for (const fc of profile.fitCategories || []) {
    if (cat.includes(fc.toLowerCase())) { s += 15; break; }
  }
  const blob = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();
  let kw = 0;
  for (const k of profile.services || []) {
    if (blob.includes(k.toLowerCase())) kw += 2;
  }
  s += Math.min(10, kw);
  return clamp(s, 0, 25);
}

// revenue_weight (0-20): brackets on the opportunity value.
//   < $50k        -> 4
//   $50k–$500k    -> 10
//   $500k–$5M     -> 16
//   $5M+          -> 20
function scoreRevenueWeight(opp) {
  const v = Number(opp.value) || 0;
  if (v <= 0) return 0;
  if (v < 50_000) return 4;
  if (v < 500_000) return 10;
  if (v < 5_000_000) return 16;
  return 20;
}

// automation_score (0-15): from the opportunity's existing aiAnalysis when
// present (Bonfire enrichment populates it 0-100), else mid-tier default.
function scoreAutomation(opp) {
  const auto = readAiNumber(opp, 'automation_potential');
  if (auto == null) return 7; // mid default — unknown
  return clamp(Math.round((auto / 100) * 15), 0, 15);
}

// repeatability_score (0-15): same source, same rescaling.
function scoreRepeatability(opp) {
  const r = readAiNumber(opp, 'repeatability');
  if (r == null) return 7;
  return clamp(Math.round((r / 100) * 15), 0, 15);
}

// ease_of_entry (0-10): same source, same rescaling.
function scoreEaseOfEntry(opp) {
  const e = readAiNumber(opp, 'ease_of_entry');
  if (e == null) return 5;
  return clamp(Math.round((e / 100) * 10), 0, 10);
}

// strategic_alignment (0-15): combines:
//   - geographic match  (+5 max)
//   - strategic tag overlap in title/description  (up to +6)
//   - signals (HIGH_AUTOMATION/PRODUCTIZABLE etc) +1 each, cap +4
function scoreStrategicAlignment(opp, profile) {
  let s = 0;
  const loc = String(opp.location || '').toLowerCase();
  for (const g of profile.geoPreference || []) {
    if (loc.includes(g.toLowerCase())) { s += 5; break; }
  }
  const blob = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();
  let tagHits = 0;
  for (const t of profile.strategicTags || []) {
    if (blob.includes(t.toLowerCase())) tagHits += 1;
  }
  s += Math.min(6, tagHits * 2);
  const signals = readAiArray(opp, 'signals');
  if (Array.isArray(signals)) s += Math.min(4, signals.length);
  return clamp(s, 0, 15);
}

// ---------------------------------------------------------------------------
// Public: deterministic score calculation.
// ---------------------------------------------------------------------------
function calculateFitScore({ opportunity, profile = DEFAULT_PROFILE }) {
  if (!opportunity) throw new Error('calculateFitScore: opportunity is required');
  const profileToUse = profile || DEFAULT_PROFILE;

  const service_match       = scoreServiceMatch(opportunity, profileToUse);
  const revenue_weight      = scoreRevenueWeight(opportunity);
  const automation_score    = scoreAutomation(opportunity);
  const repeatability_score = scoreRepeatability(opportunity);
  const ease_of_entry       = scoreEaseOfEntry(opportunity);
  const strategic_alignment = scoreStrategicAlignment(opportunity, profileToUse);
  const fit_score = service_match + revenue_weight + automation_score
                  + repeatability_score + ease_of_entry + strategic_alignment;

  return {
    service_match,
    revenue_weight,
    automation_score,
    repeatability_score,
    ease_of_entry,
    strategic_alignment,
    fit_score: clamp(fit_score, 0, 100),
    reasoning: {
      profile_hash: profileHash(profileToUse),
      value_usd: Number(opportunity.value) || 0,
      category: opportunity.category || null,
      ai_analysis_present: !!opportunity.aiAnalysis,
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence: cache the score in opportunity_fit_scores. Idempotent on
// (opportunity_id, profile_hash). Cheap to call; the math is deterministic.
// ---------------------------------------------------------------------------
async function getOrCreateFitScore({ opportunity, profile = DEFAULT_PROFILE, force = false }) {
  if (!OpportunityFitScore) return calculateFitScore({ opportunity, profile });

  const hash = profileHash(profile);
  if (!force) {
    const cached = await OpportunityFitScore.findOne({
      where: { opportunityId: opportunity.id, profileHash: hash },
    });
    if (cached) return cached.toJSON();
  }
  const computed = calculateFitScore({ opportunity, profile });
  const [row] = await OpportunityFitScore.upsert({
    opportunityId: opportunity.id,
    profileHash: hash,
    serviceMatch: computed.service_match,
    revenueWeight: computed.revenue_weight,
    automationScore: computed.automation_score,
    repeatabilityScore: computed.repeatability_score,
    easeOfEntry: computed.ease_of_entry,
    strategicAlignment: computed.strategic_alignment,
    fitScore: computed.fit_score,
    reasoning: computed.reasoning,
  });
  return row ? row.toJSON() : computed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(v, lo, hi) {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

function readAiNumber(opp, key) {
  const ai = opp.aiAnalysis || {};
  const v = ai[key];
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

function readAiArray(opp, key) {
  const ai = opp.aiAnalysis || {};
  const v = ai[key];
  return Array.isArray(v) ? v : null;
}

module.exports = {
  calculateFitScore,
  getOrCreateFitScore,
  profileHash,
  DEFAULT_PROFILE,
  // exported for unit testing the components
  scoreServiceMatch,
  scoreRevenueWeight,
  scoreAutomation,
  scoreRepeatability,
  scoreEaseOfEntry,
  scoreStrategicAlignment,
};
