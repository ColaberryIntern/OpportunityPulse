const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { env, validateEnv } = require('./config/environment');
const { initializeSocket } = require('./config/socket');
const { sequelize } = require('./models');
const errorHandler = require('./middleware/errorHandler.middleware');
const { generalLimiter } = require('./middleware/rateLimiter.middleware');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const logger = require('./logging/logger');
const { getRedisClient, isRedisConnected } = require('./config/redis');
const { register, httpRequestDuration, httpRequestTotal, activeConnections } = require('./config/metrics');

// Validate environment variables before starting
validateEnv();

const app = express();

// Trust proxy when behind reverse proxy (production nginx or dev CRA proxy)
app.set('trust proxy', 1);

// ----- Global Middleware -----
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [env.frontendUrl];
    if (process.env.CORS_ORIGINS) {
      allowed.push(...process.env.CORS_ORIGINS.split(',').map(s => s.trim()));
    }
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));
app.use(generalLimiter);

// ----- Prometheus Metrics Middleware -----
app.use((req, res, next) => {
  // Skip metrics collection for the /metrics endpoint itself
  if (req.path === '/metrics') return next();

  activeConnections.inc();
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    activeConnections.dec();
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestTotal.inc(labels);
  });

  next();
});

// ----- Prometheus Metrics Endpoint (no auth — internal only) -----
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ----- API Documentation -----
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Opportunity Pulse API Docs',
}));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// ----- Health Checks -----
/**
 * @swagger
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Quick liveness probe
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     tags: [System]
 *     summary: Deep readiness check (database, Redis)
 *     security: []
 *     responses:
 *       200:
 *         description: All components ready or degraded (Redis down)
 *       503:
 *         description: Unhealthy — database unreachable
 */
app.get('/api/v1/health/ready', async (req, res) => {
  const components = {};

  // Check database with 5-second timeout
  let dbStatus = 'down';
  let dbLatencyMs = null;
  try {
    const dbStart = Date.now();
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB health check timeout')), 5000)
      ),
    ]);
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = 'up';
  } catch (err) {
    logger.warn('Health check: database unreachable —', err.message);
  }
  components.database = { status: dbStatus, latencyMs: dbLatencyMs };

  // Check Redis
  const redisUp = isRedisConnected();
  components.redis = { status: redisUp ? 'up' : 'down' };

  // Determine overall status
  let overallStatus;
  let httpCode;
  if (dbStatus === 'down') {
    overallStatus = 'unhealthy';
    httpCode = 503;
  } else if (!redisUp) {
    overallStatus = 'degraded';
    httpCode = 200;
  } else {
    overallStatus = 'ready';
    httpCode = 200;
  }

  res.status(httpCode).json({
    status: overallStatus,
    components,
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
    uptime: process.uptime(),
  });
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     tags: [System]
 *     summary: Kubernetes-style liveness probe
 *     security: []
 *     responses:
 *       200:
 *         description: Process is alive
 */
app.get('/api/v1/health/live', (req, res) => {
  res.json({ status: 'alive', uptime: process.uptime() });
});

// ----- Feature Routes (mounted as they are built) -----
// Sprint 1: Auth routes
app.use('/api/v1/auth', require('./auth/auth.routes'));

// Sprint 2: Role management routes
app.use('/api/v1/roles', require('./roleManager/role.routes'));

// Sprint 3: Dashboard routes
app.use('/api/v1/dashboard', require('./dashboard/dashboard.routes'));

// Sprint 4: Content management routes
app.use('/api/v1/content', require('./contentManager/content.routes'));

// Sprint 5: Search routes
app.use('/api/v1/search', require('./search/search.routes'));

// Sprint 7: Opportunity read routes
app.use('/api/v1/opportunities', require('./opportunities/opportunity.routes'));

// Sprint 7: Ingestion routes
app.use('/api/v1/ingestion', require('./ingestion/ingestion.routes'));

// Sprint 8: Analysis routes
app.use('/api/v1/analysis', require('./analysis/analysis.routes'));

// Sprint 8: Alert routes
app.use('/api/v1/alerts', require('./alerts/alert.routes'));

// Sprint 9: Public opportunity browser (no auth)
app.use('/api/v1/public/opportunities', require('./public/public.routes'));

// Sprint 9: Alert preferences routes
app.use('/api/v1/alert-preferences', require('./alertPreferences/alertPref.routes'));

// Sprint 11: Feedback routes
app.use('/api/v1/feedback', require('./feedbackManager/feedback.routes'));

// Sprint 11: Forum routes
app.use('/api/v1/forums', require('./forums/forum.routes'));

// Sprint 15: Recommendations routes
app.use('/api/v1/recommendations', require('./recommendations/recommendation.routes'));

// Sprint 17: API Keys routes
app.use('/api/v1/api-keys', require('./apiKeys/apiKey.routes'));

// Sprint 17: Webhook routes
app.use('/api/v1/webhooks', require('./webhooks/webhook.routes'));

// Sprint 18: Adaptive learning routes
app.use('/api/v1/adaptive-learning', require('./adaptive/adaptive.routes'));

// Subscription management routes
app.use('/api/v1/subscriptions', require('./subscriptions/subscription.routes'));

// Sprint 20: Saved opportunities routes
app.use('/api/v1/saved-opportunities', require('./savedOpportunities/savedOpportunity.routes'));

// Sprint 20: Admin routes
app.use('/api/v1/admin', require('./admin/admin.routes'));

// Sprint 20: Notification routes
app.use('/api/v1/notifications', require('./notifications/notification.routes'));

// Sprint 24: Personal AI matches routes
app.use('/api/v1/personal-matches', require('./personalMatch/personalMatch.routes'));

// Sprint 25: AI Tools routes
app.use('/api/v1/ai-tools', require('./aiTools/aiTool.routes'));

// Sprint 26: Strategic Action Engine routes
app.use('/api/v1/action-engine', require('./actionEngine/actionEngine.routes'));

// Intelligence Engine routes (multi-dimensional classification)
app.use('/api/v1/intelligence', require('./intelligence/intelligence.routes'));

// Freelance Demand Intelligence routes
app.use('/api/v1/freelance', require('./freelance/freelance.routes'));

// Resume upload & AI skill extraction
app.use('/api/v1/resume-upload', require('./resumeUpload/resumeUpload.routes'));

// Bonfire Opportunity Engine (prototype, gated by BONFIRE_ENGINE_ENABLED env flag)
app.use('/api/v1/bonfire', require('./bonfire/bonfire.routes'));

// OIED — Opportunity Intelligence & Execution Department
// (My Opportunities, action generator, review queue, events)
app.use('/api/v1/oied', require('./oied/oied.routes'));

// ----- 404 Handler -----
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.path} not found`,
    code: 404,
  });
});

// ----- Global Error Handler -----
app.use(errorHandler);

// ----- Start Server -----
async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');

    // Initialize Redis (non-blocking — cache is optional)
    if (env.nodeEnv !== 'test') {
      getRedisClient();
    }

    // Sync models in development (use migrations in production)
    if (env.nodeEnv === 'development') {
      await sequelize.sync({ alter: false });
      logger.info('Database models synchronized.');

      // Seed AI tools data if table is empty (idempotent)
      const { seedAiTools } = require('./aiTools/seed');
      await seedAiTools();
    }

    const httpServer = http.createServer(app);

    // Initialize Socket.IO (skip in test environment)
    if (env.nodeEnv !== 'test') {
      initializeSocket(httpServer);
    }

    httpServer.listen(env.port, () => {
      logger.info(`Opportunity Pulse API running on port ${env.port} [${env.nodeEnv}]`);

      // Start ingestion scheduler after server is listening
      const { startScheduler } = require('./ingestion/scheduler');
      startScheduler();

      // Start AI Tools trend analysis scheduler
      const { startAiToolsScheduler } = require('./aiTools/scheduler');
      startAiToolsScheduler();

      // Start email digest scheduler
      const { startDigestScheduler } = require('./emailDigest/emailDigest.scheduler');
      startDigestScheduler();

      // Start Action Engine scheduler (classification, saturation, recommendations, brief)
      const { startActionEngineScheduler } = require('./actionEngine/actionEngine.scheduler');
      startActionEngineScheduler();

      // Start Intelligence Engine scheduler (domain, capability, intent, monetization, maturity, geo, signals, clusters)
      const { startIntelligenceScheduler } = require('./intelligence/intelligence.scheduler');
      startIntelligenceScheduler();

      // Start Freelance Demand Intelligence scheduler (ingestion, classification+scoring, trends)
      const { startFreelanceScheduler } = require('./freelance/freelance.scheduler');
      startFreelanceScheduler();

      // Start Bonfire scraper scheduler (no-op unless both BONFIRE_SCRAPER_ENABLED
      // and BONFIRE_SCRAPER_CRON_ENABLED are true).
      const { startBonfireScraperScheduler } = require('./bonfire/scraper.scheduler');
      startBonfireScraperScheduler();

      // Start Bonfire strategist scheduler — runs an hour after the scraper
      // (default 08:00 M/W/F) to produce curated strategic opportunities.
      const { startBonfireStrategistScheduler } = require('./bonfire/bonfireStrategist.scheduler');
      startBonfireStrategistScheduler();

      // OIED daily digest — top-5 opportunities by fit_score emailed daily 08:00.
      // OFF by default; enable with OIED_DIGEST_ENABLED=true.
      const { startOiedDigestScheduler } = require('./oied/oied.scheduler');
      startOiedDigestScheduler();

      // OIED v4: daily briefing (top-3 + bundle + ignore + totals) and the
      // auto-execution trigger engine. Both default OFF and dry-run-first.
      const { startBriefingScheduler } = require('./oied/briefing.scheduler');
      startBriefingScheduler();
      const { startTriggerEngineScheduler } = require('./oied/triggerEngine.scheduler');
      startTriggerEngineScheduler();

      // OIED v5: weekly summary email (wins / losses / insights). Default OFF.
      const { startWeeklySummaryScheduler } = require('./oied/weeklySummary.scheduler');
      startWeeklySummaryScheduler();

      // OIED v9.7: persisted keyword trends. Twice-daily cron computes the
      // validated keyword cloud into keyword_trends. Default OFF —
      // enable with OIED_KEYWORD_TRENDS_ENABLED=true.
      const { startKeywordTrendScheduler } = require('./oied/keywordTrend.scheduler');
      startKeywordTrendScheduler();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start if this file is run directly (not imported for testing)
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
