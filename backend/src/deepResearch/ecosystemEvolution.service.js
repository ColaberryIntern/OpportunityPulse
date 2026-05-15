// Deep Research Phase 5 — ecosystem evolution tracking.
//
// Deterministic. Uses the Phase 4 venture_templates as ecosystem keys (one
// template = one ecosystem). For each ecosystem with matching ventures,
// computes three 0-100 scores — health, maturity, momentum — and a
// classification (emerging / accelerating / saturated / declining / dying /
// converging). Persists to ecosystem_metrics for the temporal view.

const { Op } = require('sequelize');
const {
  VentureTemplate, VentureIdea, ExecutionReadiness, ConfidenceHistory,
  EcosystemMetric,
} = require('../models');

// Lifecycle state → 0-100 maturity progress (how far down the build path).
const LIFECYCLE_PROGRESS = {
  discovered: 5,
  researching: 15,
  evaluating: 25,
  approved: 40,
  generating_requirements: 55,
  planning_mvp: 65,
  building: 80,
  validating: 90,
  launching: 95,
  monitoring: 100,
  archived: 0,
};

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

// Classify based on the three scores.
function classifyEcosystem({ healthScore, maturityScore, momentumScore, ventureCount, sharedVentureFraction }) {
  if (ventureCount === 0) return 'dying';
  if (sharedVentureFraction >= 0.6) return 'converging';
  if (momentumScore >= 65 && healthScore >= 50) return 'accelerating';
  if (maturityScore >= 70 && momentumScore < 30) return 'saturated';
  if (momentumScore < 30 && healthScore < 35) return 'declining';
  if (ventureCount <= 2 && maturityScore < 40) return 'emerging';
  return 'emerging';
}

// Compute the per-ecosystem snapshot. Pure given inputs.
function computeEcosystem(template, ventures, readinessByVenture, confidenceTrendByVenture, allTemplates) {
  const ids = Array.isArray(template.applicableTo) ? template.applicableTo
    : (Array.isArray(template.applicable_to) ? template.applicable_to : []);
  const ventureSet = new Set(ids);
  const matching = ventures.filter((v) => ventureSet.has(v.id));
  const ventureCount = matching.length;

  if (ventureCount === 0) {
    return {
      ecosystem_key: template.templateKey || template.template_key,
      label: template.label,
      venture_count: 0,
      health_score: 0,
      maturity_score: 0,
      momentum_score: 0,
      classification: 'dying',
      metadata: { reason: 'no matching ventures' },
    };
  }

  // Maturity — avg lifecycle progress across matching ventures.
  const maturityScore = clamp100(
    matching.reduce((s, v) => s + (LIFECYCLE_PROGRESS[v.lifecycleState] || 0), 0) / ventureCount,
  );

  // Health — avg execution readiness across matching ventures.
  const readinessValues = matching
    .map((v) => readinessByVenture.get(v.id))
    .filter((er) => er && er.executionReadinessScore != null)
    .map((er) => Number(er.executionReadinessScore));
  const healthScore = readinessValues.length
    ? clamp100(readinessValues.reduce((s, v) => s + v, 0) / readinessValues.length)
    : 0;

  // Momentum — mean confidence delta across matching ventures, mapped to 0-100.
  // A +20% confidence climb → momentum ~70; -20% → ~30; flat → ~50.
  const deltas = matching
    .map((v) => confidenceTrendByVenture.get(v.id))
    .filter((d) => d != null);
  const meanDelta = deltas.length
    ? deltas.reduce((s, d) => s + d, 0) / deltas.length
    : 0;
  const momentumScore = clamp100(50 + meanDelta * 100);

  // Convergence — fraction of this ecosystem's ventures also tagged by
  // another ecosystem.
  let sharedCount = 0;
  for (const v of matching) {
    const tagged = (allTemplates || []).filter((t) => {
      if (t.id === template.id) return false;
      const otherIds = Array.isArray(t.applicableTo) ? t.applicableTo : (t.applicable_to || []);
      return otherIds.includes(v.id);
    });
    if (tagged.length > 0) sharedCount += 1;
  }
  const sharedVentureFraction = ventureCount > 0 ? sharedCount / ventureCount : 0;

  const classification = classifyEcosystem({
    healthScore, maturityScore, momentumScore, ventureCount, sharedVentureFraction,
  });

  return {
    ecosystem_key: template.templateKey || template.template_key,
    label: template.label,
    venture_count: ventureCount,
    health_score: healthScore,
    maturity_score: maturityScore,
    momentum_score: momentumScore,
    classification,
    metadata: {
      mean_confidence_delta: Number(meanDelta.toFixed(3)),
      shared_venture_fraction: Number(sharedVentureFraction.toFixed(3)),
      ventures_with_readiness: readinessValues.length,
    },
  };
}

// Build the confidence delta map (last - first within window) per venture.
async function buildConfidenceDeltaMap({ days = 60 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await ConfidenceHistory.findAll({
    where: { computedAt: { [Op.gte]: since } },
    order: [['computed_at', 'ASC']],
  });
  const byVenture = new Map();
  for (const r of rows) {
    if (!byVenture.has(r.ventureIdeaId)) byVenture.set(r.ventureIdeaId, []);
    byVenture.get(r.ventureIdeaId).push(Number(r.confidence));
  }
  const deltaMap = new Map();
  for (const [id, series] of byVenture) {
    if (series.length < 2) continue;
    deltaMap.set(id, series[series.length - 1] - series[0]);
  }
  return deltaMap;
}

// Full analysis: compute every ecosystem, persist, return.
async function analyzeEcosystems({ confidenceWindowDays = 60 } = {}) {
  const [templates, ventures, readiness, confidenceTrend] = await Promise.all([
    VentureTemplate.findAll(),
    VentureIdea.findAll(),
    ExecutionReadiness.findAll(),
    buildConfidenceDeltaMap({ days: confidenceWindowDays }),
  ]);
  const readinessByVenture = new Map(readiness.map((r) => [r.ventureIdeaId, r]));

  const results = [];
  for (const t of templates) {
    const result = computeEcosystem(t, ventures, readinessByVenture, confidenceTrend, templates);
    // eslint-disable-next-line no-await-in-loop
    await EcosystemMetric.create({
      ecosystemKey: result.ecosystem_key,
      label: result.label,
      ventureCount: result.venture_count,
      healthScore: result.health_score,
      maturityScore: result.maturity_score,
      momentumScore: result.momentum_score,
      classification: result.classification,
      metadata: result.metadata,
    });
    results.push(result);
  }
  return { ecosystems: results, computed_at: new Date() };
}

// Read the latest snapshot per ecosystem.
async function getLatestEcosystems() {
  const rows = await EcosystemMetric.findAll({ order: [['computed_at', 'DESC']] });
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.ecosystemKey)) seen.set(r.ecosystemKey, r.toJSON());
  }
  return Array.from(seen.values()).sort((a, b) => b.momentumScore - a.momentumScore);
}

module.exports = {
  LIFECYCLE_PROGRESS,
  classifyEcosystem,
  computeEcosystem,
  buildConfidenceDeltaMap,
  analyzeEcosystems,
  getLatestEcosystems,
};
