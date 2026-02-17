const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { env, validateEnv } = require('./config/environment');
const { sequelize } = require('./models');
const errorHandler = require('./middleware/errorHandler.middleware');
const { generalLimiter } = require('./middleware/rateLimiter.middleware');
const { successResponse } = require('./utils/apiResponse');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const logger = require('./logging/logger');

// Validate environment variables before starting
validateEnv();

const app = express();

// ----- Global Middleware -----
app.use(helmet());
app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
}));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));
app.use(generalLimiter);

// ----- API Documentation -----
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Opportunity Pulse API Docs',
}));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// ----- Health Check -----
/**
 * @swagger
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/api/v1/health', (req, res) => {
  successResponse(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  }, 'Service is running');
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

    // Sync models in development (use migrations in production)
    if (env.nodeEnv === 'development') {
      await sequelize.sync({ alter: false });
      logger.info('Database models synchronized.');
    }

    app.listen(env.port, () => {
      logger.info(`Opportunity Pulse API running on port ${env.port} [${env.nodeEnv}]`);

      // Start ingestion scheduler after server is listening
      const { startScheduler } = require('./ingestion/scheduler');
      startScheduler();
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
