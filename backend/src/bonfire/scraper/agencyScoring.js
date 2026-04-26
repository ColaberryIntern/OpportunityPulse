// Agency-priority heuristic. Every scrape attempt updates the agency's
// priority_score, which the runner uses to sort the iteration loop —
// higher-priority agencies get scraped first so a partial run still
// captures the most valuable data.
//
// The scoring inputs are:
//   - geographic match (CQuvator is TX-based; nearby states get a bump)
//   - volume (agencies that produced more open bids in past runs)
//   - fit quality (count of past bids whose enriched priority_score >= 70)
//   - reliability (each consecutive Cloudflare block costs 5 points)
//
// All weights are tunable from a single CONFIG block; tweak there if the
// emphasis shifts (e.g. expand to TX+adjacent, or de-prioritize school
// districts after a run of low-fit data).

const TX_PATTERNS = /(^|[^a-z])(tx|texas|austin|dallas|houston|elgin|frisco|brownsville|wfsdallas|dfwairport|saisd|dhantx|nisd|aisd|wylietexas|libertyhilltx|tomballtx|cityofhutchins|mckinneytexas|smithcounty|dentoncounty|pfisd|rockwallisd|mesquiteisd|harriscountytx|galvestoncountytx|burlesontx|southlake|txdot|twc-texas|tdhca-texas|utexas|utdallas|dallascityhall|dallasisd|austinisd)([^a-z]|$)/i;
const ADJACENT_PATTERNS = /(^|[^a-z])(ok|oklahoma|nm|newmexico|la|louisiana|ar|arkansas)([^a-z]|$)/i;
const SCHOOL_PATTERNS = /isd$/i;
const MAJOR_METRO_PATTERNS = /(^|[^a-z])(metra|detroit|chicago|nyc|sanantonio|harriscountytx|dallasisd|dallascityhall|hccs|austinisd|dart|saisd)([^a-z]|$)/i;

const SCORE_CONFIG = {
  baseline: 50,
  txBonus: 30,
  adjacentBonus: 12,
  schoolBonus: 4,
  majorMetroBonus: 8,
  // Volume term: log2(opens + 1) * factor, capped.
  volumeFactor: 5,
  volumeCap: 20,
  // Fit term: each bid with priority_score >= 70 contributes this many points.
  fitFactor: 3,
  fitCap: 15,
  // Reliability penalty per consecutive Cloudflare block.
  blockPenalty: 5,
};

function regionBonus(subdomain) {
  let bonus = 0;
  if (TX_PATTERNS.test(subdomain)) bonus += SCORE_CONFIG.txBonus;
  else if (ADJACENT_PATTERNS.test(subdomain)) bonus += SCORE_CONFIG.adjacentBonus;
  if (SCHOOL_PATTERNS.test(subdomain)) bonus += SCORE_CONFIG.schoolBonus;
  if (MAJOR_METRO_PATTERNS.test(subdomain)) bonus += SCORE_CONFIG.majorMetroBonus;
  return bonus;
}

function volumeTerm(openCount) {
  if (!openCount || openCount <= 0) return 0;
  const raw = Math.log2(openCount + 1) * SCORE_CONFIG.volumeFactor;
  return Math.min(SCORE_CONFIG.volumeCap, Math.round(raw));
}

function fitTerm(highFitCount) {
  if (!highFitCount || highFitCount <= 0) return 0;
  return Math.min(SCORE_CONFIG.fitCap, highFitCount * SCORE_CONFIG.fitFactor);
}

// Compute a 0-100 score from the inputs the scraper has at outcome time.
// `priorAgency` is the BonfireAgency row from before this scrape (may be null
// for first-ever encounters); `outcome` carries fresh openCount + block info.
function scoreAgency({
  subdomain,
  agencyName,
  priorAgency,
  openCount,
  highFitCount,
  blocked,
  priorBlocks,
}) {
  let score = SCORE_CONFIG.baseline;
  score += regionBonus(subdomain || '');
  // Combine fresh signal with prior knowledge so a single zero-result run
  // doesn't crater an agency we know is good.
  const effectiveOpens = Math.max(
    Number(openCount) || 0,
    (priorAgency && priorAgency.lastOpenCount) || 0,
  );
  score += volumeTerm(effectiveOpens);
  score += fitTerm(Number(highFitCount) || 0);
  // Block penalty applies to the post-this-attempt streak.
  const streak = blocked ? (Number(priorBlocks) || 0) + 1 : 0;
  score -= streak * SCORE_CONFIG.blockPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Default score for an agency we've never visited. Pure region heuristic —
// no signal yet. Used to sort the very first iteration.
function defaultScoreFor(subdomain) {
  return Math.max(0, Math.min(100, SCORE_CONFIG.baseline + regionBonus(subdomain || '')));
}

module.exports = {
  scoreAgency,
  defaultScoreFor,
  regionBonus,
  volumeTerm,
  fitTerm,
  SCORE_CONFIG,
};
