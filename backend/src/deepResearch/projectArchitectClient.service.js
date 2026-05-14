// Deep Research Phase 3 — AI Project Architect (Agent Foundry) HTTP client.
//
// A real, production-shaped HTTP client for the Agent Foundry requirements-
// generation API. It is fully wired — retries, timeouts, resumable polling,
// artifact fetching, error classification — and targets a configurable
// endpoint (AGENT_FOUNDRY_API_URL + AGENT_FOUNDRY_API_KEY).
//
// Agent Foundry does not expose a public API yet, so on this deployment the
// client is "configured but not pointed at anything": isConfigured() returns
// false and every call throws NOT_CONFIGURED. The projectArchitectBridge
// catches that and falls back to the deterministic scaffold. The moment the
// env vars are set, the bridge uses this client instead — no caller change.
//
// Decoupled by design: the bridge depends only on this module's shape
// ({ isConfigured, createJob, pollJob, getArtifacts }), so swapping Agent
// Foundry for a different architect provider is a localized change here.

const logger = require('../logging/logger');

const BASE_URL = () => (process.env.AGENT_FOUNDRY_API_URL || '').replace(/\/+$/, '');
const API_KEY = () => process.env.AGENT_FOUNDRY_API_KEY || '';
const TIMEOUT_MS = Number(process.env.AGENT_FOUNDRY_TIMEOUT_MS) || 20000;
const MAX_ATTEMPTS = Number(process.env.AGENT_FOUNDRY_MAX_ATTEMPTS) || 3;
const BASE_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function notConfigured() {
  const err = new Error('Agent Foundry API is not configured (set AGENT_FOUNDRY_API_URL)');
  err.code = 'NOT_CONFIGURED';
  return err;
}

// Is the real Agent Foundry endpoint configured on this deployment?
function isConfigured() {
  return Boolean(BASE_URL());
}

// Classify a request failure for the retry decision.
function classifyError(err, status) {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (typeof status === 'number' && status >= 500) return 'server';
  const msg = String((err && err.message) || '').toLowerCase();
  if (msg.includes('abort') || msg.includes('timeout')) return 'timeout';
  if (msg.includes('fetch failed') || msg.includes('econnrefused') || msg.includes('network')) return 'network';
  return 'other';
}

const RETRYABLE = new Set(['rate_limit', 'server', 'timeout', 'network']);

// The resilient request core — timeout (AbortController) + exponential
// backoff retry on transient classes. Returns the parsed JSON body.
async function _request(method, path, body) {
  if (!isConfigured()) throw notConfigured();
  const url = `${BASE_URL()}${path}`;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY() ? { Authorization: `Bearer ${API_KEY()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errorClass = classifyError(null, res.status);
        const text = await res.text().catch(() => '');
        const err = new Error(`Agent Foundry ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
        err.status = res.status;
        err.errorClass = errorClass;
        if (RETRYABLE.has(errorClass) && attempt < MAX_ATTEMPTS) {
          lastError = err;
          // eslint-disable-next-line no-await-in-loop
          await wait(BASE_DELAY_MS * (2 ** (attempt - 1)));
          // eslint-disable-next-line no-continue
          continue;
        }
        throw err;
      }
      return await res.json();
    } catch (error) {
      clearTimeout(timer);
      const errorClass = error.errorClass || classifyError(error);
      error.errorClass = errorClass;
      if (RETRYABLE.has(errorClass) && attempt < MAX_ATTEMPTS) {
        lastError = error;
        logger.info('projectArchitectClient: transient failure, retrying', {
          method, path, errorClass, attempt,
        });
        // eslint-disable-next-line no-await-in-loop
        await wait(BASE_DELAY_MS * (2 ** (attempt - 1)));
        // eslint-disable-next-line no-continue
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Agent Foundry request failed');
}

// Normalize a remote job response into the shape the bridge expects.
function normalizeJob(remote) {
  const r = remote || {};
  return {
    externalJobId: r.id || r.job_id || r.jobId || null,
    status: r.status || 'running',
    progressPercent: typeof r.progress_percent === 'number' ? r.progress_percent
      : (typeof r.progress === 'number' ? r.progress : null),
    currentPhase: r.current_phase || r.phase || null,
    artifactUrl: r.artifact_url || r.artifactUrl || r.project_url || null,
    requirements: r.requirements || r.requirements_json || null,
  };
}

// Create a requirements-generation job. `payload` is the venture-aware
// requirements context built by the bridge.
async function createJob(payload) {
  const remote = await _request('POST', '/api/v1/jobs', { requirements: payload });
  const job = normalizeJob(remote);
  logger.info('projectArchitectClient: job created', { externalJobId: job.externalJobId });
  return job;
}

// Poll a job's status. Resumable — safe to call repeatedly; the remote job
// id is the only state needed.
async function pollJob(externalJobId) {
  if (!externalJobId) {
    const err = new Error('externalJobId is required to poll');
    err.code = 'BAD_INPUT';
    throw err;
  }
  const remote = await _request('GET', `/api/v1/jobs/${encodeURIComponent(externalJobId)}`);
  return normalizeJob(remote);
}

// Fetch the generated artifacts for a completed job.
async function getArtifacts(externalJobId) {
  if (!externalJobId) {
    const err = new Error('externalJobId is required');
    err.code = 'BAD_INPUT';
    throw err;
  }
  return _request('GET', `/api/v1/jobs/${encodeURIComponent(externalJobId)}/artifacts`);
}

module.exports = {
  isConfigured,
  classifyError,
  normalizeJob,
  createJob,
  pollJob,
  getArtifacts,
  RETRYABLE,
};
