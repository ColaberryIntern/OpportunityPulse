// OIED → External AI Bridge: standardized context envelope.
//
// Single source of truth for the shape every row-shaped response
// carries when accessed through the bridge. Pure functions, no I/O —
// the caller passes in already-loaded opportunity / bundle / draft
// rows and gets back a `context` object to attach as `row.context`.
//
// Schema version is stamped so the consumer agent can detect
// breaking changes. Bumps require coordination with the bridge
// consumer.
//
// recommended_action enum: drives what the consumer should do next.
// strategic_type enum:     classification for routing decisions.
// next_steps:              concrete API call sketches the consumer
//                          can execute, built from the route registry
//                          so a URL rename updates in one place.

const { computeRoiPerHour } = require('./executionQueue.service');
const { estimateEffort } = require('./effortEstimator.service');

const SCHEMA_VERSION = 1;

// Route registry — central so renames don't rot next_steps.
const ROUTES = {
  generate:          (id) => `POST /api/v1/oied/opportunities/${id}/generate`,
  markSubmitted:     (id) => `POST /api/v1/oied/opportunities/${id}/mark-submitted`,
  markResult:        (id) => `POST /api/v1/oied/opportunities/${id}/mark-result`,
  bundleStrategy:    (id) => `POST /api/v1/oied/bundles/${id}/strategy`,
  bundleBlueprint:   (id) => `POST /api/v1/oied/bundles/${id}/blueprint`,
  bundleExecPlan:    (id) => `POST /api/v1/oied/bundles/${id}/execution-plan`,
  bundleExecStart:   (id) => `POST /api/v1/oied/bundles/${id}/execution-plan/start`,
  getOpp:            (id) => `GET  /api/v1/oied/opportunities/${id}`,
  getBundle:         (id) => `GET  /api/v1/oied/bundles/${id}/blueprint`,
};

// ---- Opportunity envelope -----------------------------------------------

// v7.1 lifecycle ordering takes precedence over bucket-driven actions.
// State machine the consumer agent observes:
//   no draft        → generate_proposal (bucket-aware fallback)
//   draft  + ¬submit → review_draft   (draft sitting for admin approval)
//   approved + ¬sub → mark_submitted  (admin approved, not yet submitted)
//   submitted + ¬resp → await_response  (within 14d) | mark_outcome (>14d)
//   responded + ¬win → mark_outcome
//   won / lost      → archive_*
function strategicTypeForOpportunity(opp, latestDraft = null, outcome = null) {
  if (outcome === 'won')                   return 'won_opportunity';
  if (outcome === 'lost')                  return 'lost_opportunity';
  if (outcome === 'responded_no_outcome')  return 'pending_outcome_opportunity';
  if (outcome === 'submitted_no_response') return 'pending_outcome_opportunity';
  // Legacy alias — pre-v7.1 callers still pass 'submitted_pending'.
  if (outcome === 'submitted_pending')     return 'pending_outcome_opportunity';
  // v7.1 NEW: distinguish in-review drafts from no-draft act_now.
  if (latestDraft && (latestDraft.status === 'draft' || latestDraft.status === 'approved')) {
    return 'awaiting_review';
  }
  if (opp.bucket === 'act_now')    return 'act_now_opportunity';
  if (opp.bucket === 'high_value') return 'high_value_opportunity';
  if (opp.bucket === 'quick_win')  return 'quick_win_opportunity';
  if ((opp.fitScore || 0) < 30)    return 'skippable_opportunity';
  return 'standard_opportunity';
}

function recommendActionForOpportunity(opp, latestDraft = null, outcome = null) {
  // Terminal lifecycle states.
  if (outcome === 'won')                   return 'archive_won';
  if (outcome === 'lost')                  return 'archive_lost';

  // Mid-lifecycle states — lifecycle takes precedence over bucket.
  if (outcome === 'responded_no_outcome')  return 'mark_outcome';
  if (outcome === 'submitted_no_response' || outcome === 'submitted_pending') {
    const daysSince = opp._submittedDaysAgo ?? 0;
    return daysSince > 14 ? 'mark_outcome' : 'await_response';
  }

  // Pre-submission lifecycle states (driven by latestDraft).
  if (latestDraft && latestDraft.status === 'draft')    return 'review_draft';
  if (latestDraft && latestDraft.status === 'approved') return 'mark_submitted';

  // No draft yet → fall through to bucket-driven actions.
  if (opp.bucket === 'act_now') return 'generate_proposal';
  if ((opp.fitScore || 0) < 30 && opp.bucket === 'standard') return 'skip';
  return 'monitor';
}

function reasonForOpportunity(opp, latestDraft = null, outcome = null) {
  if (outcome === 'won')  return 'won — archive';
  if (outcome === 'lost') return 'lost — archive (signal for win-prob calibration)';
  if (outcome === 'submitted_no_response' || outcome === 'submitted_pending') {
    // ?? guards against 0 (same-day submission) which || would treat as falsy.
    return `submitted ${opp._submittedDaysAgo ?? '?'}d ago — track outcome to feed the learning loop`;
  }
  if (outcome === 'responded_no_outcome') {
    return 'buyer responded — mark won/lost to close the loop';
  }
  const parts = [];
  if (opp.urgency >= 90) parts.push('closes in ≤7 days');
  else if (opp.urgency >= 65) parts.push('closes within 30 days');
  const v = Number(opp.value || 0);
  if (v >= 1_000_000) parts.push(`$${Math.round(v / 1_000_000)}M`);
  else if (v >= 100_000) parts.push(`$${Math.round(v / 1_000)}k`);
  if ((opp.fitScore || 0) >= 70) parts.push('strong profile fit');
  if ((opp.effortEstimate?.effort_score || 100) <= 35) parts.push('low effort');
  if (latestDraft && latestDraft.status === 'draft') parts.push('draft ready in review queue');
  return parts.length ? parts.join(' · ') : 'matches your profile';
}

function nextStepsForOpportunity(opp, latestDraft = null, outcome = null) {
  const id = opp.id;
  if (outcome === 'won')  return ['Archive — no further action needed.'];
  if (outcome === 'lost') return ['Archive — confirm calibration of win probability for similar opps.'];

  // v7.1 mid-lifecycle states.
  if (outcome === 'responded_no_outcome') {
    return [
      `${ROUTES.markResult(id)} body={"status":"won"}`,
      `${ROUTES.markResult(id)} body={"status":"lost"}`,
      'Buyer responded — pick the actual outcome to close the loop.',
    ];
  }
  if (outcome === 'submitted_no_response' || outcome === 'submitted_pending') {
    return [
      `${ROUTES.markResult(id)} body={"status":"responded"}  (when buyer acknowledges)`,
      'Once responded is logged, mark won/lost via the same endpoint.',
    ];
  }

  // Pre-submission lifecycle states.
  if (latestDraft && latestDraft.status === 'approved') {
    return [
      `${ROUTES.markSubmitted(id)}`,
      `Then ${ROUTES.markResult(id)} body={"status":"responded"} when buyer acknowledges.`,
    ];
  }
  if (latestDraft && latestDraft.status === 'draft') {
    return [
      'Have an admin approve the draft in /admin/opportunities/review.',
      `Once approved, ${ROUTES.markSubmitted(id)}`,
    ];
  }

  // No draft yet.
  if (opp.bucket === 'act_now') {
    return [
      `${ROUTES.generate(id)} body={"type":"proposal"}`,
      `After approval, ${ROUTES.markSubmitted(id)}`,
    ];
  }
  if ((opp.fitScore || 0) < 30 && opp.bucket === 'standard') {
    return ['Skip — fit score below threshold.'];
  }
  return [`Monitor; revisit when bucket flips. ${ROUTES.getOpp(id)} for current state.`];
}

function buildContextForOpportunity({
  opp,
  organizationId = null,
  latestDraft = null,
  outcome = null,           // null | 'won' | 'lost' | 'submitted_no_response' | 'responded_no_outcome' | 'submitted_pending' (legacy)
  winProbability = null,
  grounding = null,         // v8: optional payload from grounding.service
}) {
  const effort = opp.effortEstimate || estimateEffort(opp);
  const wp = Number(winProbability != null ? winProbability : opp.winProbability);
  const finalWp = Number.isFinite(wp) ? wp : 0.20;
  const roi = computeRoiPerHour({
    value: opp.value,
    winProbability: finalWp,
    proposalHours: effort.proposal_hours,
  });
  const ctx = {
    schema_version: SCHEMA_VERSION,
    priority: Math.round(Number(opp.priorityScore) || 0),
    value: Number(opp.value) || 0,
    win_probability: Number(finalWp.toFixed(3)),
    effort,
    roi_per_hour: roi,
    recommended_action: recommendActionForOpportunity(opp, latestDraft, outcome),
    reason: reasonForOpportunity(opp, latestDraft, outcome),
    strategic_type: strategicTypeForOpportunity(opp, latestDraft, outcome),
    next_steps: nextStepsForOpportunity(opp, latestDraft, outcome),
    organization_id: organizationId,
    generated_at: new Date().toISOString(),
  };
  // v8: additive grounding sub-object on the single-row endpoint.
  // List endpoints don't pass grounding (per-row DB hit × N would be
  // expensive); the bridge consumer can fetch /opportunities/:id for
  // detail. schema_version stays at 1 because this is purely additive.
  if (grounding) {
    if (grounding.status === 'ok') {
      // Lazy require to avoid a circular import path:
      // intelligence.context.js doesn't depend on grounding.service.js
      // for normal context building.
      // eslint-disable-next-line global-require
      const groundingSvc = require('./grounding.service');
      ctx.grounding = {
        agency_name: grounding.agency_name,
        solicitation_id: grounding.solicitation_id,
        missing_fields: groundingSvc.missingGroundingFields(grounding),
      };
    } else if (grounding.status === 'invalid_stage') {
      ctx.grounding = {
        agency_name: null,
        solicitation_id: null,
        missing_fields: [],
        status: 'invalid_stage',
        blocked_by_event: grounding.event_type || null,
      };
    }
  }
  return ctx;
}

// ---- Bundle envelope ----------------------------------------------------

function strategicTypeForBundle(bundle, plan = null) {
  if (plan) {
    if (plan.status === 'in_progress') return 'in_progress_build';
    if (plan.status === 'completed')   return 'completed_build';
  }
  if (Number(bundle.estimatedTotalValue || 0) >= 10_000_000) return 'high_value_bundle';
  return 'standard_bundle';
}

function recommendActionForBundle(bundle, plan = null) {
  const hasStrategy  = !!(bundle.strategy && bundle.strategy.what_to_build);
  const hasBlueprint = !!(bundle.blueprint && bundle.blueprint.mvp_scope);
  if (!hasStrategy)  return 'generate_strategy';
  if (!hasBlueprint) return 'generate_blueprint';
  if (!plan)         return 'generate_execution_plan';
  if (plan.status === 'draft')       return 'start_build';
  if (plan.status === 'in_progress') return 'execute_tasks';
  if (plan.status === 'completed')   return 'archive_build';
  return 'monitor';
}

function reasonForBundle(bundle, plan = null) {
  const v = Number(bundle.estimatedTotalValue || 0);
  const sizeStr = v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1_000)}k`;
  const count = bundle.opportunityCount || 0;
  const stage = plan
    ? `plan ${plan.status}`
    : bundle.blueprint?.mvp_scope
      ? 'blueprint ready, no plan'
      : bundle.strategy?.what_to_build
        ? 'strategy set, no blueprint'
        : 'no strategy yet';
  return `${count} opps · ${sizeStr} total · ${stage}`;
}

function nextStepsForBundle(bundle, plan = null) {
  const id = bundle.id;
  const hasStrategy  = !!(bundle.strategy && bundle.strategy.what_to_build);
  const hasBlueprint = !!(bundle.blueprint && bundle.blueprint.mvp_scope);
  if (!hasStrategy) {
    return [
      `${ROUTES.bundleStrategy(id)} body={"force":false}`,
      'Then generate a blueprint, then an execution plan.',
    ];
  }
  if (!hasBlueprint) {
    return [`${ROUTES.bundleBlueprint(id)} body={"force":false}`];
  }
  if (!plan) {
    return [
      `${ROUTES.bundleExecPlan(id)} body={"force":false}`,
      `Then ${ROUTES.bundleExecStart(id)} when ready to begin.`,
    ];
  }
  if (plan.status === 'draft')       return [`${ROUTES.bundleExecStart(id)}`];
  if (plan.status === 'in_progress') return ['Coordinate the agents in plan.assigned_agents through each wave.'];
  if (plan.status === 'completed')   return ['Archive — build complete.'];
  return [];
}

// Bundle "priority" is heuristic — based on revenue scale + member count.
// 0–100 scale to match the opportunity-side value.
function deriveBundlePriority(bundle) {
  const v = Number(bundle.estimatedTotalValue || 0);
  let p = 0;
  if (v >= 100_000_000) p += 60;
  else if (v >= 10_000_000) p += 45;
  else if (v >= 1_000_000)  p += 30;
  else if (v >= 100_000)    p += 15;
  const count = Number(bundle.opportunityCount || 0);
  if (count >= 20) p += 30;
  else if (count >= 10) p += 20;
  else if (count >= 5)  p += 10;
  return Math.min(100, p);
}

function deriveBundleEffort(bundle, plan = null) {
  if (plan && plan.timeline) {
    return {
      proposal_hours: null,
      build_days: plan.timeline.total_days || null,
      effort_score: null,
      parallel_efficiency: plan.timeline.parallel_efficiency || null,
    };
  }
  return {
    proposal_hours: null,
    build_days: bundle.estimatedBuildTimeDays || null,
    effort_score: null,
  };
}

function buildContextForBundle({ bundle, plan = null, organizationId = null }) {
  return {
    schema_version: SCHEMA_VERSION,
    priority: deriveBundlePriority(bundle),
    value: Number(bundle.estimatedTotalValue) || 0,
    // win_probability isn't meaningful for a cluster — surface null so the
    // consumer can branch on `if (context.win_probability == null) ...`
    win_probability: null,
    effort: deriveBundleEffort(bundle, plan),
    roi_per_hour: null,
    recommended_action: recommendActionForBundle(bundle, plan),
    reason: reasonForBundle(bundle, plan),
    strategic_type: strategicTypeForBundle(bundle, plan),
    next_steps: nextStepsForBundle(bundle, plan),
    organization_id: organizationId || bundle.organizationId || null,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildContextForOpportunity,
  buildContextForBundle,
  recommendActionForOpportunity,
  recommendActionForBundle,
  strategicTypeForOpportunity,
  strategicTypeForBundle,
  reasonForOpportunity,
  reasonForBundle,
  nextStepsForOpportunity,
  nextStepsForBundle,
  deriveBundlePriority,
  deriveBundleEffort,
  ROUTES,
  SCHEMA_VERSION,
};
