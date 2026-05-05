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

// ---- v6: Dynamic execution planning ------------------------------------

// Per-task complexity weight. Long descriptions + complex keywords
// (real-time, ML, encryption) bump it; simple keywords (dashboard,
// report) trim it. Floored at 0.5 so even trivial features don't
// vanish from the schedule.
const COMPLEX_KEYWORDS = /\b(real-time|machine learning|integration|encryption|secure|predictive|model|inference)\b/i;
const SIMPLE_KEYWORDS  = /\b(dashboard|report|export|simple|view|display|chart)\b/i;

function complexityWeight(feature) {
  let w = 1;
  const f = String(feature || '');
  if (f.length > 80) w += 0.5;
  if (COMPLEX_KEYWORDS.test(f)) w += 0.5;
  if (SIMPLE_KEYWORDS.test(f)) w -= 0.2;
  return Math.max(0.5, Number(w.toFixed(2)));
}

// Pure: rebalance assignments so that fallback-agent tasks (where the
// keyword match didn't bind to a specific role) move to the
// underloaded agents. Tasks bound to a specific role by keyword are
// left alone.
function rebalanceAssignments(tasks, availableAgents, fallbackAgent) {
  if (!Array.isArray(availableAgents) || availableAgents.length < 2) return tasks;
  const counts = new Map();
  for (const a of availableAgents) counts.set(a, 0);
  for (const t of tasks) counts.set(t.assigned_agent, (counts.get(t.assigned_agent) || 0) + 1);

  // Walk through fallback-assigned tasks; reassign to whoever has the
  // lowest count (and isn't already over-loaded).
  for (const t of tasks) {
    if (t.assigned_agent !== fallbackAgent) continue;
    let best = null;
    let bestCount = Infinity;
    for (const [agent, c] of counts) {
      if (agent === fallbackAgent) continue;
      if (c < bestCount) { best = agent; bestCount = c; }
    }
    if (best && bestCount < (counts.get(fallbackAgent) || 0)) {
      counts.set(fallbackAgent, counts.get(fallbackAgent) - 1);
      counts.set(best, bestCount + 1);
      t.assigned_agent = best;
    }
  }
  return tasks;
}

// Pure: greedy parallel-wave packer. Each task slots into the smallest
// wave whose agent set doesn't already include this task's
// assigned_agent. Returns tasks with `parallel_group` (0..N) attached.
// Wave duration = max estimated_days within the wave; subsequent
// waves start when the prior wave's longest task ends.
function assignParallelGroups(tasks) {
  // wave[i] = Set of agents busy in wave i.
  const waves = [];
  for (const t of tasks) {
    let placed = false;
    for (let i = 0; i < waves.length; i += 1) {
      if (!waves[i].has(t.assigned_agent)) {
        waves[i].add(t.assigned_agent);
        t.parallel_group = i;
        placed = true;
        break;
      }
    }
    if (!placed) {
      waves.push(new Set([t.assigned_agent]));
      t.parallel_group = waves.length - 1;
    }
  }

  // Now compute start_offset_days: each wave starts when the prior
  // wave's longest task ends.
  const waveDurations = [];
  for (let i = 0; i < waves.length; i += 1) {
    const inWave = tasks.filter((t) => t.parallel_group === i);
    const dur = Math.max(0, ...inWave.map((t) => t.estimated_days || 0));
    waveDurations.push(dur);
  }
  const cumulativeStart = [0];
  for (let i = 1; i <= waveDurations.length; i += 1) {
    cumulativeStart.push(cumulativeStart[i - 1] + waveDurations[i - 1]);
  }
  for (const t of tasks) {
    t.start_offset_days = cumulativeStart[t.parallel_group];
  }
  const criticalPathDays = cumulativeStart[waveDurations.length] || 0;
  return { tasks, criticalPathDays, waveCount: waves.length };
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

  const availableAgents = Array.isArray(blueprint.required_agents)
    ? blueprint.required_agents
    : [];
  const fallbackAgent = availableAgents.length > 0
    ? String(availableAgents[0])
    : 'AI Pilot Lead';

  // ---- Step 1: assign agent + complexity per task ------------------
  const draftTasks = ordered.map((feature) => ({
    title: String(feature).slice(0, 200),
    assigned_agent: pickAgentForFeature(feature, availableAgents),
    complexity: complexityWeight(feature),
  }));

  // ---- Step 2: rebalance fallback-agent tasks to underloaded agents
  rebalanceAssignments(draftTasks, availableAgents, fallbackAgent);

  // ---- Step 3: distribute totalDays proportional to complexity ----
  const totalWeight = draftTasks.reduce((s, t) => s + t.complexity, 0) || 1;
  let allocated = 0;
  draftTasks.forEach((t, i) => {
    if (i === draftTasks.length - 1) {
      // Last task absorbs the rounding remainder so weights sum to total.
      t.estimated_days = Math.max(1, totalDays - allocated);
    } else {
      t.estimated_days = Math.max(1, Math.round((totalDays * t.complexity) / totalWeight));
      allocated += t.estimated_days;
    }
  });

  // ---- Step 4: greedy parallel packing -----------------------------
  const { tasks, criticalPathDays } = assignParallelGroups(draftTasks);

  const startDate = new Date(now);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + criticalPathDays * 86_400_000);

  // Distinct agents actually assigned, in first-appearance order.
  const seen = new Set();
  const assignedAgents = [];
  for (const t of tasks) {
    if (!seen.has(t.assigned_agent)) {
      seen.add(t.assigned_agent);
      assignedAgents.push(t.assigned_agent);
    }
  }

  // parallel_efficiency = serial duration / critical-path duration.
  // Always >= 1.0 (with critical path floored at 1d).
  const parallelEfficiency = criticalPathDays > 0
    ? Number((totalDays / Math.max(1, criticalPathDays)).toFixed(2))
    : 1;

  return {
    tasks,
    timeline: {
      total_weeks: totalWeeks,
      total_days: criticalPathDays,
      serial_total_days: totalDays,
      parallel_efficiency: parallelEfficiency,
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
  // v6
  complexityWeight,
  rebalanceAssignments,
  assignParallelGroups,
  AGENT_RULES,
};
