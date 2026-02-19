const rateLimit = require('express-rate-limit');

/**
 * General rate limiter for all API endpoints.
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,
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

module.exports = { generalLimiter, authLimiter, analysisLimiter, searchLimiter, apiKeyCreationLimiter };
