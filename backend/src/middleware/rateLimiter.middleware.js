const rateLimit = require('express-rate-limit');

/**
 * General rate limiter for all API endpoints.
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
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
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later.',
    code: 429,
  },
});

module.exports = { generalLimiter, authLimiter };
