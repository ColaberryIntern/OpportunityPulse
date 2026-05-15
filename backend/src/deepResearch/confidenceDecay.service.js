// Deep Research Phase 4 — confidence decay + reassessment recommendations.
//
// Deterministic. Confidence in a venture decays over time as the signals
// underneath it grow stale — the longer since the last assessment, the
// longer since the last lifecycle transition, the colder the read. This
// service computes the current confidence per venture, writes a history
// row, and emits REASSESSMENT RECOMMENDATIONS — never autonomous lifecycle
// transitions. A human always decides what to do.

const {
  VentureIdea, ExecutionReadiness, VentureLifecycleEvent, ConfidenceHistory,
  ReassessmentEvent,
} = require('../models');

// Thresholds — env-overridable for different deployment cadences.
const ASSESSMENT_GRACE_DAYS = Number(process.env.DEEP_RESEARCH_ASSESSMENT_GRACE_DAYS) || 30;
const STUCK_GRACE_DAYS = Number(process.env.DEEP_RESEARCH_STUCK_GRACE_DAYS) || 21;
const RECOMMEND_REASSESS_THRESHOLD = 0.18; // decay magnitude
// Lifecycle states where "stuck for too long" is a real signal.
const STUCK_PRONE_STATES = new Set([
  'evaluating', 'approved', 'generating_requirements', 'planning_mvp',
]);

const daysBetween = (a, b) => Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));

// Compute confidence decay for one venture. Pure given the inputs.
// initial confidence is in [0,1].
function computeDecay({
  initialConfidence, lastAssessmentAt, lastLifecycleChangeAt, lifecycleState, decision,
  now = Date.now(),
}) {
  const factors = {
    initial_confidence: Number(initialConfidence) || 0,
    age_days: 0,
    stuck_days: 0,
    age_decay: 0,
    stuck_decay: 0,
    decision_pressure_decay: 0,
  };

  if (lastAssessmentAt) {
    const ageDays = daysBetween(new Date(lastAssessmentAt).getTime(), now);
    factors.age_days = ageDays;
    if (ageDays > ASSESSMENT_GRACE_DAYS) {
      // 0.01/day after the grace window, cap 0.5.
      factors.age_decay = Math.min(0.5, (ageDays - ASSESSMENT_GRACE_DAYS) * 0.01);
    }
  } else {
    // Never assessed → significant decay starting from a known low baseline.
    factors.age_decay = 0.3;
  }

  if (lastLifecycleChangeAt && STUCK_PRONE_STATES.has(lifecycleState)) {
    const stuckDays = daysBetween(new Date(lastLifecycleChangeAt).getTime(), now);
    factors.stuck_days = stuckDays;
    if (stuckDays > STUCK_GRACE_DAYS) {
      factors.stuck_decay = Math.min(0.3, (stuckDays - STUCK_GRACE_DAYS) * 0.008);
    }
  }

  // A BUILD_NOW that's been sitting around is a sharper signal — the window
  // may have moved on.
  if (decision === 'BUILD_NOW' && factors.age_days > ASSESSMENT_GRACE_DAYS + 14) {
    factors.decision_pressure_decay = 0.1;
  }

  const decayMagnitude = factors.age_decay + factors.stuck_decay + factors.decision_pressure_decay;
  const confidence = Math.max(0, factors.initial_confidence - decayMagnitude);
  factors.total_decay = Number(decayMagnitude.toFixed(3));
  return { confidence: Number(confidence.toFixed(3)), factors };
}

// Derive a reassessment recommendation from the decay factors + decision.
// Returns null if no recommendation is warranted.
function deriveRecommendation({ confidence, factors, lifecycleState, decision }) {
  const decay = factors.total_decay;
  if (decay >= RECOMMEND_REASSESS_THRESHOLD) {
    const severity = Math.min(100, Math.round(decay * 200));
    if (decision === 'BUILD_NOW' && factors.age_days > ASSESSMENT_GRACE_DAYS) {
      return {
        type: 'accelerate', severity,
        reason: `BUILD_NOW venture last assessed ${factors.age_days} days ago — re-run before the window closes.`,
      };
    }
    return {
      type: 'reassess', severity,
      reason: `Confidence has decayed ${(decay * 100).toFixed(0)}% — last assessment ${factors.age_days} days ago.`,
    };
  }
  if (factors.stuck_days > STUCK_GRACE_DAYS + 14 && STUCK_PRONE_STATES.has(lifecycleState)) {
    return {
      type: 'reprioritize',
      severity: Math.min(100, Math.round(factors.stuck_days * 1.5)),
      reason: `Venture has been in "${lifecycleState}" for ${factors.stuck_days} days — re-prioritize or move on.`,
    };
  }
  if (confidence < 0.3 && decision !== 'MONITOR') {
    return {
      type: 'monitor',
      severity: Math.round((1 - confidence) * 100),
      reason: `Confidence has dropped to ${(confidence * 100).toFixed(0)}% — consider moving to monitoring.`,
    };
  }
  return null;
}

// Run a decay pass over the whole portfolio. Persists history rows + emits
// pending reassessment recommendations (skipping duplicates of an existing
// open recommendation of the same type for the same venture).
async function runDecayPass({ now = Date.now() } = {}) {
  const ventureIdeas = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const lifecycleEvents = await VentureLifecycleEvent.findAll({
    order: [['created_at', 'DESC']],
  });
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));
  const lastLifecycleByVenture = new Map();
  for (const e of lifecycleEvents) {
    if (!lastLifecycleByVenture.has(e.ventureIdeaId)) {
      lastLifecycleByVenture.set(e.ventureIdeaId, e.createdAt);
    }
  }

  const results = [];
  for (const v of ventureIdeas) {
    if (v.lifecycleState === 'archived') continue;
    const er = readinessByVenture.get(v.id);
    const initialConfidence = er ? Math.min(1, Number(er.executionReadinessScore || 0) / 100) : 0.5;
    const decision = er && er.breakdown && er.breakdown.decision
      ? er.breakdown.decision.decision : null;
    const decay = computeDecay({
      initialConfidence,
      lastAssessmentAt: er ? er.updatedAt : null,
      lastLifecycleChangeAt: lastLifecycleByVenture.get(v.id) || v.createdAt,
      lifecycleState: v.lifecycleState,
      decision,
      now,
    });

    // eslint-disable-next-line no-await-in-loop
    await ConfidenceHistory.create({
      ventureIdeaId: v.id,
      confidence: decay.confidence,
      factors: decay.factors,
    });

    const recommendation = deriveRecommendation({
      confidence: decay.confidence, factors: decay.factors,
      lifecycleState: v.lifecycleState, decision,
    });
    if (recommendation) {
      // Skip duplicates of an existing open recommendation of the same type.
      // eslint-disable-next-line no-await-in-loop
      const existing = await ReassessmentEvent.findOne({
        where: { ventureIdeaId: v.id, recommendationType: recommendation.type, status: 'pending' },
      });
      if (!existing) {
        // eslint-disable-next-line no-await-in-loop
        await ReassessmentEvent.create({
          ventureIdeaId: v.id,
          recommendationType: recommendation.type,
          status: 'pending',
          severity: recommendation.severity,
          reason: recommendation.reason,
          factors: decay.factors,
        });
      }
    }

    results.push({
      venture_idea_id: v.id, title: v.title, confidence: decay.confidence,
      factors: decay.factors, recommendation,
    });
  }
  return { evaluated: results.length, results };
}

// Pending reassessment recommendations the UI surfaces.
async function listPendingRecommendations() {
  const rows = await ReassessmentEvent.findAll({
    where: { status: 'pending' },
    order: [['severity', 'DESC']],
  });
  return rows.map((r) => r.toJSON());
}

async function acknowledgeRecommendation(id, actor = null) {
  const row = await ReassessmentEvent.findByPk(id);
  if (!row) {
    const err = new Error(`Reassessment event ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  await row.update({ status: 'acknowledged', acknowledgedBy: actor, acknowledgedAt: new Date() });
  return row.toJSON();
}

async function dismissRecommendation(id, actor = null) {
  const row = await ReassessmentEvent.findByPk(id);
  if (!row) {
    const err = new Error(`Reassessment event ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  await row.update({ status: 'dismissed', acknowledgedBy: actor, acknowledgedAt: new Date() });
  return row.toJSON();
}

module.exports = {
  ASSESSMENT_GRACE_DAYS,
  STUCK_GRACE_DAYS,
  RECOMMEND_REASSESS_THRESHOLD,
  STUCK_PRONE_STATES,
  computeDecay,
  deriveRecommendation,
  runDecayPass,
  listPendingRecommendations,
  acknowledgeRecommendation,
  dismissRecommendation,
};
