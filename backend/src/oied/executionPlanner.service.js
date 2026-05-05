// Blueprint → Execution. Pure deterministic mapping (no LLM call):
//   - each feature in blueprint.features becomes one task
//   - assigned_agent picked by keyword match against blueprint.required_agents
//   - estimated_days = total_days / numTasks (rounded; remainder on the last)
//   - tasks involving data/infra sort first; dashboard/UI tasks sort last
//
// Persisted into execution_plans (one row per bundle, unique on bundle_id).
// status flows: draft → in_progress → completed (cancelled is the escape).

const logger = require('../logging/logger');
const { Bundle, ExecutionPlan } = require('../models');
const profileSvc = require('./profile.service');

// Keyword groups → preferred role label. Probed in order; first hit wins.
const AGENT_RULES = [
  {
    role: 'Data Engineer',
    keywords: ['data', 'etl', 'pipeline', 'integration', 'ingest', 'warehouse', 'lakehouse'],
  },
  {
    role: 'AI/ML Engineer',
    keywords: ['ml', 'machine learning', 'model', 'predict', 'classifier', 'inference', 'ai-driven', 'ai/ml'],
  },
  {
    role: 'Frontend Engineer',
    keywords: ['dashboard', 'frontend', 'ui', 'report', 'visualization', 'chart', 'page', 'screen'],
  },
  {
    role: 'Compliance Lead',
    keywords: ['compliance', 'audit', 'secure', 'access', 'encryption', 'consent', 'authorization'],
  },
  {
    role: 'Backend Engineer',
    keywords: ['api', 'backend', 'service', 'infra', 'deployment', 'auth', 'queue', 'job'],
  },
];

// Pure: pick the best-match agent for a given feature string. Falls back
// to the first entry of `availableAgents` (which comes from the bundle's
// blueprint.required_agents).
function pickAgentForFeature(feature, availableAgents = []) {
  const text = String(feature || '').toLowerCase();
  for (const rule of AGENT_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        // If the role appears in availableAgents (case-insensitive), use
        // it verbatim; else use our canonical label.
        const match = availableAgents.find(
          (a) => String(a).toLowerCase() === rule.role.toLowerCase()
        );
        return match || rule.role;
      }
    }
  }
  return availableAgents.length > 0
    ? String(availableAgents[0])
    : 'AI Pilot Lead';
}

// Pure: order features so data/infra come first, dashboard/UI last,
// the rest preserve blueprint order.
function orderFeatures(features = []) {
  const PRE  = /(data|etl|pipeline|integration|ingest|infra|deployment)/i;
  const POST = /(dashboard|ui|frontend|report|visualization|export)/i;
  const indexed = features.map((f, i) => ({ f, i }));
  return indexed
    .map((x) => ({
      ...x,
      tier: PRE.test(x.f) ? 0 : POST.test(x.f) ? 2 : 1,
    }))
    .sort((a, b) => (a.tier - b.tier) || (a.i - b.i))
    .map((x) => x.f);
}

// Pure: build the {tasks, timeline, assigned_agents} payload from a
// blueprint snapshot. now() defaults to current time so the start_date is
// stable in tests when injected.
function buildPlanFromBlueprint(blueprint, { now = new Date() } = {}) {
  if (!blueprint || !blueprint.mvp_scope) {
    throw new Error('blueprint missing mvp_scope — generate a blueprint first');
  }
  const features = Array.isArray(blueprint.features) && blueprint.features.length > 0
    ? blueprint.features
    : [blueprint.mvp_scope]; // fallback: one task = the MVP scope itself
  const ordered = orderFeatures(features);

  const totalWeeks = Math.max(1, Number(blueprint.time_to_market_weeks) || 12);
  const totalDays = totalWeeks * 7;
  const baseDays = Math.max(1, Math.floor(totalDays / ordered.length));
  let runningOffset = 0;

  const availableAgents = Array.isArray(blueprint.required_agents)
    ? blueprint.required_agents
    : [];

  const tasks = ordered.map((feature, idx) => {
    // Last task absorbs the remainder so cumulative offsets sum to totalDays.
    const days = idx === ordered.length - 1
      ? Math.max(1, totalDays - runningOffset)
      : baseDays;
    const task = {
      title: String(feature).slice(0, 200),
      assigned_agent: pickAgentForFeature(feature, availableAgents),
      estimated_days: days,
      start_offset_days: runningOffset,
    };
    runningOffset += days;
    return task;
  });

  const startDate = new Date(now);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + totalDays * 86400000);

  // Distinct agents actually assigned, in first-appearance order.
  const seen = new Set();
  const assignedAgents = [];
  for (const t of tasks) {
    if (!seen.has(t.assigned_agent)) {
      seen.add(t.assigned_agent);
      assignedAgents.push(t.assigned_agent);
    }
  }

  return {
    tasks,
    timeline: {
      total_weeks: totalWeeks,
      total_days: totalDays,
      start_date: startDate.toISOString().slice(0, 10),
      end_date:   endDate.toISOString().slice(0, 10),
    },
    assigned_agents: assignedAgents,
  };
}

async function generateExecutionPlan(bundleId, {
  organizationId,
  userId = null,
  force = false,
  now = new Date(),
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  const bundle = await Bundle.findByPk(bundleId);
  if (!bundle) throw new Error(`bundle ${bundleId} not found`);
  const blueprint = bundle.blueprint || {};
  if (!blueprint.mvp_scope) {
    throw new Error('bundle has no blueprint yet — generate a blueprint first');
  }

  // Existing plan? Re-use unless force=true (and bundle.status is mutable).
  let plan = await ExecutionPlan.findOne({ where: { bundleId } });
  if (plan && !force) {
    return {
      cached: true,
      bundleId,
      plan: plan.toJSON ? plan.toJSON() : plan,
    };
  }

  const computed = buildPlanFromBlueprint(blueprint, { now });
  if (!plan) {
    plan = await ExecutionPlan.create({
      bundleId,
      organizationId: orgId,
      status: 'draft',
      tasks: computed.tasks,
      timeline: computed.timeline,
      assignedAgents: computed.assigned_agents,
    });
  } else {
    plan.tasks = computed.tasks;
    plan.timeline = computed.timeline;
    plan.assignedAgents = computed.assigned_agents;
    plan.status = plan.status === 'draft' ? 'draft' : plan.status;
    await plan.save();
  }

  logger.info('executionPlanner: plan generated', {
    bundleId, orgId, tasks: computed.tasks.length, totalDays: computed.timeline.total_days,
  });
  return {
    cached: false,
    bundleId,
    plan: plan.toJSON ? plan.toJSON() : plan,
  };
}

async function getExecutionPlan(bundleId) {
  const plan = await ExecutionPlan.findOne({ where: { bundleId } });
  return plan ? (plan.toJSON ? plan.toJSON() : plan) : null;
}

async function startBuild(bundleId, { now = new Date() } = {}) {
  const plan = await ExecutionPlan.findOne({ where: { bundleId } });
  if (!plan) throw new Error(`no execution plan for bundle ${bundleId}`);
  if (plan.status === 'in_progress') {
    return { alreadyStarted: true, plan: plan.toJSON ? plan.toJSON() : plan };
  }
  plan.status = 'in_progress';
  plan.startedAt = now;
  await plan.save();
  logger.info('executionPlanner: build started', { bundleId });
  return { alreadyStarted: false, plan: plan.toJSON ? plan.toJSON() : plan };
}

async function listExecutionPlans({ organizationId } = {}) {
  const where = {};
  if (organizationId) where.organizationId = organizationId;
  const rows = await ExecutionPlan.findAll({ where, order: [['updatedAt', 'DESC']] });
  return rows.map((r) => (r.toJSON ? r.toJSON() : r));
}

module.exports = {
  generateExecutionPlan,
  getExecutionPlan,
  startBuild,
  listExecutionPlans,
  buildPlanFromBlueprint,
  pickAgentForFeature,
  orderFeatures,
  AGENT_RULES,
};
