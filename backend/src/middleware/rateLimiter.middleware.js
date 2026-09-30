const rateLimit = require('express-rate-limit');

/**
 * General rate limiter for all API endpoints.
 */
/**
 * Container and orchestrator probe paths.
 *
 * Derived from the request LINE (req.path), never from a caller-supplied header,
 * so nothing a client sends can move a request into this set.
 */
const HEALTH_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/health/ready',
  '/api/v1/health/live',
]);

const isHealthPath = (req) => HEALTH_PATHS.has(req.path);

/**
 * Probes get their OWN bucket, they are not exempt.
 *
 * Why they must not share the general bucket: the general limiter is keyed per
 * client, and a direct localhost probe has no X-Forwarded-For, so every
 * in-container caller collapses onto one key. When anything bursts on that key
 * inside the window, the Docker healthcheck receives 429 and the orchestrator
 * marks a perfectly healthy container unhealthy. Observed in production: the
 * probe returned 429 with two failing probe exits, and 35 minutes later the same
 * probe returned 200 with `ratelimit-remaining: 475` once the window reset.
 *
 * Why NOT simply exempt them: /api/v1/health/ready authenticates against the
 * database on every call. An unlimited unauthenticated DB-touching endpoint is a
 * cheap amplification target. A dedicated, generous, still-bounded bucket fixes
 * the false-unhealthy signal without opening that door.
 *
 * Sized for probes, not for people: 120/minute is 60x the Docker probe's
 * 30-second interval, leaving room for an orchestrator, a load balancer and a
 * human curl at once.
 */
const healthLimiter = rateLimit({
  windowMs: parseInt(process.env.HEALTH_RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.HEALTH_RATE_LIMIT_MAX, 10) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many health probes, please try again later.',
    code: 429,
  },
});

const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,
  // Probe paths are metered by healthLimiter instead. Without this skip the
  // general bucket still counts them, which is the defect itself.
  skip: isHealthPath,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests, please try again later.',
    code: 429,
  },
});

/**
 * Stricter rate limiter for auth endpoints (login, register).
 */
const authLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later.',
    code: 429,
  },
});

/**
 * Rate limiter for OpenAI-powered analysis endpoints (scoring, trends, insights).
 */
const analysisLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: parseInt(process.env.ANALYSIS_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many analysis requests, please try again later.',
    code: 429,
  },
});

/**
 * Rate limiter for search endpoints (including natural language search via OpenAI).
 */
const searchLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: parseInt(process.env.SEARCH_RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many search requests, please try again later.',
    code: 429,
  },
});

/**
 * Rate limiter for API key creation to prevent spam.
 */
const apiKeyCreationLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: parseInt(process.env.API_KEY_CREATION_RATE_LIMIT_MAX, 10) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many API key creation requests, please try again later.',
    code: 429,
  },
});

module.exports = {
  generalLimiter,
  healthLimiter,
  authLimiter,
  analysisLimiter,
  searchLimiter,
  apiKeyCreationLimiter,
  HEALTH_PATHS,
  isHealthPath,
};
