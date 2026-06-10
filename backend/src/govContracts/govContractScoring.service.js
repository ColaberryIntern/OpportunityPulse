// Gov Contract fit scoring — deterministic, mirrors bonfire.scoring.js shape.
//
// Why: the digest's "Top Gov Contracts" section was pulling from ai_score,
// which was either NULL (real SAM.gov solicitations were never scored) or
// inflated by suspicious seed data (test rows with id<100 + ai_score 85-95
// + suspiciously perfect "AI in [domain]" titles). Real biddable SAM.gov
// solicitations were buried below noise. usa_spending rows are awarded
// contracts (not bid opportunities) and shouldn't be in this section at all.
//
// This service produces a 0-100 fit_score against Colaberry's actual
// strength (building AI Systems) from FIVE sub-scorers, all pure functions
// over fields we already have:
//
//   1. AI alignment (40%): keyword density in title+description against
//      a curated AI vocabulary
//   2. NAICS match  (15%): boost for codes Colaberry can prime/sub on
//   3. Agency maturity (15%): agencies with a track record of AI buys
//   4. Set-aside fit (10%): small biz / 8(a) / WOSB favor Colaberry's profile
//   5. Value sweet spot (20%): not too tiny (<$50k) or huge (>$50M) so
//      Colaberry has a realistic shot
//
// All deterministic — zero LLM cost. Each input field is one of: title,
// description, source_data.naicsCode, source_data.typeOfSetAside,
// source_data.fullParentPathName, value.

// ---------- 1. AI Alignment ----------
// Hand-curated vocabulary. Splits into HIGH/MEDIUM/LOW signal tiers so a
// "machine learning analytics platform" beats a "machine room HVAC".
const AI_VOCAB = {
  // High-signal phrases — direct AI/ML systems vocabulary.
  high: [
    'artificial intelligence', ' ai ', 'a.i.', 'machine learning', ' ml ',
    'deep learning', 'neural network', 'computer vision', 'natural language',
    ' nlp ', 'generative ai', 'large language model', ' llm ',
    'foundation model', 'predictive analytics',
    'ai/ml', 'ai system', 'algorithm development', 'data science platform',
    'autonomous system', 'cognitive computing', 'rpa', 'robotic process',
  ],
  // Medium-signal — adjacent / supporting tech where Colaberry can play.
  medium: [
    'data analytics platform', 'data analytics', 'data platform', 'analytics platform', 'data pipeline',
    'data warehouse', 'data lake', 'business intelligence', ' bi ',
    'automation', 'modernization', 'digital transformation',
    'cloud migration', 'cloud platform', 'sensor fusion', 'analytics',
    'data integration', 'data governance', 'workflow automation',
    'decision support', 'forecasting', 'optimization model',
    'simulation', 'modeling and simulation',
  ],
  // Low-signal — IT services / staff aug where Colaberry technically
  // qualifies but it's not the strength. Small positive only.
  low: [
    'software engineering', 'systems integration', 'it services',
    'cybersecurity', 'devops', 'application development',
    'cloud services', 'database',
  ],
};

// Greedy match: process tiers high→low and within each tier, longest phrase
// first. After a phrase matches, mask the consumed character range so a
// shorter phrase that's a strict subset of the match doesn't double-count.
// Example: "Data Analytics Platform" should score for HIGH "data analytics
// platform" once (22), not also MEDIUM "data analytics" + "analytics
// platform" + "analytics" (27 extra). Same haystack region can't fire two
// vocab hits.
function scoreAiAlignment(title, description) {
  const hay = `${title || ''}. ${description || ''}`.toLowerCase();
  if (!hay.trim()) return 0;
  // Work on a mutable buffer; replace matched regions with a non-word char
  // ('\x00') so subsequent shorter substring checks can't span them.
  const buf = hay.split('');
  let score = 0;
  const consumeAndScore = (terms, weight) => {
    // Longest first within the tier — so "data analytics platform" (high)
    // consumes the chars before "analytics platform" (medium) tries.
    const sorted = [...terms].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
      let idx = -1;
      // Match every occurrence in the haystack, not just the first.
      while ((idx = buf.join('').indexOf(term, idx + 1)) !== -1) {
        score += weight;
        for (let i = idx; i < idx + term.length; i++) buf[i] = '\x00';
      }
    }
  };
  consumeAndScore(AI_VOCAB.high,   22);
  consumeAndScore(AI_VOCAB.medium,  9);
  consumeAndScore(AI_VOCAB.low,     3);
  return Math.min(100, score);
}

// ---------- 2. NAICS match ----------
// Codes Colaberry can prime or sub on; weights reflect "best to worst fit".
// Source: NAICS 2022 + small-biz size standards.
const NAICS_FIT = {
  '541511': 100, // Custom Computer Programming Services
  '541512': 95,  // Computer Systems Design Services
  '541513': 90,  // Computer Facilities Management
  '541519': 85,  // Other Computer Related Services
  '541715': 80,  // R&D in Physical/Engineering/Life Sciences (a lot of AI BAAs)
  '518210': 80,  // Computing Infrastructure / Data Processing
  '541330': 70,  // Engineering Services
  '541618': 65,  // Other Management Consulting
  '611420': 60,  // Computer Training (Colaberry has training arm)
  '611430': 55,  // Professional Training
  '541611': 50,  // Administrative Management Consulting
  '541990': 35,  // Other Professional, Scientific & Tech Services
};

function scoreNaics(naics) {
  if (!naics) return 0;
  const code = String(naics).trim().slice(0, 6);
  return NAICS_FIT[code] || 0;
}

// ---------- 3. Agency maturity ----------
// Agencies with a documented AI/ML procurement footprint score higher.
// The check is substring-based against fullParentPathName because SAM.gov
// dot-delimits the org tree (e.g. "DEPT OF DEFENSE.DEPT OF THE AIR FORCE...").
const AGENCY_MATURITY = [
  { match: ['darpa', 'defense advanced research'], score: 100 },
  { match: ['air force research laboratory', 'afrl'], score: 95 },
  { match: ['army research laboratory', 'arl'], score: 95 },
  { match: ['space development agency', 'space force'], score: 90 },
  { match: ['naval research', 'office of naval research'], score: 90 },
  { match: ['national aeronautics and space', 'nasa'], score: 90 },
  { match: ['national geospatial-intelligence', 'nga'], score: 90 },
  { match: ['department of energy', 'doe'], score: 85 },
  { match: ['national institutes of health', 'nih'], score: 85 },
  { match: ['department of veterans affairs', 'veterans'], score: 80 },
  { match: ['national science foundation', 'nsf'], score: 80 },
  { match: ['national institute of standards', 'nist'], score: 80 },
  { match: ['department of homeland security', 'dhs'], score: 75 },
  { match: ['department of defense', 'dept of defense', 'dod'], score: 70 },
  { match: ['general services administration', 'gsa'], score: 65 },
  { match: ['department of transportation', 'dot', 'nhtsa'], score: 60 },
  { match: ['department of health and human', 'hhs', 'cdc'], score: 60 },
  { match: ['department of treasury'], score: 55 },
  { match: ['department of state'], score: 55 },
  { match: ['department of justice', 'doj', 'fbi'], score: 60 },
];

function scoreAgencyMaturity(agencyPath) {
  if (!agencyPath) return 30; // unknown agency — neutral floor
  const hay = String(agencyPath).toLowerCase();
  for (const rule of AGENCY_MATURITY) {
    if (rule.match.some((m) => hay.includes(m))) return rule.score;
  }
  return 30;
}

// ---------- 4. Set-aside fit ----------
// Colaberry profile: small business, certifications TBD per CLAUDE.md doc.
// Small-biz / 8(a) / WOSB / HUBZone set-asides favor a smaller bidder.
// Full-and-open is neutral; SBIR/STTR is a different motion (high score
// because it's literally innovation-oriented + small-biz only).
const SET_ASIDE_FIT = {
  'SBA':    75, // small business set-aside
  'SBP':    75, // small business partial
  'WOSB':   80, // women-owned small biz
  'EDWOSB': 85, // economically disadvantaged WOSB
  '8A':     85, // 8(a) sole-source / competitive
  '8AN':    85,
  'HZC':    80, // HUBZone competitive
  'HZS':    80,
  'SDVOSBC': 75, // SDVOSB
  'SDVOSBS': 75,
  'VSA':    70, // veteran-owned small biz
  'VSS':    70,
  'IEE':    90, // Indian Economic Enterprise (specialized)
  'SBIR':   100, // SBIR is purpose-built for small-biz AI/research
  'STTR':   100,
  'BICiv':  60, // BIC indefinite vehicle
};

function scoreSetAside(setAsideCode) {
  if (!setAsideCode || setAsideCode === 'NONE') return 35; // open competition — neutral
  const code = String(setAsideCode).trim().toUpperCase();
  return SET_ASIDE_FIT[code] != null ? SET_ASIDE_FIT[code] : 40;
}

// ---------- 5. Value sweet spot ----------
// Colaberry's realistic bid range: $100k - $25M. Below = not worth the bid
// prep; above = needs a prime team Colaberry isn't (yet) positioned for.
// Solicitations rarely publish value — when NULL we return a neutral mid.
function scoreValueFit(valueUsd) {
  if (valueUsd == null) return 50;
  const v = Number(valueUsd);
  if (!Number.isFinite(v) || v <= 0) return 50;
  if (v < 50_000) return 25;       // too tiny
  if (v < 250_000) return 60;
  if (v < 1_000_000) return 85;    // sweet spot lo
  if (v < 5_000_000) return 100;   // sweet spot peak
  if (v < 25_000_000) return 85;
  if (v < 100_000_000) return 55;  // big but possible with primes
  return 30;                        // mega — need to be on someone's team
}

// ---------- Composite ----------
const WEIGHTS = {
  ai_alignment: 0.40,
  naics: 0.15,
  agency_maturity: 0.15,
  set_aside: 0.10,
  value_fit: 0.20,
};

// Verify the weights actually sum to 1.0 — guard against future edits drifting.
const _SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_SUM - 1) > 0.0001) {
  throw new Error(`govContractScoring WEIGHTS sum is ${_SUM}, must be 1.0`);
}

// Signals — small badge set so the digest can show WHY a contract scored.
function deriveSignals(subScores, opp) {
  const sigs = [];
  if (subScores.ai_alignment >= 60) sigs.push('AI_CORE');
  if (subScores.naics >= 85) sigs.push('PRIME_NAICS');
  if (subScores.agency_maturity >= 90) sigs.push('AI_BUYER');
  if (subScores.set_aside >= 75 && opp.set_aside !== 'NONE') sigs.push('SET_ASIDE');
  if (subScores.value_fit >= 85) sigs.push('SWEET_SPOT');
  if (subScores.ai_alignment >= 70 && subScores.naics >= 80) sigs.push('HIGH_FIT');
  return sigs;
}

// Recommended action — coarse triage.
function recommendAction(fitScore, subScores) {
  if (fitScore >= 75 && subScores.ai_alignment >= 50) return 'BID';
  if (fitScore >= 55) return 'WATCH';
  if (subScores.naics >= 70 && subScores.ai_alignment < 30) return 'PARTNER'; // good NAICS but not core AI
  return 'IGNORE';
}

// Top-level scorer. Inputs are the row fields; pure function — no I/O.
// Returns { fit_score, sub_scores, signals, recommended_action } so the
// digest + UI can render the why-it-scored explanation.
function scoreGovContract({ title, description, value, source_data } = {}) {
  const sd = source_data || {};
  const naics = sd.naicsCode || sd.naics_code || sd.naics || null;
  const setAside = sd.typeOfSetAside || sd.set_aside || sd.setAside || null;
  const agency = sd.fullParentPathName || sd.agency || sd.organizationName || null;

  const sub = {
    ai_alignment: scoreAiAlignment(title, description),
    naics: scoreNaics(naics),
    agency_maturity: scoreAgencyMaturity(agency),
    set_aside: scoreSetAside(setAside),
    value_fit: scoreValueFit(value),
  };

  const fit_score = Math.round(
    sub.ai_alignment    * WEIGHTS.ai_alignment    +
    sub.naics           * WEIGHTS.naics           +
    sub.agency_maturity * WEIGHTS.agency_maturity +
    sub.set_aside       * WEIGHTS.set_aside       +
    sub.value_fit       * WEIGHTS.value_fit
  );

  const signals = deriveSignals(sub, { set_aside: setAside });
  const recommended_action = recommendAction(fit_score, sub);

  return { fit_score, sub_scores: sub, signals, recommended_action };
}

module.exports = {
  scoreGovContract,
  scoreAiAlignment,
  scoreNaics,
  scoreAgencyMaturity,
  scoreSetAside,
  scoreValueFit,
  WEIGHTS,
  AI_VOCAB,
  NAICS_FIT,
  AGENCY_MATURITY,
  SET_ASIDE_FIT,
};
