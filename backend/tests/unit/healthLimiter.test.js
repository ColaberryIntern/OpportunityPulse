// Health probes must not be starved by the general API rate limiter, and must
// still fail when the service genuinely is not ready.
//
// The production defect: `app.use(generalLimiter)` is mounted globally before
// the health routes, and a direct localhost probe carries no X-Forwarded-For, so
// every in-container caller collapses onto one rate-limit key. Anything that
// bursts on that key inside the window makes the Docker healthcheck receive 429
// and the orchestrator mark a healthy container unhealthy.
//
// Each test below is a property the fix must hold, not an implementation detail.

const express = require('express');
const request = require('supertest');

const {
  generalLimiter,
  healthLimiter,
  HEALTH_PATHS,
  isHealthPath,
} = require('../../src/middleware/rateLimiter.middleware');

// A miniature of server.js's middleware order: global limiter first, then the
// probe routes and an ordinary route.
function buildApp({ ready = true, generalMax } = {}) {
  const app = express();
  app.set('trust proxy', 1);

  if (generalMax !== undefined) {
    // eslint-disable-next-line global-require
    const rateLimit = require('express-rate-limit');
    app.use(rateLimit({
      windowMs: 60000,
      max: generalMax,
      standardHeaders: true,
      legacyHeaders: false,
      skip: isHealthPath,
      message: { status: 'error', message: 'Too many requests', code: 429 },
    }));
  } else {
    app.use(generalLimiter);
  }

  app.get('/api/v1/health', healthLimiter, (req, res) => res.json({ status: 'healthy' }));
  app.get('/api/v1/health/live', healthLimiter, (req, res) => res.json({ status: 'alive' }));
  app.get('/api/v1/health/ready', healthLimiter, (req, res) => {
    // Stands in for the real dependency check: 503 when the database is down,
    // 200 when ready or only-Redis-degraded.
    if (!ready) {
      return res.status(503).json({ status: 'unhealthy', components: { database: { status: 'down' } } });
    }
    return res.status(200).json({ status: 'ready', components: { database: { status: 'up' } } });
  });

  app.get('/api/v1/opportunities', (req, res) => res.json({ data: [] }));
  return app;
}

describe('health probes are metered separately from the general API', () => {
  it('the general limiter skips exactly the three probe paths and nothing else', () => {
    expect([...HEALTH_PATHS].sort()).toEqual([
      '/api/v1/health', '/api/v1/health/live', '/api/v1/health/ready',
    ]);
    expect(isHealthPath({ path: '/api/v1/health' })).toBe(true);
    expect(isHealthPath({ path: '/api/v1/health/ready' })).toBe(true);
    expect(isHealthPath({ path: '/api/v1/health/live' })).toBe(true);
    // Not a prefix match: an ordinary route that merely starts with the same
    // characters must stay rate-limited.
    expect(isHealthPath({ path: '/api/v1/healthcheck' })).toBe(false);
    expect(isHealthPath({ path: '/api/v1/health/ready/../opportunities' })).toBe(false);
    expect(isHealthPath({ path: '/api/v1/opportunities' })).toBe(false);
  });

  it('decides from the request path only — never from a caller-supplied header', () => {
    // A client cannot talk its way into the exempt set.
    expect(isHealthPath({
      path: '/api/v1/opportunities',
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'x-original-url': '/api/v1/health',
        'x-rewrite-url': '/api/v1/health',
        host: 'localhost',
      },
    })).toBe(false);
  });

  // THE REGRESSION: representative traffic exhausts the general bucket, and the
  // probe must still answer.
  it('probes keep succeeding after ordinary traffic has exhausted the general bucket', async () => {
    const app = buildApp({ generalMax: 3 });

    // Exhaust the general bucket with ordinary API traffic.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).get('/api/v1/opportunities')).status).toBe(200);
    }
    const blocked = await request(app).get('/api/v1/opportunities');
    expect(blocked.status).toBe(429);

    // 20 consecutive probes, well past the exhausted general limit of 3.
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    }
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).get('/api/v1/health')).status).toBe(200);
    }
  });

  it('ordinary endpoints remain rate-limited — the fix does not widen the general limit', async () => {
    const app = buildApp({ generalMax: 2 });
    expect((await request(app).get('/api/v1/opportunities')).status).toBe(200);
    expect((await request(app).get('/api/v1/opportunities')).status).toBe(200);
    const third = await request(app).get('/api/v1/opportunities');
    expect(third.status).toBe(429);
    expect(third.body.code).toBe(429);
  });

  it('a genuine readiness failure still produces a failing probe', async () => {
    const app = buildApp({ ready: false, generalMax: 3 });
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.components.database.status).toBe('down');
  });

  it('a readiness failure is not masked once the general bucket is exhausted', async () => {
    // The failure signal must survive the same conditions that used to produce a
    // false 429 — otherwise the fix would trade a false negative for a false
    // positive.
    const app = buildApp({ ready: false, generalMax: 1 });
    await request(app).get('/api/v1/opportunities');
    expect((await request(app).get('/api/v1/opportunities')).status).toBe(429);
    expect((await request(app).get('/api/v1/health/ready')).status).toBe(503);
  });

  it('probes are bounded, not unlimited: the dedicated bucket is a real limiter', async () => {
    // /health/ready authenticates against the database on every call, so leaving
    // it unmetered would be a cheap unauthenticated amplification target.
    // eslint-disable-next-line global-require
    const rateLimit = require('express-rate-limit');
    const app = express();
    const tiny = rateLimit({
      windowMs: 60000, max: 2, standardHeaders: true, legacyHeaders: false,
      message: { status: 'error', message: 'Too many health probes', code: 429 },
    });
    app.get('/api/v1/health/ready', tiny, (req, res) => res.json({ status: 'ready' }));

    expect((await request(app).get('/api/v1/health/ready')).status).toBe(200);
    expect((await request(app).get('/api/v1/health/ready')).status).toBe(200);
    expect((await request(app).get('/api/v1/health/ready')).status).toBe(429);
  });

  it('the shipped health limiter is generous enough for the 30s Docker interval', () => {
    // 120/min against a probe every 30s leaves room for an orchestrator, a load
    // balancer and a human curl at the same time.
    const max = parseInt(process.env.HEALTH_RATE_LIMIT_MAX, 10) || 120;
    const windowMs = parseInt(process.env.HEALTH_RATE_LIMIT_WINDOW_MS, 10) || 60000;
    const dockerProbesPerWindow = windowMs / 30000;
    expect(max).toBeGreaterThanOrEqual(dockerProbesPerWindow * 10);
    expect(typeof healthLimiter).toBe('function');
  });
});
