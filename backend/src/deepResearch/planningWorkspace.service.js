// Deep Research Phase 6 — executive planning workspace orchestrator.
//
// Read-only assembly of the executive view: pulls every Phase 6 read into
// one payload the dashboard uses. Refresh writes happen in adaptiveRefresh;
// this file ONLY composes existing persisted state.

const adaptiveAnalytics = require('./adaptiveAnalytics.service');
const executiveIntervention = require('./executiveIntervention.service');
const strategicRecommendation = require('./strategicRecommendation.service');
const ventureHealth = require('./ventureHealth.service');
const forecastReality = require('./forecastReality.service');
const operationalDrift = require('./operationalDrift.service');
const dependencyReview = require('./dependencyReview.service');
const refreshHistory = require('./refreshHistory.service');

async function getPlanningWorkspace({ days = 30, accuracyDays = 90 } = {}) {
  const [
    analytics, interventions, strategicRecs, healthRows, accuracySummary,
    drift, openEdges, recentActions, recentRuns,
  ] = await Promise.all([
    adaptiveAnalytics.getAdaptiveAnalytics({ days }),
    executiveIntervention.listPending(),
    strategicRecommendation.listPending(),
    ventureHealth.getLatestHealth(),
    forecastReality.getLatestAccuracy({ days: accuracyDays }),
    operationalDrift.listPending(),
    dependencyReview.listOpenForReview({ limit: 50 }),
    dependencyReview.listRecentActions({ limit: 25 }),
    refreshHistory.listRecentRuns({ limit: 10 }),
  ]);
  // Health bucket counts for the at-a-glance card.
  const healthBuckets = {
    healthy: 0, strengthening: 0, at_risk: 0, overloaded: 0,
    stagnating: 0, declining: 0,
  };
  for (const h of healthRows) {
    if (healthBuckets[h.healthClassification] != null) {
      healthBuckets[h.healthClassification] += 1;
    }
  }
  return {
    generated_at: new Date().toISOString(),
    analytics,
    interventions: { pending: interventions, count: interventions.length },
    strategic_recommendations: { pending: strategicRecs, count: strategicRecs.length },
    venture_health: { rows: healthRows, buckets: healthBuckets, count: healthRows.length },
    forecast_accuracy: accuracySummary,
    operational_drift: { pending: drift, count: drift.length },
    dependency_review: {
      open_edges: openEdges, open_count: openEdges.length,
      recent_actions: recentActions,
    },
    refresh_history: { recent_runs: recentRuns },
  };
}

module.exports = { getPlanningWorkspace };
