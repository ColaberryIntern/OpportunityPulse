// Deep Research Phase 4 — resource capacity intelligence.
//
// Deterministic. Aggregates the staffing + infrastructure demand from every
// active venture's Phase 3 executionReadiness assessment and compares it
// against a configurable organizational supply. Answers "can we realistically
// execute all the BUILD_NOW ventures?" by computing staffing + infrastructure
// pressure scores, a concurrency limit, and a bottleneck list.

const { VentureIdea, ExecutionReadiness } = require('../models');

// Organizational supply — the staffing capacity the org realistically has.
// Configurable via env so different deployments can model their own roster.
function loadSupply() {
  const headcount = Number(process.env.DEEP_RESEARCH_ORG_HEADCOUNT) || 5;
  return {
    total_headcount: headcount,
    // Per-role supply (heuristic small-team default — env override below).
    roles: parseSupplyEnv() || {
      'tech lead': 1,
      'full-stack engineer': 2,
      'ai/ml engineer': 1,
      'second engineer': 1,
      'product owner (part-time)': 1,
      'solution architect (advisory)': 1,
    },
    infra_slots: Number(process.env.DEEP_RESEARCH_ORG_INFRA_CAPACITY) || 8,
    avg_team_size: Number(process.env.DEEP_RESEARCH_AVG_TEAM_SIZE) || 3,
  };
}

// DEEP_RESEARCH_ORG_ROLES env format: "tech lead:1,full-stack engineer:2,..."
function parseSupplyEnv() {
  const raw = process.env.DEEP_RESEARCH_ORG_ROLES;
  if (!raw) return null;
  const supply = {};
  for (const pair of String(raw).split(',')) {
    const [role, n] = pair.split(':').map((s) => s.trim());
    if (role && Number.isInteger(Number(n))) supply[role.toLowerCase()] = Number(n);
  }
  return Object.keys(supply).length ? supply : null;
}

// Lifecycle states that genuinely consume capacity right now.
const ACTIVE_STATES = new Set([
  'evaluating', 'approved', 'generating_requirements',
  'planning_mvp', 'building', 'validating', 'launching',
]);

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

// Aggregate per-role demand across the active venture set. Each venture's
// executionReadiness.staffing contributes one head per listed role.
function aggregateDemand(readinessRows, ventureMap) {
  const roleDemand = {};
  let totalHeadcount = 0;
  let infraDemand = 0;
  for (const er of readinessRows) {
    const v = ventureMap.get(er.ventureIdeaId);
    if (!v || !ACTIVE_STATES.has(v.lifecycleState)) continue;
    const staffing = er.staffing || {};
    const roles = Array.isArray(staffing.roles) ? staffing.roles : [];
    totalHeadcount += Number(staffing.headcount) || roles.length;
    for (const role of roles) {
      const key = String(role || '').toLowerCase().trim();
      if (!key) continue;
      roleDemand[key] = (roleDemand[key] || 0) + 1;
    }
    const infraItems = (er.infrastructure && Array.isArray(er.infrastructure.items))
      ? er.infrastructure.items.length : 0;
    infraDemand += infraItems;
  }
  return { roleDemand, totalHeadcount, infraDemand };
}

// Identify bottlenecks: roles where demand exceeds supply, or aggregate
// pressure crosses the warning thresholds.
function identifyBottlenecks(roleDemand, supply, staffingPressure, infraPressure) {
  const bottlenecks = [];
  for (const [role, demand] of Object.entries(roleDemand)) {
    const roleSupply = supply.roles[role] || 0;
    if (roleSupply === 0 && demand > 0) {
      bottlenecks.push({
        type: 'missing_role', label: `${role} (no in-house supply, ${demand} venture demand)`,
        severity: 90, role, demand, supply: 0, deficit: demand,
      });
    } else if (demand > roleSupply * 1.5) {
      bottlenecks.push({
        type: 'role_deficit', label: `${role}: ${demand} demand vs ${roleSupply} supply`,
        severity: Math.min(100, Math.round((demand / Math.max(1, roleSupply)) * 40 + 20)),
        role, demand, supply: roleSupply, deficit: demand - roleSupply,
      });
    }
  }
  if (staffingPressure >= 80) {
    bottlenecks.push({ type: 'staffing_pressure', label: `Staffing pressure ${staffingPressure} — over capacity`, severity: 85 });
  }
  if (infraPressure >= 80) {
    bottlenecks.push({ type: 'infra_pressure', label: `Infrastructure pressure ${infraPressure} — over capacity`, severity: 75 });
  }
  return bottlenecks.sort((a, b) => b.severity - a.severity);
}

// Compute the capacity snapshot. Pure — given inputs, returns the snapshot.
function computeCapacity(readinessRows, ventureIdeas, supply = loadSupply()) {
  const ventureMap = new Map(ventureIdeas.map((v) => [v.id, v]));
  const { roleDemand, totalHeadcount, infraDemand } = aggregateDemand(readinessRows, ventureMap);

  const activeVentures = ventureIdeas.filter((v) => ACTIVE_STATES.has(v.lifecycleState)).length;
  // BUILD_NOW count from the persisted decision on the readiness breakdown.
  const buildNowVentures = readinessRows.filter((er) => {
    const v = ventureMap.get(er.ventureIdeaId);
    if (!v || !ACTIVE_STATES.has(v.lifecycleState)) return false;
    return er.breakdown && er.breakdown.decision && er.breakdown.decision.decision === 'BUILD_NOW';
  }).length;

  // staffing_pressure: total demand vs total supply, soft-capped at 100.
  const staffingPressure = clamp100(
    supply.total_headcount > 0 ? (totalHeadcount / supply.total_headcount) * 100 : 100,
  );
  const infraPressure = clamp100(
    supply.infra_slots > 0 ? (infraDemand / supply.infra_slots) * 100 : 100,
  );
  // concurrency_limit: how many ventures fit into the org headcount.
  const concurrencyLimit = supply.avg_team_size > 0
    ? Math.max(1, Math.floor(supply.total_headcount / supply.avg_team_size))
    : 1;

  // Build the explainable role demand object: per role → demand/supply/deficit.
  const roleDemandDetailed = {};
  for (const [role, demand] of Object.entries(roleDemand)) {
    const s = supply.roles[role] || 0;
    roleDemandDetailed[role] = { demand, supply: s, deficit: Math.max(0, demand - s) };
  }

  const bottlenecks = identifyBottlenecks(roleDemand, supply, staffingPressure, infraPressure);

  let rationale;
  if (buildNowVentures === 0) {
    rationale = 'No BUILD_NOW ventures right now — capacity uncommitted.';
  } else if (buildNowVentures <= concurrencyLimit && staffingPressure < 80) {
    rationale = `${buildNowVentures} BUILD_NOW venture${buildNowVentures === 1 ? '' : 's'} `
      + `within concurrency limit ${concurrencyLimit}; staffing pressure ${staffingPressure} is healthy.`;
  } else {
    rationale = `${buildNowVentures} BUILD_NOW ventures vs concurrency limit ${concurrencyLimit} — `
      + `cannot execute all in parallel. Staffing pressure ${staffingPressure}, infra ${infraPressure}.`;
  }

  return {
    staffing_pressure: staffingPressure,
    infra_pressure: infraPressure,
    concurrency_limit: concurrencyLimit,
    active_ventures: activeVentures,
    build_now_ventures: buildNowVentures,
    role_demand: roleDemandDetailed,
    bottlenecks,
    rationale,
    supply,
  };
}

// Run the assessment + persist a snapshot row. Returns the snapshot.
async function assessCapacity() {
  const ventureIdeas = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const snapshot = computeCapacity(readinessRows, ventureIdeas);
  const { ResourceCapacitySnapshot } = require('../models');
  await ResourceCapacitySnapshot.create({
    staffingPressure: snapshot.staffing_pressure,
    infraPressure: snapshot.infra_pressure,
    concurrencyLimit: snapshot.concurrency_limit,
    activeVentures: snapshot.active_ventures,
    buildNowVentures: snapshot.build_now_ventures,
    roleDemand: snapshot.role_demand,
    bottlenecks: snapshot.bottlenecks,
    rationale: snapshot.rationale,
  });
  return snapshot;
}

// Read the latest snapshot for the dashboard.
async function getLatestSnapshot() {
  const { ResourceCapacitySnapshot } = require('../models');
  const row = await ResourceCapacitySnapshot.findOne({ order: [['created_at', 'DESC']] });
  return row ? row.toJSON() : null;
}

module.exports = {
  ACTIVE_STATES,
  loadSupply,
  aggregateDemand,
  identifyBottlenecks,
  computeCapacity,
  assessCapacity,
  getLatestSnapshot,
};
