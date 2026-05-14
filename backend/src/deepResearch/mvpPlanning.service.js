// Deep Research Phase 3 — MVP planning engine.
//
// Hybrid: the plan CONTENT (scope, phased features, stack, AI components,
// staffing) is AI-generated — it's inherently creative and venture-specific
// — but the timeline estimate is DETERMINISTIC, taken from the execution
// readiness engine, so the schedule is auditable rather than a model guess.
//
// Goes through the resilient aiProvider layer like every other AI call.

const aiProvider = require('./aiProvider.service');
const executionReadiness = require('./executionReadiness.service');
const logger = require('../logging/logger');

const SYSTEM_PROMPT = `You are a pragmatic founding engineer at an AI venture studio.
Given a venture idea + its strategic + execution context, produce a concrete, shippable MVP plan.

Produce a JSON object:
{
  "mvp_scope": "2-3 sentences: the smallest version that proves value and could ship in ~1 quarter.",
  "phase_1_features": ["4-7 short strings — the MVP feature set."],
  "fast_launch_features": ["2-4 short strings — the absolute minimum 'launch in 2-3 weeks' subset."],
  "future_roadmap": ["3-5 short strings — what comes AFTER the MVP."],
  "suggested_architecture": "2-3 sentences: the rough technical shape — what's reused vs net-new.",
  "suggested_stack": ["5-9 short strings — concrete technologies (language, framework, db, hosting, etc.)."],
  "recommended_ai_components": ["2-5 short strings — the specific AI pieces (models, embeddings, agents, etc.)."],
  "staffing": { "roles": ["3-6 role strings"], "headcount": <integer> }
}

Rules:
- Be concrete and specific to THIS venture — no generic "build a web app" filler.
- fast_launch_features must be a genuine subset of phase_1_features — the ruthless minimum.
- Favor boring, proven technology in suggested_stack.
- Respond with ONLY the JSON object.`;

function buildUserPrompt(ventureIdea, ctx) {
  const { report = {}, executionReadiness: er = {} } = ctx;
  const meta = ventureIdea.metadata || {};
  return [
    `Venture idea: ${ventureIdea.title}`,
    `Description: ${ventureIdea.description || '(none)'}`,
    `MVP scope hint: ${ventureIdea.mvpScope || ventureIdea.mvp_scope || '(none)'}`,
    `Suggested architecture hint: ${meta.suggested_architecture || '(none)'}`,
    `Target customers: ${meta.target_customers || '(none)'}`,
    `Monetization: ${ventureIdea.monetizationStrategy || ventureIdea.monetization_strategy || '(none)'}`,
    '',
    'Strategic + execution context:',
    `- Research topic: ${report.searchTerm || '(none)'}`,
    `- Market stage: ${report.marketStage || '(unknown)'}`,
    `- Execution readiness score: ${er.execution_readiness_score != null ? er.execution_readiness_score : '(not assessed)'}`,
    `- Estimated MVP timeline (deterministic): ~${er.mvp_timeline_weeks || '?'} weeks`,
    `- Recommended staffing headcount: ${er.staffing && er.staffing.headcount ? er.staffing.headcount : '?'}`,
  ].join('\n');
}

// Clamp + shape the AI output into the persisted MVP plan.
function sanitizePlan(parsed, timelineWeeks) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const strArr = (v, max, len) => (Array.isArray(v) ? v : [])
    .filter((s) => typeof s === 'string' && s.trim())
    .slice(0, max)
    .map((s) => s.slice(0, len));
  const staffing = p.staffing && typeof p.staffing === 'object' ? p.staffing : {};
  const roles = strArr(staffing.roles, 8, 80);
  return {
    mvp_scope: String(p.mvp_scope || '').slice(0, 1000),
    phase_1_features: strArr(p.phase_1_features, 9, 200),
    fast_launch_features: strArr(p.fast_launch_features, 5, 200),
    future_roadmap: strArr(p.future_roadmap, 6, 200),
    suggested_architecture: String(p.suggested_architecture || '').slice(0, 1000),
    suggested_stack: strArr(p.suggested_stack, 12, 80),
    recommended_ai_components: strArr(p.recommended_ai_components, 6, 120),
    staffing: {
      roles,
      headcount: Number.isInteger(staffing.headcount) ? staffing.headcount : (roles.length || null),
    },
    estimated_timeline_weeks: timelineWeeks,
    generated_by: 'deep-research-phase-3-mvp-planning',
  };
}

// Generate an MVP plan for a venture idea. Returns { plan, tokensUsed }.
// Throws if the AI call fails — the caller decides how to surface it.
async function generateMvpPlan(ventureIdea, ctx = {}) {
  // Deterministic timeline: prefer the execution readiness estimate; fall
  // back to deriving one from buildability so the plan always has a schedule.
  let timelineWeeks = ctx.executionReadiness && ctx.executionReadiness.mvp_timeline_weeks;
  if (!timelineWeeks) {
    const buildability01 = Number(
      ventureIdea.buildability_score != null ? ventureIdea.buildability_score : ventureIdea.buildabilityScore,
    ) || 0.5;
    timelineWeeks = executionReadiness.estimateTimelineWeeks(buildability01 * 100);
  }

  const { content, tokensUsed } = await aiProvider.chat(
    SYSTEM_PROMPT,
    buildUserPrompt(ventureIdea, ctx),
    { temperature: 0.5, maxTokens: 1800, operation: 'mvp_planning' },
  );
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.warn('mvpPlanning: AI returned non-JSON', { snippet: String(content).slice(0, 160) });
    parsed = {};
  }
  return { plan: sanitizePlan(parsed, timelineWeeks), tokensUsed };
}

module.exports = {
  buildUserPrompt,
  sanitizePlan,
  generateMvpPlan,
};
