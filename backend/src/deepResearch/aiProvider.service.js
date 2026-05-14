// Deep Research Phase 2 — resilient AI provider layer.
//
// Phase 1 called getAIClient() directly. The OpenAI quota outage exposed
// that a single un-retried call is a single point of failure for the whole
// synthesis pipeline. This service wraps the AI client with:
//
//   - exponential backoff retry (with jitter) on transient failures
//   - typed error classification (rate_limit / auth / server / network / ...)
//   - per-attempt logging to ai_provider_logs (provider, model, status,
//     attempt, duration, tokens, error class) — full observability
//   - a provider abstraction seam: OpenAI is wired; Anthropic / Gemini /
//     local are documented stubs so a future fallback provider drops in
//     without touching any caller.
//
// Every Deep Research AI service calls aiProvider.chat() — never the raw
// client. Callers get back { content, tokensUsed, provider, attempts }.

const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');

// Retry policy. Tunable via env; zero delay under test so the suite is fast.
const MAX_ATTEMPTS = Number(process.env.DEEP_RESEARCH_AI_MAX_ATTEMPTS) || 3;
const BASE_DELAY_MS = process.env.NODE_ENV === 'test'
  ? 0
  : (Number(process.env.DEEP_RESEARCH_AI_BASE_DELAY_MS) || 600);
const DEFAULT_PROVIDER = process.env.DEEP_RESEARCH_AI_PROVIDER || 'openai';

// Error classes that are worth retrying — transient by nature.
const RETRYABLE = new Set(['rate_limit', 'server', 'network']);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Provider registry — the abstraction seam.
// ---------------------------------------------------------------------------
// Each provider exposes the same shape: { chat, embed, model }. Only OpenAI
// is wired today; the others are explicit, documented stubs so adding a real
// fallback provider is a localized change here — no caller touches a client.
const PROVIDERS = {
  openai: {
    get model() { return getAIClient().model; },
    chat: (system, user, opts) => getAIClient().chat(system, user, opts),
    embed: (input, opts) => getAIClient().embed(input, opts),
  },
  // SEAM — wire when an Anthropic key + client are added. Throwing (rather
  // than silently no-op'ing) keeps a misconfiguration loud.
  anthropic: {
    model: 'claude-not-configured',
    chat: () => { throw providerNotConfigured('anthropic'); },
    embed: () => { throw providerNotConfigured('anthropic'); },
  },
  gemini: {
    model: 'gemini-not-configured',
    chat: () => { throw providerNotConfigured('gemini'); },
    embed: () => { throw providerNotConfigured('gemini'); },
  },
};

function providerNotConfigured(name) {
  const err = new Error(`AI provider "${name}" is not configured`);
  err.code = 'PROVIDER_NOT_CONFIGURED';
  return err;
}

function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) throw providerNotConfigured(name);
  return provider;
}

// ---------------------------------------------------------------------------
// Error classification.
// ---------------------------------------------------------------------------
// Maps an arbitrary thrown error to one of the typed classes used for the
// retry decision + the ai_provider_logs.error_class column.
function classifyError(err) {
  const status = err && (err.status || err.statusCode);
  const msg = String((err && err.message) || '').toLowerCase();
  if (status === 429 || msg.includes('rate limit') || msg.includes('quota')) return 'rate_limit';
  if (status === 401 || status === 403 || msg.includes('api key') || msg.includes('unauthorized')) return 'auth';
  if (typeof status === 'number' && status >= 500) return 'server';
  if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('fetch failed')
    || msg.includes('socket hang up') || msg.includes('network')) return 'network';
  if (err && err.code === 'PROVIDER_NOT_CONFIGURED') return 'auth';
  return 'other';
}

// Best-effort attempt log. Never throws — observability must not be able to
// break the call it's observing.
async function logAttempt(row) {
  try {
    // Lazy require so a model-load issue can't break AI calls at import time.
    const { AiProviderLog } = require('../models');
    await AiProviderLog.create(row);
  } catch (e) {
    logger.warn('aiProvider: failed to write ai_provider_logs row', { error: e.message });
  }
}

// Backoff delay for a given (1-indexed) attempt: exponential + full jitter.
function backoffMs(attempt) {
  const exp = BASE_DELAY_MS * (2 ** (attempt - 1));
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

// ---------------------------------------------------------------------------
// The resilient call core — shared by chat() and embed().
// ---------------------------------------------------------------------------
async function resilientCall({
  providerName, operation, invoke,
}) {
  const provider = getProvider(providerName);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    try {
      const result = await invoke(provider);
      const durationMs = Date.now() - started;
      // Fire-and-forget the success log.
      logAttempt({
        provider: providerName,
        operation,
        model: provider.model,
        status: 'success',
        attempt,
        durationMs,
        tokensUsed: result.tokensUsed || 0,
      });
      return { ...result, provider: providerName, attempts: attempt };
    } catch (error) {
      const durationMs = Date.now() - started;
      const errorClass = classifyError(error);
      lastError = error;
      logAttempt({
        provider: providerName,
        operation,
        model: provider.model,
        status: 'failure',
        attempt,
        durationMs,
        errorClass,
        errorMessage: String(error.message || '').slice(0, 1000),
      });

      const canRetry = RETRYABLE.has(errorClass) && attempt < MAX_ATTEMPTS;
      if (!canRetry) {
        logger.warn('aiProvider: call failed, not retrying', {
          operation, errorClass, attempt, error: error.message,
        });
        // Annotate the error so callers can branch on it if they want.
        error.errorClass = errorClass;
        error.attempts = attempt;
        throw error;
      }
      const delay = backoffMs(attempt);
      logger.info('aiProvider: transient failure, retrying', {
        operation, errorClass, attempt, nextDelayMs: delay,
      });
      // eslint-disable-next-line no-await-in-loop
      await wait(delay);
    }
  }
  // Exhausted retries.
  if (lastError) {
    lastError.errorClass = classifyError(lastError);
    lastError.attempts = MAX_ATTEMPTS;
    throw lastError;
  }
  throw new Error('aiProvider: call failed with no error captured');
}

// Resilient chat. Same signature as ai.client.chat plus an optional
// `operation` label (for the logs) and `provider` override.
async function chat(systemPrompt, userPrompt, options = {}) {
  const { operation = 'chat', provider = DEFAULT_PROVIDER, ...chatOptions } = options;
  return resilientCall({
    providerName: provider,
    operation,
    invoke: (p) => p.chat(systemPrompt, userPrompt, chatOptions),
  });
}

// Resilient embed.
async function embed(input, options = {}) {
  const { operation = 'embed', provider = DEFAULT_PROVIDER, ...embedOptions } = options;
  return resilientCall({
    providerName: provider,
    operation,
    invoke: (p) => p.embed(input, embedOptions),
  });
}

module.exports = {
  // public API
  chat,
  embed,
  // exported for direct unit testing
  classifyError,
  backoffMs,
  getProvider,
  MAX_ATTEMPTS,
  RETRYABLE,
};
