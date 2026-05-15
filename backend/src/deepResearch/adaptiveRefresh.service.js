// Deep Research Phase 6 — automated safe refresh framework.
//
// SAFE-BY-DESIGN. Refreshes regenerate analytics + recommendations. They
// DO NOT:
//   - move a venture's lifecycle state
//   - reprioritize automatically
//   - execute any recommendation
//   - re-tune any scoring weight
//   - auto-launch or auto-build anything
//
// Behaviour:
//   - Each step is independently failable (one bad step does not abort the run).
//   - Full step lifecycle is persisted in refresh_history.
//   - A run row in adaptive_refresh_runs carries duration, status, errors.
//   - Opt-in via DEEP_RESEARCH_ADAPTIVE_REFRESH_ENABLED=true.
//   - Cron schedule from DEEP_RESEARCH_ADAPTIVE_REFRESH_CRON (default 30 3 * * *).
//   - Resumable: every run is fresh; idempotent step writes (per-key upsert
//     in each downstream service).

const logger = require('../logging/logger');
const portfolioIntelligence = require('./portfolioIntelligence.service');
const observatoryIntelligence = require('./observatoryIntelligence.service');
const confidenceDecay = require('./confidenceDecay.service');
const executiveIntervention = require('./executiveIntervention.service');
const strategicRecommendation = require('./strategicRecommendation.service');
const ventureHealth = require('./ventureHealth.service');
const forecastReality = require('./forecastReality.service');
const operationalDrift = require('./operationalDrift.service');
const refreshHistory = require('./refreshHistory.service');

const FULL_STEPS = [
  ['portfolio_refresh', () => portfolioIntelligence.refreshPortfolio()],
  ['observatory_refresh', () => observatoryIntelligence.refreshObservatory()],
  ['confidence_decay', () => confidenceDecay.runDecayPass()],
  ['venture_health', () => ventureHealth.refreshHealth()],
  ['forecast_accuracy', () => forecastReality.refreshForecastAccuracy()],
  ['operational_drift', () => operationalDrift.refreshDrift()],
  ['intervention_recommendations', () => executiveIntervention.refreshInterventions()],
  ['strategic_recommendations', () => strategicRecommendation.refreshRecommendations()],
];

const STEP_SETS = {
  full: FULL_STEPS,
  portfolio: [
    ['portfolio_refresh', () => portfolioIntelligence.refreshPortfolio()],
    ['venture_health', () => ventureHealth.refreshHealth()],
    ['intervention_recommendations', () => executiveIntervention.refreshInterventions()],
    ['strategic_recommendations', () => strategicRecommendation.refreshRecommendations()],
  ],
  observatory: [
    ['observatory_refresh', () => observatoryIntelligence.refreshObservatory()],
    ['operational_drift', () => operationalDrift.refreshDrift()],
  ],
  decay: [
    ['confidence_decay', () => confidenceDecay.runDecayPass()],
  ],
};

async function runRefresh({ runType = 'full', trigger = 'manual' } = {}) {
  const steps = STEP_SETS[runType] || FULL_STEPS;
  const run = await refreshHistory.startRun({ runType, trigger });
  const results = {};
  const errors = [];
  for (const [name, fn] of steps) {
    const stepStart = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await fn();
      results[name] = summarizeResult(result);
      // eslint-disable-next-line no-await-in-loop
      await refreshHistory.recordStep(run.id, {
        stepName: name, status: 'success',
        durationMs: Date.now() - stepStart,
        metadata: results[name],
      });
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      errors.push({ step: name, error: message });
      logger.warn('adaptiveRefresh: step failed', { step: name, error: message });
      // eslint-disable-next-line no-await-in-loop
      await refreshHistory.recordStep(run.id, {
        stepName: name, status: 'failed',
        durationMs: Date.now() - stepStart,
        errorMessage: message,
      });
    }
  }
  const status = errors.length === 0 ? 'success' : (errors.length === steps.length ? 'failed' : 'partial');
  await refreshHistory.completeRun(run.id, {
    status, results, errors, stepCount: steps.length,
  });
  logger.info('adaptiveRefresh: run complete', {
    runId: run.id, runType, status, errors: errors.length,
  });
  return { runId: run.id, status, errors, results };
}

function summarizeResult(result) {
  if (!result) return null;
  // Keep only top-level counts so refresh_history.metadata stays small.
  const summary = {};
  for (const key of Object.keys(result)) {
    const v = result[key];
    if (typeof v === 'number') summary[key] = v;
    else if (Array.isArray(v)) summary[`${key}_count`] = v.length;
    else if (v && typeof v === 'object' && Array.isArray(v.results)) {
      summary[`${key}_count`] = v.results.length;
    }
  }
  return summary;
}

let cronTaskRef = null;

function startScheduler() {
  if (process.env.DEEP_RESEARCH_ADAPTIVE_REFRESH_ENABLED !== 'true') {
    logger.info('adaptiveRefresh: scheduler disabled (set DEEP_RESEARCH_ADAPTIVE_REFRESH_ENABLED=true to enable)');
    return null;
  }
  if (cronTaskRef) return cronTaskRef;
  const cronExpr = process.env.DEEP_RESEARCH_ADAPTIVE_REFRESH_CRON || '30 3 * * *';
  // eslint-disable-next-line global-require
  const cron = require('node-cron');
  if (!cron.validate(cronExpr)) {
    logger.warn('adaptiveRefresh: invalid cron expression; scheduler not started', { cronExpr });
    return null;
  }
  cronTaskRef = cron.schedule(cronExpr, async () => {
    try {
      await runRefresh({ runType: 'full', trigger: 'cron' });
    } catch (e) {
      logger.error('adaptiveRefresh: cron run failed', { error: e.message });
    }
  });
  logger.info('adaptiveRefresh: scheduler started', { cronExpr });
  return cronTaskRef;
}

function stopScheduler() {
  if (cronTaskRef) {
    cronTaskRef.stop();
    cronTaskRef = null;
  }
}

module.exports = {
  FULL_STEPS, STEP_SETS,
  runRefresh, summarizeResult,
  startScheduler, stopScheduler,
};
