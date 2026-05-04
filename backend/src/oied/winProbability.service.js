// Win Probability Learning Engine.
//
// Replaces the static heuristic in v3's recommendation.service. Pulls
// recent won/lost events scoped to the organization and adjusts the
// baseline probability based on three similarity buckets:
//   - same category as the candidate opportunity
//   - similar deal size (within 0.5x – 2x of opp.value)
//   - similar effort score (within ±15)
//
// Numbers are conservative on purpose. With 1 win in same category we
// nudge +0.04; with 10 wins, we cap at +0.25. As more outcomes accrue
// the bands saturate. No ML model in v4.
//
// Persists every snapshot to win_probability_history when persist=true,
// so we can audit how predictions shift over time.

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const {
  Opportunity,
  OpportunityEvent,
  WinProbabilityHistory,
} = require('../models');

const BASELINE = 0.20;
const MIN_PROB = 0.05;
const MAX_PROB = 0.85;

const CATEGORY_PER_NET   = 0.04;
const CATEGORY_LO        = -0.20;
const CATEGORY_HI        =  0.25;

const DEAL_SIZE_PER_NET  = 0.02;
const DEAL_SIZE_LO       = -0.10;
const DEAL_SIZE_HI       =  0.10;

const EFFORT_PER_NET     = 0.015;
const EFFORT_LO          = -0.08;
const EFFORT_HI          =  0.08;

const FIT_BOOST          = 0.05;
const FIT_BOOST_THRESHOLD = 70;

const HISTORY_WINDOW_DAYS = 180;

function clip(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isSimilarDealSize(candidateValue, otherValue) {
  const a = Number(candidateValue || 0);
  const b = Number(otherValue || 0);
  if (a <= 0 || b <= 0) return false;
  return b >= a * 0.5 && b <= a * 2;
}

function isSimilarEffort(candidateEffort, otherEffort) {
  const a = Number(candidateEffort || 0);
  const b = Number(otherEffort || 0);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 15;
}

// Pure-function core: given candidate signals + an array of historical
// outcomes ({eventType, opportunity:{category,value,effort_score}}),
// compute the probability + components.
function computeProbabilityFromHistory({
  candidate,         // { category, value, fitScore, effortScore }
  outcomes,          // [{ eventType:'won'|'lost', opportunity:{category,value,effortScore} }]
}) {
  let categoryWins = 0, categoryLosses = 0;
  let dealSizeWins = 0, dealSizeLosses = 0;
  let effortWins = 0, effortLosses = 0;

  const candCat = String(candidate.category || '').toLowerCase().trim();

  for (const o of outcomes) {
    const won = o.eventType === 'won';
    const lost = o.eventType === 'lost';
    if (!won && !lost) continue;

    const opp = o.opportunity || {};
    const oCat = String(opp.category || '').toLowerCase().trim();
    if (candCat && oCat && oCat === candCat) {
      if (won) categoryWins += 1; else categoryLosses += 1;
    }
    if (isSimilarDealSize(candidate.value, opp.value)) {
      if (won) dealSizeWins += 1; else dealSizeLosses += 1;
    }
    if (isSimilarEffort(candidate.effortScore, opp.effortScore)) {
      if (won) effortWins += 1; else effortLosses += 1;
    }
  }

  const categoryAdj = clip(
    (categoryWins - categoryLosses) * CATEGORY_PER_NET,
    CATEGORY_LO, CATEGORY_HI,
  );
  const dealSizeAdj = clip(
    (dealSizeWins - dealSizeLosses) * DEAL_SIZE_PER_NET,
    DEAL_SIZE_LO, DEAL_SIZE_HI,
  );
  const effortAdj = clip(
    (effortWins - effortLosses) * EFFORT_PER_NET,
    EFFORT_LO, EFFORT_HI,
  );
  const fitBoost = (Number(candidate.fitScore) || 0) >= FIT_BOOST_THRESHOLD ? FIT_BOOST : 0;

  const raw = BASELINE + categoryAdj + dealSizeAdj + effortAdj + fitBoost;
  const clamped = clip(raw, MIN_PROB, MAX_PROB);

  return {
    win_probability: Number(clamped.toFixed(3)),
    components: {
      baseline: BASELINE,
      category_adjustment: Number(categoryAdj.toFixed(3)),
      deal_size_adjustment: Number(dealSizeAdj.toFixed(3)),
      effort_adjustment: Number(effortAdj.toFixed(3)),
      fit_boost: fitBoost,
      similar_wins: {
        category: categoryWins,
        deal_size: dealSizeWins,
        effort: effortWins,
      },
      similar_losses: {
        category: categoryLosses,
        deal_size: dealSizeLosses,
        effort: effortLosses,
      },
      total_outcomes: outcomes.length,
    },
  };
}

// DB-bound entry point. Pulls won/lost events for the org over the last
// 180 days, joins to opportunities for category/value, attaches
// estimated effort, computes probability, optionally persists snapshot.
async function calculateWinProbability({
  opportunity,
  organizationId,
  fitScore,
  effortScore,
  now = new Date(),
  persist = false,
}) {
  if (!opportunity) {
    return computeProbabilityFromHistory({
      candidate: { category: null, value: 0, fitScore: 0, effortScore: 50 },
      outcomes: [],
    });
  }

  const since = new Date(now.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let outcomes = [];
  try {
    const events = await OpportunityEvent.findAll({
      where: {
        eventType: { [Op.in]: ['won', 'lost'] },
        createdAt: { [Op.gte]: since },
      },
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
    if (events.length > 0) {
      const oppIds = [...new Set(events.map((e) => e.opportunityId))];
      const opps = await Opportunity.findAll({
        where: { id: oppIds },
        attributes: ['id', 'category', 'value'],
      });
      const oppMap = new Map();
      for (const o of opps) oppMap.set(o.id, o.toJSON());
      // We don't have effort_score on opportunities directly — re-derive
      // it from the same effortEstimator the recommendation engine uses.
      // Lazy require to avoid a cycle.
      // eslint-disable-next-line global-require
      const { estimateEffort } = require('./effortEstimator.service');
      outcomes = events.map((e) => {
        const opp = oppMap.get(e.opportunityId) || {};
        const effort = estimateEffort(opp);
        return {
          eventType: e.eventType,
          opportunity: {
            id: e.opportunityId,
            category: opp.category || null,
            value: opp.value || 0,
            effortScore: effort.effort_score,
          },
        };
      });
    }
  } catch (e) {
    logger.warn('winProbability: outcome lookup failed (using baseline)', {
      error: e.message,
    });
    outcomes = [];
  }

  const candidate = {
    category: opportunity.category || null,
    value: opportunity.value || 0,
    fitScore: Number(fitScore) || 0,
    effortScore: Number(effortScore) || 50,
  };

  const out = computeProbabilityFromHistory({ candidate, outcomes });

  if (persist) {
    try {
      await WinProbabilityHistory.create({
        organizationId: organizationId || null,
        opportunityId: opportunity.id,
        winProbability: out.win_probability,
        components: out.components,
      });
    } catch (e) {
      logger.warn('winProbability: history persist failed (continuing)', {
        error: e.message,
      });
    }
  }

  return out;
}

module.exports = {
  calculateWinProbability,
  computeProbabilityFromHistory,
  isSimilarDealSize,
  isSimilarEffort,
  BASELINE,
  MIN_PROB,
  MAX_PROB,
  CATEGORY_PER_NET,
  HISTORY_WINDOW_DAYS,
};
