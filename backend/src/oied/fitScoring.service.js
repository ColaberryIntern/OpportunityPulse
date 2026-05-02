// OIED v2 fit-scoring — profile-driven, deterministic, AI-free.
//
// calculateFitScore({ opportunity, userProfile }) returns
//   {
//     service_match,         // 0-25  (profile.services × opp.tags / text)
//     revenue_weight,        // 0-20  (value brackets, gated by min_deal_size)
//     automation_score,      // 0-15  (from existing AI analysis)
//     repeatability_score,   // 0-15  (from existing AI analysis)
//     ease_of_entry,         // 0-10  (from existing AI analysis)
//     strategic_alignment,   // 0-15  (industry match + past-wins similarity
//                            //         + geo from profile.preferences)
//     fit_score,             // 0-100 (sum)
//     reasoning              // explainability blob
//   }
//
// Pure function — same inputs always produce the same output. Profile is
// REQUIRED. Callers that don't have one should pass profile.getOrDefault()
// which returns the global default (matches prior DEFAULT_PROFILE behavior).

const crypto = require('crypto');
const { OpportunityFitScore } = require('../models');

// ---------------------------------------------------------------------------
// Profile hash — used as a cache key. Two profiles with the same content
// produce the same hash so cached scores are reused.
// ---------------------------------------------------------------------------
function profileHash(profile) {
  if (!profile) throw new Error('profileHash: profile required');
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      services:      [...(profile.services || [])].sort(),
      industries:    [...(profile.industries || [])].sort(),
      minDealSize:   Number(profile.minDealSize) || 0,
      tools:         [...(profile.tools || [])].sort(),
      pastWins:      [...(profile.pastWins || [])].map(String).sort(),
      riskTolerance: profile.riskTolerance || 'medium',
      preferences:   profile.preferences || {},
    }))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Component scorers
// ---------------------------------------------------------------------------

// service_match (0-25):
//   - profile.services overlap with opp.tags  (each tag hit +5, cap 15)
//   - profile.services keyword presence in title/description (each kw +2, cap 10)
function scoreServiceMatch(opp, profile) {
  const services = (profile.services || []).map((s) => String(s).toLowerCase());
  if (!services.length) return 0;
  let s = 0;

  const tags = (opp.tags || []).map((t) => String(t).toLowerCase());
  let tagHits = 0;
  for (const svc of services) {
    if (tags.some((t) => t.includes(svc) || svc.includes(t))) tagHits += 1;
  }
  s += Math.min(15, tagHits * 5);

  const blob = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();
  let kw = 0;
  for (const svc of services) if (blob.includes(svc)) kw += 2;
  s += Math.min(10, kw);
  return clamp(s, 0, 25);
}

// revenue_weight (0-20):
//   - hard zero if value < min_deal_size  (deal-size gate)
//   - else bracketed:
//       value < $50k          ->  4
//       $50k–$500k            -> 10
//       $500k–$5M             -> 16
//       >= $5M                -> 20
function scoreRevenueWeight(opp, profile) {
  const v = Number(opp.value) || 0;
  const minDeal = Number(profile.minDealSize) || 0;
  if (v <= 0) return 0;
  if (v < minDeal) return 0;
  if (v < 50_000)  return 4;
  if (v < 500_000) return 10;
  if (v < 5_000_000) return 16;
  return 20;
}

// AI-derived components — read from opp.aiAnalysis 0-100 and rescale.
function scoreAutomation(opp) {
  const v = readAi(opp, 'automation_potential');
  return v == null ? 7 : clamp(Math.round((v / 100) * 15), 0, 15);
}
function scoreRepeatability(opp) {
  const v = readAi(opp, 'repeatability');
  return v == null ? 7 : clamp(Math.round((v / 100) * 15), 0, 15);
}
function scoreEaseOfEntry(opp) {
  const v = readAi(opp, 'ease_of_entry');
  return v == null ? 5 : clamp(Math.round((v / 100) * 10), 0, 10);
}

// strategic_alignment (0-15) — refit:
//   - industry match (opp.category in profile.industries)              +5
//   - past-wins similarity: keyword overlap with title/description     up to +5
//   - geo bonus from preferences.geoPreference (legacy)                +3
//   - signals (HIGH_AUTOMATION, PRODUCTIZABLE, etc.) presence          up to +2
function scoreStrategicAlignment(opp, profile) {
  let s = 0;
  const industries = (profile.industries || []).map((i) => String(i).toLowerCase());
  const cat = String(opp.category || '').toLowerCase();
  if (industries.length && industries.some((i) => cat === i || cat.includes(i))) s += 5;

  const pastWins = (profile.pastWins || []).map(extractWinKeywords).flat();
  if (pastWins.length) {
    const blob = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();
    let pw = 0;
    for (const kw of pastWins) if (kw && blob.includes(kw)) pw += 1;
    s += Math.min(5, pw);
  }

  const prefs = profile.preferences || {};
  const geo = prefs.geoPreference || [];
  if (geo.length) {
    const loc = String(opp.location || '').toLowerCase();
    if (geo.some((g) => loc.includes(String(g).toLowerCase()))) s += 3;
  }

  const signals = readAiArray(opp, 'signals');
  if (Array.isArray(signals)) s += Math.min(2, signals.length);
  return clamp(s, 0, 15);
}

// ---------------------------------------------------------------------------
// Public: deterministic score. profile is REQUIRED.
// ---------------------------------------------------------------------------
function calculateFitScore({ opportunity, userProfile }) {
  if (!opportunity) throw new Error('calculateFitScore: opportunity required');
  if (!userProfile) throw new Error('calculateFitScore: userProfile required (use profile.getOrDefault() if no row exists)');

  const service_match       = scoreServiceMatch(opportunity, userProfile);
  const revenue_weight      = scoreRevenueWeight(opportunity, userProfile);
  const automation_score    = scoreAutomation(opportunity);
  const repeatability_score = scoreRepeatability(opportunity);
  const ease_of_entry       = scoreEaseOfEntry(opportunity);
  const strategic_alignment = scoreStrategicAlignment(opportunity, userProfile);
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
      profile_hash: profileHash(userProfile),
      profile_is_default: !!userProfile._isDefault,
      value_usd: Number(opportunity.value) || 0,
      min_deal_size: Number(userProfile.minDealSize) || 0,
      category: opportunity.category || null,
      ai_analysis_present: !!opportunity.aiAnalysis,
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence (cache). Idempotent on (opportunity_id, profile_hash).
// ---------------------------------------------------------------------------
async function getOrCreateFitScore({ opportunity, userProfile, force = false }) {
  if (!OpportunityFitScore) return calculateFitScore({ opportunity, userProfile });

  const hash = profileHash(userProfile);
  if (!force) {
    const cached = await OpportunityFitScore.findOne({
      where: { opportunityId: opportunity.id, profileHash: hash },
    });
    if (cached) return cached.toJSON();
  }
  const computed = calculateFitScore({ opportunity, userProfile });
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
function readAi(opp, key) {
  const ai = opp.aiAnalysis || {};
  const v = ai[key];
  return Number.isFinite(Number(v)) ? Number(v) : null;
}
function readAiArray(opp, key) {
  const ai = opp.aiAnalysis || {};
  const v = ai[key];
  return Array.isArray(v) ? v : null;
}
function extractWinKeywords(win) {
  // past_wins entries can be strings ("Compliance audit for City of X") or
  // objects ({ title, tags }). Pull lowercase keyword tokens out of either.
  if (!win) return [];
  if (typeof win === 'string') {
    return win.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
  }
  const tags = Array.isArray(win.tags) ? win.tags.map((t) => String(t).toLowerCase()) : [];
  const title = win.title ? String(win.title).toLowerCase().split(/\s+/).filter((t) => t.length >= 4) : [];
  return [...tags, ...title];
}

module.exports = {
  calculateFitScore,
  getOrCreateFitScore,
  profileHash,
  // exported for unit tests
  scoreServiceMatch,
  scoreRevenueWeight,
  scoreAutomation,
  scoreRepeatability,
  scoreEaseOfEntry,
  scoreStrategicAlignment,
};
