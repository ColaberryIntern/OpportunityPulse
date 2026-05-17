// Deep Research Phase 15 — quality trend intelligence.
//
// Periodic snapshots of avg quality / groundedness / coherence / alignment
// across a rolling N-day window, comparing to the prior period to surface
// degradation warnings and improvement insights.

const { Op } = require('sequelize');
const {
  QualityTrend, QualitySnapshot, QualityAlert,
} = require('../models');
const logger = require('../logging/logger');

const DEFAULT_WINDOW_DAYS = 7;
const DEGRADATION_DROP = -8;   // points avg drop counts as degradation
const IMPROVEMENT_RISE = 8;    // points avg rise counts as improvement

function classifyDirection(delta) {
  if (delta <= DEGRADATION_DROP) return 'declining';
  if (delta >= IMPROVEMENT_RISE) return 'improving';
  return 'flat';
}

async function avgInWindow({ organizationId, since, until }) {
  const where = { computedAt: { [Op.gte]: since, [Op.lt]: until } };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await QualitySnapshot.findAll({ where, limit: 5000 });
  if (rows.length === 0) {
    return {
      count: 0,
      avg_quality: 0, avg_groundedness: 0,
      avg_coherence: 0, avg_alignment: 0,
    };
  }
  const avg = (k) => Math.round(rows.reduce((a, r) => a + (r[k] || 0), 0) / rows.length);
  return {
    count: rows.length,
    avg_quality: avg('compositeScore'),
    avg_groundedness: avg('groundednessScore'),
    avg_coherence: avg('coherenceScore'),
    avg_alignment: avg('alignmentScore'),
  };
}

async function snapshot({ organizationId = null, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const w = Math.max(1, Math.min(90, Number(windowDays) || DEFAULT_WINDOW_DAYS));
  const now = new Date();
  const since = new Date(now.getTime() - w * 86400_000);
  const priorSince = new Date(since.getTime() - w * 86400_000);

  const [current, prior] = await Promise.all([
    avgInWindow({ organizationId, since, until: now }),
    avgInWindow({ organizationId, since: priorSince, until: since }),
  ]);

  const delta = current.avg_quality - prior.avg_quality;
  const direction = classifyDirection(delta);
  const openAlerts = await QualityAlert.count({
    where: organizationId != null
      ? { organizationId: Number(organizationId), status: 'open' }
      : { status: 'open' },
  });

  const degradationWarnings = [];
  const improvementInsights = [];
  if (current.avg_groundedness - prior.avg_groundedness <= DEGRADATION_DROP) {
    degradationWarnings.push(`Groundedness dropped ${prior.avg_groundedness} → ${current.avg_groundedness} (${Math.abs(current.avg_groundedness - prior.avg_groundedness)} points)`);
  }
  if (current.avg_coherence - prior.avg_coherence <= DEGRADATION_DROP) {
    degradationWarnings.push(`Coherence dropped ${prior.avg_coherence} → ${current.avg_coherence}`);
  }
  if (current.avg_alignment - prior.avg_alignment <= DEGRADATION_DROP) {
    degradationWarnings.push(`Evaluator alignment dropped ${prior.avg_alignment} → ${current.avg_alignment}`);
  }
  if (current.avg_quality - prior.avg_quality >= IMPROVEMENT_RISE) {
    improvementInsights.push(`Composite quality improved ${prior.avg_quality} → ${current.avg_quality} (+${delta} points)`);
  }
  if (current.count > prior.count + 5) {
    improvementInsights.push(`Quality coverage expanded: ${prior.count} → ${current.count} snapshots in the window`);
  }

  let row = null;
  try {
    row = await QualityTrend.create({
      organizationId: organizationId == null ? null : Number(organizationId),
      windowDays: w,
      avgQualityScore: current.avg_quality,
      avgGroundednessScore: current.avg_groundedness,
      avgCoherenceScore: current.avg_coherence,
      avgAlignmentScore: current.avg_alignment,
      openAlerts,
      qualityDeltaVsPrior: delta,
      direction,
      degradationWarnings, improvementInsights,
      computedInputs: { current, prior },
    });
  } catch (e) {
    logger.warn('qualityTrend.snapshot persist failed', { error: e.message });
  }
  return {
    window_days: w,
    current, prior,
    quality_delta_vs_prior: delta,
    direction,
    degradation_warnings: degradationWarnings,
    improvement_insights: improvementInsights,
    open_alerts: openAlerts,
    snapshot_id: row ? row.id : null,
  };
}

async function recentSnapshots({ organizationId = null, limit = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await QualityTrend.findAll({
    where, order: [['captured_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 30),
  });
  return rows.map((r) => r.toJSON());
}

async function summarize({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const latest = await QualityTrend.findOne({ where, order: [['captured_at', 'DESC']] });
  return {
    latest: latest ? latest.toJSON() : null,
    degradation_threshold: DEGRADATION_DROP,
    improvement_threshold: IMPROVEMENT_RISE,
  };
}

module.exports = {
  DEFAULT_WINDOW_DAYS, DEGRADATION_DROP, IMPROVEMENT_RISE,
  classifyDirection, avgInWindow, snapshot,
  recentSnapshots, summarize,
};
