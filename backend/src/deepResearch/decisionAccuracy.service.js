// Deep Research Phase 5 — decision accuracy analytics.
//
// MEASURE-ONLY. This service NEVER modifies scoring or any other engine —
// it only observes how often each decision class actually ended up being
// correct, given how the ventures progressed afterward, and reports it.
//
// "Correct" depends on the decision:
//   BUILD_NOW / BUILD_SOON  →  the venture progressed past 'approved'
//   MONITOR / TOO_EARLY      →  the venture stayed in monitor/research OR was archived
//   HIGH_RISK / OVERSATURATED → the venture was archived OR didn't progress
//   NEEDS_VALIDATION         →  the venture moved to evaluating or archived
//
// All deterministic — readiness rows + lifecycle events are the inputs.

const { Op } = require('sequelize');
const {
  ExecutionReadiness, VentureIdea, VentureLifecycleEvent, DecisionAccuracy,
} = require('../models');
const ventureLifecycle = require('./ventureLifecycle.service');

// Lifecycle index for ordering (higher = further along the build path).
const LIFECYCLE_INDEX = new Map(ventureLifecycle.STATES.map((s, i) => [s, i]));

// Was a decision "correct" for a given venture, given its current state
// + its lifecycle history? Returns one of 'progressed' | 'stalled' | 'reversed'.
function classifyOutcome(decision, ventureIdea, eventsForVenture) {
  const sortedEvents = eventsForVenture.slice().sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );
  const archived = (ventureIdea.lifecycleState === 'archived')
    || sortedEvents.some((e) => e.toState === 'archived');
  const currentIdx = LIFECYCLE_INDEX.get(ventureIdea.lifecycleState);
  const startIdx = sortedEvents.length > 0
    ? LIFECYCLE_INDEX.get(sortedEvents[0].fromState || ventureIdea.lifecycleState)
    : LIFECYCLE_INDEX.get(ventureIdea.lifecycleState);

  // 'Reversed' detector: did the venture EVER move backward to an earlier
  // state, or get archived?
  let reversed = archived;
  for (let i = 1; i < sortedEvents.length; i += 1) {
    const a = LIFECYCLE_INDEX.get(sortedEvents[i - 1].toState);
    const b = LIFECYCLE_INDEX.get(sortedEvents[i].toState);
    if (a != null && b != null && b < a) { reversed = true; break; }
  }

  // Archived takes precedence — moving to archived shows up high in the
  // lifecycle index order but is failure, not progress.
  if (reversed) return 'reversed';
  if (currentIdx > startIdx) return 'progressed';
  return 'stalled';
}

// Given a decision + the outcome, was the decision correct?
function decisionWasCorrect(decision, outcome) {
  if (!decision) return null;
  switch (decision) {
    case 'BUILD_NOW':
    case 'BUILD_SOON':
      return outcome === 'progressed';
    case 'MONITOR':
    case 'TOO_EARLY':
      return outcome !== 'progressed'; // intentionally NOT progressed
    case 'OVERSATURATED':
    case 'HIGH_RISK':
      return outcome === 'stalled' || outcome === 'reversed';
    case 'NEEDS_VALIDATION':
      // Either progressed (validation succeeded) or archived (validation failed)
      // is a correct outcome — only stalled-without-action counts as wrong.
      return outcome !== 'stalled';
    default:
      return null;
  }
}

// Compute accuracy for one decision type over a period.
function computeForDecision(decision, samples) {
  if (samples.length === 0) {
    return {
      decision_type: decision, total_count: 0, progressed_count: 0, stalled_count: 0,
      reversed_count: 0, accuracy: null,
    };
  }
  let progressed = 0;
  let stalled = 0;
  let reversed = 0;
  let correct = 0;
  for (const s of samples) {
    if (s.outcome === 'progressed') progressed += 1;
    if (s.outcome === 'stalled') stalled += 1;
    if (s.outcome === 'reversed') reversed += 1;
    if (decisionWasCorrect(decision, s.outcome)) correct += 1;
  }
  return {
    decision_type: decision,
    total_count: samples.length,
    progressed_count: progressed,
    stalled_count: stalled,
    reversed_count: reversed,
    accuracy: Number((correct / samples.length).toFixed(3)),
  };
}

// Run a full decision-accuracy pass over a lookback window. Persists one
// decision_accuracy row per decision type that has at least one sample.
async function computeAccuracy({ periodDays = 90 } = {}) {
  const sinceDate = new Date(Date.now() - periodDays * 86400000);
  const ventures = await VentureIdea.findAll();
  const ventureMap = new Map(ventures.map((v) => [v.id, v]));
  const readinessRows = await ExecutionReadiness.findAll({
    where: { updatedAt: { [Op.gte]: sinceDate } },
  });
  if (readinessRows.length === 0) {
    return { period_days: periodDays, results: [], computed_at: new Date() };
  }
  const ventureIds = readinessRows.map((r) => r.ventureIdeaId);
  const events = await VentureLifecycleEvent.findAll({
    where: { ventureIdeaId: { [Op.in]: ventureIds }, createdAt: { [Op.gte]: sinceDate } },
  });
  const eventsByVenture = new Map();
  for (const e of events) {
    if (!eventsByVenture.has(e.ventureIdeaId)) eventsByVenture.set(e.ventureIdeaId, []);
    eventsByVenture.get(e.ventureIdeaId).push(e);
  }

  // Bucket by decision.
  const byDecision = new Map();
  for (const er of readinessRows) {
    const decision = er.breakdown && er.breakdown.decision
      ? er.breakdown.decision.decision : null;
    if (!decision) continue;
    const ventureIdea = ventureMap.get(er.ventureIdeaId);
    if (!ventureIdea) continue;
    const outcome = classifyOutcome(decision, ventureIdea,
      eventsByVenture.get(er.ventureIdeaId) || []);
    if (!byDecision.has(decision)) byDecision.set(decision, []);
    byDecision.get(decision).push({ venture_idea_id: ventureIdea.id, outcome });
  }

  const results = [];
  for (const [decision, samples] of byDecision) {
    const result = computeForDecision(decision, samples);
    // eslint-disable-next-line no-await-in-loop
    await DecisionAccuracy.create({
      decisionType: result.decision_type,
      periodDays,
      totalCount: result.total_count,
      progressedCount: result.progressed_count,
      stalledCount: result.stalled_count,
      reversedCount: result.reversed_count,
      accuracy: result.accuracy,
      metadata: { samples },
    });
    results.push(result);
  }
  return { period_days: periodDays, results, computed_at: new Date() };
}

// Read the most recent accuracy row per decision type.
async function getLatestAccuracy() {
  const rows = await DecisionAccuracy.findAll({ order: [['computed_at', 'DESC']] });
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.decisionType)) seen.set(r.decisionType, r.toJSON());
  return Array.from(seen.values()).sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0));
}

module.exports = {
  LIFECYCLE_INDEX,
  classifyOutcome,
  decisionWasCorrect,
  computeForDecision,
  computeAccuracy,
  getLatestAccuracy,
};
