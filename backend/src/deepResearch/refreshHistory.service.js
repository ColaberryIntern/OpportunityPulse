// Deep Research Phase 6 — refresh run lifecycle helper.
//
// Wraps adaptive_refresh_runs + refresh_history into a tiny startRun /
// recordStep / completeRun API used by the adaptive refresh orchestrator.
// Append-only, deterministic, resumable: every run is one DB row + N step
// rows, never mutated post-completion.

const { AdaptiveRefreshRun, RefreshHistory } = require('../models');

async function startRun({ runType = 'full', trigger = 'manual' } = {}) {
  const run = await AdaptiveRefreshRun.create({
    runType, trigger, status: 'running', startedAt: new Date(),
    stepCount: 0, errorCount: 0, results: {}, errors: [],
  });
  return run;
}

async function recordStep(runId, { stepName, status, durationMs = null, errorMessage = null, metadata = {} }) {
  await RefreshHistory.create({
    runId, stepName, status, durationMs, errorMessage, metadata,
  });
}

async function completeRun(runId, { status, results = {}, errors = [], stepCount = 0 }) {
  const run = await AdaptiveRefreshRun.findByPk(runId);
  if (!run) return null;
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - new Date(run.startedAt).getTime();
  await run.update({
    status, durationMs, stepCount, errorCount: errors.length,
    results, errors, completedAt,
  });
  return run;
}

async function listRecentRuns({ limit = 20 } = {}) {
  const rows = await AdaptiveRefreshRun.findAll({
    order: [['started_at', 'DESC']], limit,
  });
  return rows.map((r) => r.toJSON());
}

async function getRunDetail(runId) {
  const run = await AdaptiveRefreshRun.findByPk(runId);
  if (!run) return null;
  const steps = await RefreshHistory.findAll({
    where: { runId }, order: [['created_at', 'ASC']],
  });
  return { run: run.toJSON(), steps: steps.map((s) => s.toJSON()) };
}

module.exports = {
  startRun, recordStep, completeRun, listRecentRuns, getRunDetail,
};
