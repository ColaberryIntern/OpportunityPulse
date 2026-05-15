// Deep Research Phase 5 — strategic drift detection.
//
// Deterministic. Five drift checks run against the current portfolio state;
// each produces a drift_alert row if its threshold trips. CRUCIALLY: every
// alert is a RECOMMENDATION only. The system never auto-rebalances, never
// auto-archives, never auto-anything. A human decides.

const { Op } = require('sequelize');
const {
  VentureIdea, ExecutionReadiness, ResourceCapacitySnapshot, VentureTemplate,
  DriftAlert,
} = require('../models');

const DRIFT_TYPES = [
  'ecosystem_overcommitment',
  'risk_concentration',
  'execution_overload',
  'portfolio_imbalance',
  'strategy_drift',
];

// Default thresholds — env-overridable per deployment.
const ECOSYSTEM_DOMINANCE_THRESHOLD = Number(process.env.DEEP_RESEARCH_ECOSYSTEM_DOMINANCE) || 0.5;
const RISK_CONCENTRATION_THRESHOLD = Number(process.env.DEEP_RESEARCH_RISK_CONCENTRATION) || 0.4;
const STAFFING_OVERLOAD_THRESHOLD = Number(process.env.DEEP_RESEARCH_STAFFING_OVERLOAD) || 85;
const IMBALANCE_MIN_ECOSYSTEMS = Number(process.env.DEEP_RESEARCH_MIN_ECOSYSTEMS) || 2;
const STRATEGY_DRIFT_STUCK_DAYS = Number(process.env.DEEP_RESEARCH_STRATEGY_STUCK_DAYS) || 45;

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));
const DAY = 86400000;

// Each check is pure given inputs and returns a partial drift_alert (or null).

function checkEcosystemOvercommitment({ ventures, templates }) {
  const activeCount = ventures.filter((v) => v.lifecycleState !== 'archived').length;
  if (activeCount === 0) return null;
  let topEcosystem = null;
  let topCount = 0;
  for (const t of templates) {
    const ids = Array.isArray(t.applicableTo) ? t.applicableTo : (t.applicable_to || []);
    const inEcosystem = ventures.filter(
      (v) => ids.includes(v.id) && v.lifecycleState !== 'archived',
    ).length;
    if (inEcosystem > topCount) {
      topCount = inEcosystem; topEcosystem = t;
    }
  }
  if (!topEcosystem) return null;
  const fraction = topCount / activeCount;
  if (fraction < ECOSYSTEM_DOMINANCE_THRESHOLD) return null;
  return {
    driftType: 'ecosystem_overcommitment',
    severity: clamp100(fraction * 100),
    description: `${topCount} of ${activeCount} active ventures (${Math.round(fraction * 100)}%) `
      + `cluster in the "${topEcosystem.label}" ecosystem.`,
    recommendation: 'Consider diversifying into adjacent ecosystems — the portfolio is concentrated.',
    relatedEcosystems: [topEcosystem.templateKey],
    relatedVentureIds: ventures
      .filter((v) => (topEcosystem.applicableTo || []).includes(v.id))
      .map((v) => v.id),
  };
}

function checkRiskConcentration({ ventures, readinessByVenture }) {
  const active = ventures.filter((v) => v.lifecycleState !== 'archived');
  if (active.length === 0) return null;
  const riskyDecisions = new Set(['HIGH_RISK', 'OVERSATURATED', 'TOO_EARLY']);
  const risky = active.filter((v) => {
    const er = readinessByVenture.get(v.id);
    const decision = er && er.breakdown && er.breakdown.decision
      && er.breakdown.decision.decision;
    return riskyDecisions.has(decision);
  });
  const fraction = risky.length / active.length;
  if (fraction < RISK_CONCENTRATION_THRESHOLD) return null;
  return {
    driftType: 'risk_concentration',
    severity: clamp100(fraction * 100),
    description: `${risky.length} of ${active.length} active ventures (${Math.round(fraction * 100)}%) `
      + 'carry HIGH_RISK / OVERSATURATED / TOO_EARLY decisions.',
    recommendation: 'Reassess or archive the risky ventures — too much of the portfolio is in flagged territory.',
    relatedVentureIds: risky.map((v) => v.id),
  };
}

function checkExecutionOverload({ capacitySnapshot }) {
  if (!capacitySnapshot) return null;
  const staffing = Number(capacitySnapshot.staffingPressure || capacitySnapshot.staffing_pressure) || 0;
  if (staffing < STAFFING_OVERLOAD_THRESHOLD) return null;
  return {
    driftType: 'execution_overload',
    severity: clamp100(staffing),
    description: `Staffing pressure ${Math.round(staffing)} — the org is over capacity.`,
    recommendation: 'Either hire (see capacity plan), defer queued ventures, or both. '
      + 'The portfolio cannot execute everything that\'s been promised.',
  };
}

function checkPortfolioImbalance({ ventures, templates }) {
  const active = ventures.filter((v) => v.lifecycleState !== 'archived');
  if (active.length === 0) return null;
  // Count ecosystems with at least one active venture.
  const ecosystemsWithActive = templates.filter((t) => {
    const ids = Array.isArray(t.applicableTo) ? t.applicableTo : (t.applicable_to || []);
    return active.some((v) => ids.includes(v.id));
  });
  if (ecosystemsWithActive.length >= IMBALANCE_MIN_ECOSYSTEMS && active.length >= 3) return null;
  if (active.length < 3) return null; // not enough ventures to call it imbalanced
  return {
    driftType: 'portfolio_imbalance',
    severity: clamp100(60 + (IMBALANCE_MIN_ECOSYSTEMS - ecosystemsWithActive.length) * 15),
    description: `Only ${ecosystemsWithActive.length} ecosystem(s) have active ventures `
      + `(${IMBALANCE_MIN_ECOSYSTEMS}+ recommended).`,
    recommendation: 'Diversify — the portfolio is concentrated in too few patterns.',
  };
}

function checkStrategyDrift({ ventures, lifecycleEventsByVenture }) {
  const stuckStates = new Set([
    'evaluating', 'approved', 'generating_requirements', 'planning_mvp',
  ]);
  const now = Date.now();
  const stuck = ventures.filter((v) => {
    if (!stuckStates.has(v.lifecycleState)) return false;
    const events = lifecycleEventsByVenture.get(v.id) || [];
    const lastEvent = events[events.length - 1];
    const lastChange = lastEvent ? new Date(lastEvent.createdAt).getTime()
      : new Date(v.createdAt || 0).getTime();
    const stuckDays = (now - lastChange) / DAY;
    return stuckDays >= STRATEGY_DRIFT_STUCK_DAYS;
  });
  if (stuck.length === 0) return null;
  return {
    driftType: 'strategy_drift',
    severity: clamp100(40 + stuck.length * 15),
    description: `${stuck.length} venture(s) stuck in their lifecycle state for `
      + `${STRATEGY_DRIFT_STUCK_DAYS}+ days.`,
    recommendation: 'Decide — either advance these or archive them. Stagnation costs portfolio capacity.',
    relatedVentureIds: stuck.map((v) => v.id),
  };
}

// Run all five checks + persist any tripping alerts (deduped on type +
// matching related venture set so we don't pile up identical pending rows).
async function detectDrift() {
  const [
    ventures, readinessRows, templates, capacitySnapshot, lifecycleEventsRaw,
  ] = await Promise.all([
    VentureIdea.findAll(),
    ExecutionReadiness.findAll(),
    VentureTemplate.findAll(),
    ResourceCapacitySnapshot.findOne({ order: [['created_at', 'DESC']] }),
    require('../models').VentureLifecycleEvent.findAll({ order: [['created_at', 'ASC']] }),
  ]);
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));
  const lifecycleEventsByVenture = new Map();
  for (const e of lifecycleEventsRaw) {
    if (!lifecycleEventsByVenture.has(e.ventureIdeaId)) {
      lifecycleEventsByVenture.set(e.ventureIdeaId, []);
    }
    lifecycleEventsByVenture.get(e.ventureIdeaId).push(e);
  }

  const cap = capacitySnapshot ? capacitySnapshot.toJSON() : null;
  const checks = [
    () => checkEcosystemOvercommitment({ ventures, templates }),
    () => checkRiskConcentration({ ventures, readinessByVenture }),
    () => checkExecutionOverload({ capacitySnapshot: cap }),
    () => checkPortfolioImbalance({ ventures, templates }),
    () => checkStrategyDrift({ ventures, lifecycleEventsByVenture }),
  ];

  const alerts = [];
  for (const check of checks) {
    const alert = check();
    if (!alert) continue;
    // Dedupe: skip if an open pending alert of this type already exists.
    // eslint-disable-next-line no-await-in-loop
    const existing = await DriftAlert.findOne({
      where: { driftType: alert.driftType, status: 'pending' },
    });
    if (existing) {
      // Update the existing row with the fresh severity + recommendation.
      // eslint-disable-next-line no-await-in-loop
      await existing.update(alert);
      alerts.push(existing.toJSON());
    } else {
      // eslint-disable-next-line no-await-in-loop
      const row = await DriftAlert.create({ ...alert, status: 'pending' });
      alerts.push(row.toJSON());
    }
  }
  return { alerts, computed_at: new Date() };
}

async function listPendingAlerts() {
  const rows = await DriftAlert.findAll({
    where: { status: 'pending' }, order: [['severity', 'DESC']],
  });
  return rows.map((r) => r.toJSON());
}

async function acknowledgeAlert(id, actor = null) {
  const row = await DriftAlert.findByPk(id);
  if (!row) { const err = new Error(`Drift alert ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.update({ status: 'acknowledged', acknowledgedBy: actor, acknowledgedAt: new Date() });
  return row.toJSON();
}
async function dismissAlert(id, actor = null) {
  const row = await DriftAlert.findByPk(id);
  if (!row) { const err = new Error(`Drift alert ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.update({ status: 'dismissed', acknowledgedBy: actor, acknowledgedAt: new Date() });
  return row.toJSON();
}

module.exports = {
  DRIFT_TYPES,
  ECOSYSTEM_DOMINANCE_THRESHOLD,
  RISK_CONCENTRATION_THRESHOLD,
  STAFFING_OVERLOAD_THRESHOLD,
  IMBALANCE_MIN_ECOSYSTEMS,
  STRATEGY_DRIFT_STUCK_DAYS,
  checkEcosystemOvercommitment,
  checkRiskConcentration,
  checkExecutionOverload,
  checkPortfolioImbalance,
  checkStrategyDrift,
  detectDrift,
  listPendingAlerts,
  acknowledgeAlert,
  dismissAlert,
};
