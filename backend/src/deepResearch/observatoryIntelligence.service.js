// Deep Research Phase 5 — observatory orchestrator.
//
// Runs every Phase 5 engine in dependency order + captures the temporal
// snapshots / signal history that drive the over-time views. Reads
// (getObservatoryDashboard) assemble the full ecosystem-observatory payload.
//
// Like the Phase 4 portfolioIntelligence orchestrator, each step is
// independently failable — fault-tolerant orchestration.

const logger = require('../logging/logger');
const temporalIntelligence = require('./temporalIntelligence.service');
const historicalPortfolio = require('./historicalPortfolio.service');
const ecosystemEvolution = require('./ecosystemEvolution.service');
const ventureTrajectory = require('./ventureTrajectory.service');
const decisionAccuracy = require('./decisionAccuracy.service');
const ventureDependency = require('./ventureDependency.service');
const predictiveCapacity = require('./predictiveCapacity.service');
const strategicDrift = require('./strategicDrift.service');
const signalHistory = require('./signalHistory.service');

async function refreshObservatory() {
  const errors = [];
  const out = {};

  const steps = [
    ['signalHistory', async () => { out.signalHistory = await signalHistory.snapshotPortfolioSignals(); }],
    ['temporalSnapshots', async () => {
      // Capture key portfolio-level metrics into temporal_snapshots so
      // movement classifications work over time.
      const cap = require('./resourceCapacity.service');
      const snap = await cap.getLatestSnapshot();
      if (snap) {
        await temporalIntelligence.recordMetric('staffing_pressure', snap.staffingPressure);
        await temporalIntelligence.recordMetric('infra_pressure', snap.infraPressure);
        await temporalIntelligence.recordMetric('build_now_ventures', snap.buildNowVentures);
      }
      out.temporalSnapshots = { captured: snap ? 3 : 0 };
    }],
    ['ecosystems', async () => { out.ecosystems = await ecosystemEvolution.analyzeEcosystems(); }],
    ['trajectories', async () => { out.trajectories = await ventureTrajectory.classifyAllTrajectories(); }],
    ['decisionAccuracy', async () => { out.decisionAccuracy = await decisionAccuracy.computeAccuracy(); }],
    ['directionalEdges', async () => {
      out.directionalEdges = await ventureDependency.autoProposeDirectionalEdges();
    }],
    ['predictiveCapacity', async () => { out.predictiveCapacity = await predictiveCapacity.forecastAll(); }],
    ['driftAlerts', async () => { out.driftAlerts = await strategicDrift.detectDrift(); }],
  ];

  for (const [name, fn] of steps) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
    } catch (e) {
      errors.push({ step: name, error: e.message });
      logger.warn('observatoryIntelligence: step failed', { step: name, error: e.message });
    }
  }
  logger.info('observatoryIntelligence: refresh complete', { errors: errors.length });
  return { ok: errors.length === 0, errors, ...out };
}

// Movements to surface on the dashboard.
const WATCHED_METRICS = [
  'staffing_pressure', 'infra_pressure', 'build_now_ventures',
];

async function getObservatoryDashboard({ days = 90 } = {}) {
  const [
    historical, ecosystems, trajectories, accuracy, directedGraph, forecasts,
    drift, signals, movements,
  ] = await Promise.all([
    historicalPortfolio.getHistoricalAnalytics({ days }),
    ecosystemEvolution.getLatestEcosystems(),
    ventureTrajectory.getLatestTrajectories(),
    decisionAccuracy.getLatestAccuracy(),
    ventureDependency.getDirectedGraph(),
    predictiveCapacity.getLatestForecasts(),
    strategicDrift.listPendingAlerts(),
    signalHistory.getPortfolioTimelines({ days }),
    temporalIntelligence.summarizeMovements(WATCHED_METRICS, { days }),
  ]);
  return {
    historical, ecosystems, trajectories, decision_accuracy: accuracy,
    directed_graph: directedGraph, predictive_capacity: forecasts,
    drift_alerts: drift, signal_timelines: signals, temporal_movements: movements,
  };
}

module.exports = {
  WATCHED_METRICS,
  refreshObservatory,
  getObservatoryDashboard,
};
