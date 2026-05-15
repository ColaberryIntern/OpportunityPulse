// Deep Research Phase 4 — execution capacity planner.
//
// Deterministic. Given the portfolio ranking + per-venture timelines +
// the org's resource capacity snapshot, plans:
//   - recommended concurrency (how many ventures to run in parallel)
//   - launch sequencing (which ventures land in Q1 / Q2 / Q3 / Q4)
//   - hiring recommendations (translate role deficits into hires)
//   - delivery pacing (weeks per venture once in the queue)
//
// No persistence — this is a derived view assembled on read.

const { VentureIdea, ExecutionReadiness } = require('../models');
const portfolioPrioritization = require('./portfolioPrioritization.service');
const resourceCapacity = require('./resourceCapacity.service');

const QUARTER_WEEKS = 13;

// Translate role deficits from a capacity snapshot into concrete hires.
function hiringRecommendationsFrom(capacitySnapshot) {
  if (!capacitySnapshot || !capacitySnapshot.role_demand) return [];
  const recs = [];
  for (const [role, info] of Object.entries(capacitySnapshot.role_demand)) {
    if ((info.deficit || 0) > 0) {
      recs.push({
        role,
        hires_recommended: info.deficit,
        rationale: `${info.demand} venture demand vs ${info.supply} supply = ${info.deficit} deficit.`,
      });
    }
  }
  return recs.sort((a, b) => b.hires_recommended - a.hires_recommended);
}

// Assign ventures to quarters in priority order, respecting concurrency.
// Each venture occupies its MVP-timeline-weeks worth of one team-slot.
function planQuarters(ranking, readinessByVenture, concurrencyLimit, horizonQuarters = 4) {
  const slots = Array.from({ length: concurrencyLimit }, () => 0); // weeks used per slot
  const plan = [];
  for (const r of ranking) {
    if (r.sequencing_recommendation === 'pass' || r.sequencing_recommendation === 'monitor') {
      plan.push({ ...r, scheduled_quarter: null, scheduled_week_start: null, scheduled_week_end: null });
      continue;
    }
    const er = readinessByVenture.get(r.venture_idea_id);
    const weeks = er ? Number(er.mvpTimelineWeeks) || 12 : 12;
    // Pick the slot with the earliest current end time.
    let pick = 0;
    for (let i = 1; i < slots.length; i += 1) if (slots[i] < slots[pick]) pick = i;
    const start = slots[pick];
    const end = start + weeks;
    slots[pick] = end;
    const quarter = Math.floor(start / QUARTER_WEEKS) + 1;
    plan.push({
      ...r,
      scheduled_slot: pick + 1,
      scheduled_quarter: quarter <= horizonQuarters ? quarter : null,
      scheduled_week_start: start,
      scheduled_week_end: end,
      mvp_timeline_weeks: weeks,
    });
  }
  return plan;
}

// Build the full capacity plan. Pure given inputs.
function buildPlan({
  ranking, readinessByVenture, capacitySnapshot, horizonQuarters = 4,
}) {
  const concurrencyLimit = capacitySnapshot ? capacitySnapshot.concurrency_limit
    || capacitySnapshot.concurrencyLimit || 1 : 1;
  const plan = planQuarters(ranking, readinessByVenture, concurrencyLimit, horizonQuarters);

  const byQuarter = {};
  for (let q = 1; q <= horizonQuarters; q += 1) byQuarter[`Q${q}`] = [];
  byQuarter.beyond = [];
  for (const p of plan) {
    if (!p.scheduled_quarter) continue;
    if (p.scheduled_quarter <= horizonQuarters) {
      byQuarter[`Q${p.scheduled_quarter}`].push(p);
    } else {
      byQuarter.beyond.push(p);
    }
  }

  const totalSchedulable = plan.filter((p) => p.scheduled_quarter != null).length;
  const totalDeferred = plan.length - totalSchedulable;
  const avgWeeks = plan.length > 0
    ? Math.round(plan.reduce((s, p) => s + (p.mvp_timeline_weeks || 0), 0) / plan.length)
    : 0;

  return {
    concurrency_limit: concurrencyLimit,
    quarterly_capacity: concurrencyLimit * Math.max(1, Math.floor(QUARTER_WEEKS / Math.max(avgWeeks, 1))),
    average_venture_weeks: avgWeeks,
    schedulable_in_horizon: totalSchedulable,
    deferred_or_passed: totalDeferred,
    horizon_quarters: horizonQuarters,
    by_quarter: byQuarter,
    sequence: plan,
    hiring_recommendations: hiringRecommendationsFrom(capacitySnapshot),
  };
}

// Convenience: orchestrate the inputs + build the plan.
async function planCapacity({ horizonQuarters = 4 } = {}) {
  const ventureIdeas = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));

  const ranking = await portfolioPrioritization.getLatestRanking();
  const rankingList = ranking ? ranking.ranking : [];
  const capacitySnapshot = await resourceCapacity.getLatestSnapshot();

  return buildPlan({
    ranking: rankingList.map((r) => ({
      venture_idea_id: r.ventureIdeaId,
      title: (ventureIdeas.find((v) => v.id === r.ventureIdeaId) || {}).title,
      sequencing_recommendation: r.sequencingRecommendation,
      portfolio_rank: r.portfolioRank,
      portfolio_score: Number(r.portfolioScore),
    })),
    readinessByVenture,
    capacitySnapshot,
    horizonQuarters,
  });
}

module.exports = {
  QUARTER_WEEKS,
  hiringRecommendationsFrom,
  planQuarters,
  buildPlan,
  planCapacity,
};
